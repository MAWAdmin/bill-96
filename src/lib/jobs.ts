import "server-only";
import fs from "node:fs";
import path from "node:path";
import { SCAN_CONCURRENCY, SCREENSHOT_DIR, translationProvider } from "./config";
import { json, query, queryOne } from "./db";
import { sha256 } from "./crypto";
import { discoverUrls } from "./scanner/discover";
import { scanPage, type PageResult } from "./scanner/scanPage";
import { SEVERITY_ORDER, type Severity } from "./scanner/types";
import { rollUpSiteScore, type RiskBand } from "./siteScore";
import { getConnector, openConfig } from "./connectors";
import { draftTranslations } from "./translate";

/**
 * In-process job queue. Scans run one at a time (pages within a scan run with
 * SCAN_CONCURRENCY). State lives on globalThis so dev hot-reloads don't spawn
 * a second queue. For multi-instance deployments, move this to a dedicated
 * worker process that polls `scans WHERE status = 'queued'`.
 */

interface QueueState {
  queue: string[];
  running: boolean;
  current?: string | null;
}
const g = globalThis as unknown as { __b96jobs?: QueueState };
const state: QueueState = (g.__b96jobs ??= { queue: [], running: false });

export { SCREENSHOT_DIR };

export function enqueueScan(scanId: string) {
  state.queue.push(scanId);
  void pump();
}

/** Scans ahead of this one (0 = running now), or null when it isn't queued. */
export function queuePosition(scanId: string): number | null {
  if (state.current === scanId) return 0;
  const i = state.queue.indexOf(scanId);
  return i < 0 ? null : i + (state.current ? 1 : 0);
}

async function pump() {
  if (state.running) return;
  state.running = true;
  try {
    while (state.queue.length) {
      const id = state.queue.shift()!;
      state.current = id;
      try {
        await runScan(id);
      } catch (e) {
        await query(`UPDATE scans SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [
          id,
          e instanceof Error ? e.message : String(e),
        ]).catch(() => {});
      } finally {
        state.current = null;
      }
    }
  } finally {
    state.running = false;
  }
}

interface SiteRow {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  platform: string;
  connector_config: string | null;
  glossary: string;
  auto_translate: boolean;
}

async function isCancelled(scanId: string) {
  const r = await queryOne<{ status: string }>(`SELECT status FROM scans WHERE id = $1`, [scanId]);
  return r?.status === "cancelled";
}

/**
 * Free-scan (public) scans have no site until claimed at signup: they skip
 * screenshots, keep their English strings in public_scan_strings, and draft
 * French for the first PUBLIC_DRAFT_COUNT strings before completing.
 */
async function runScan(scanId: string) {
  const scan = await queryOne<{ id: string; site_id: string | null; mode: string; input_urls: string[]; max_pages: number; status: string }>(
    `SELECT id, site_id, mode, input_urls, max_pages, status FROM scans WHERE id = $1`,
    [scanId]
  );
  if (!scan || scan.status !== "queued") return;
  const site = scan.site_id ? (await queryOne<SiteRow>(`SELECT * FROM sites WHERE id = $1`, [scan.site_id]))! : null;
  await query(`UPDATE scans SET status = 'running', started_at = now() WHERE id = $1`, [scanId]);

  let urls: string[] = scan.input_urls;
  if (scan.mode === "sitemap") {
    const baseUrl = site?.base_url ?? scan.input_urls[0];
    const extra = site
      ? await getConnector(site.platform).discoverUrls(site.base_url, openConfig(site.connector_config), scan.max_pages).catch(() => [])
      : [];
    const found = await discoverUrls(baseUrl, scan.max_pages);
    urls = [...new Set([...extra, ...found])].slice(0, scan.max_pages);
  }
  await query(`UPDATE scans SET pages_total = $2 WHERE id = $1`, [scanId, urls.length]);
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const reciprocityCache = new Map<string, Promise<any>>();
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      if (await isCancelled(scanId)) return;
      const url = urls[next++];
      const result = await scanPage(url, { reciprocityCache, screenshot: site ? undefined : false });
      if (result.skipped) {
        await query(`UPDATE scans SET pages_total = pages_total - 1 WHERE id = $1`, [scanId]);
        continue;
      }
      await savePage(scanId, site, result);
      await query(`UPDATE scans SET pages_done = pages_done + 1 WHERE id = $1`, [scanId]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, urls.length || 1) }, worker));

  if (await isCancelled(scanId)) return;
  const summary = await summarize(scanId, !site);
  if (!site) await draftPublicStrings(scanId, new URL(scan.input_urls[0]).host).catch(() => {});
  // Free scans show the severity-weighted site score; app scans keep the page average.
  await query(
    `UPDATE scans SET status = 'completed', score = $2, summary = $3::jsonb, finished_at = now() WHERE id = $1`,
    [scanId, site ? summary.score : summary.siteScore, json(summary)]
  );

  if (site?.auto_translate) {
    await generateDrafts(site.id).catch(() => {});
  }
}

async function savePage(scanId: string, site: SiteRow | null, r: PageResult) {
  const page = (await queryOne<{ id: string }>(
    `INSERT INTO pages (scan_id, url, final_url, http_status, title, html_lang, page_language, score, metrics, hreflang, blocks, console_errors, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13) RETURNING id`,
    [
      scanId,
      r.url,
      r.finalUrl,
      r.httpStatus,
      r.title,
      r.htmlLang,
      r.language,
      r.score,
      json(r.metrics),
      json(r.hreflang),
      // Keep the most prominent blocks for the page detail view.
      json([...r.blocks].sort((a, b) => b.prominence - a.prominence).slice(0, 400)),
      json(r.consoleErrors),
      r.error,
    ]
  ))!;

  if (r.screenshot) {
    fs.writeFileSync(path.join(SCREENSHOT_DIR, `${page.id}.jpg`), r.screenshot);
    await query(`UPDATE pages SET has_screenshot = true WHERE id = $1`, [page.id]);
  }

  for (const i of r.issues) {
    await query(`INSERT INTO issues (scan_id, page_id, code, severity, message, details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [
      scanId,
      page.id,
      i.code,
      i.severity,
      i.message,
      json(i.details ?? null),
    ]);
  }

  if (!site) {
    for (const c of r.candidates) {
      await query(
        `INSERT INTO public_scan_strings (scan_id, source_hash, source_text, kind, context, first_seen_url)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (scan_id, source_hash, kind) DO UPDATE SET occurrences = public_scan_strings.occurrences + 1`,
        [scanId, sha256(c.text), c.text, c.kind, c.context, r.finalUrl || r.url]
      );
    }
    return;
  }
  for (const c of r.candidates) {
    await query(
      `INSERT INTO translation_items (site_id, source_hash, source_text, kind, context, first_seen_url, last_seen_scan_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (site_id, source_hash, kind) DO UPDATE SET
         occurrences = CASE WHEN translation_items.last_seen_scan_id = EXCLUDED.last_seen_scan_id
                            THEN translation_items.occurrences + 1 ELSE 1 END,
         last_seen_scan_id = EXCLUDED.last_seen_scan_id,
         updated_at = now()`,
      [site.id, sha256(c.text), c.text, c.kind, c.context, r.finalUrl || r.url, scanId]
    );
  }
}

export interface ScanSummary {
  score: number;
  pages: number;
  failedPages: number;
  bySeverity: Record<string, number>;
  byCode: Record<string, number>;
  byLanguage: Record<string, number>;
  translationCandidates: number;
  siteScore: number | null;
  riskBand: RiskBand | null;
}

async function summarize(scanId: string, isPublic = false): Promise<ScanSummary> {
  const pages = await query<{ score: number; page_language: string | null; error: string | null; worst: Severity | null }>(
    `SELECT p.score, p.page_language, p.error,
            (SELECT i.severity FROM issues i WHERE i.page_id = p.id
             ORDER BY array_position(ARRAY['critical','high','medium','low','info'], i.severity) LIMIT 1) AS worst
     FROM pages p WHERE p.scan_id = $1`,
    [scanId]
  );
  const issues = await query<{ code: string; severity: string; n: string }>(
    `SELECT code, severity, count(*) AS n FROM issues WHERE scan_id = $1 GROUP BY code, severity`,
    [scanId]
  );
  const cand = await queryOne<{ n: string }>(
    isPublic
      ? `SELECT count(*) AS n FROM public_scan_strings WHERE scan_id = $1`
      : `SELECT count(*) AS n FROM translation_items WHERE last_seen_scan_id = $1`,
    [scanId]
  );
  const bySeverity: Record<string, number> = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  const byCode: Record<string, number> = {};
  for (const i of issues) {
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + Number(i.n);
    byCode[i.code] = (byCode[i.code] ?? 0) + Number(i.n);
  }
  const byLanguage: Record<string, number> = {};
  for (const p of pages) byLanguage[p.page_language ?? "failed"] = (byLanguage[p.page_language ?? "failed"] ?? 0) + 1;
  const score = pages.length ? Math.round(pages.reduce((n, p) => n + (p.score ?? 0), 0) / pages.length) : 0;
  const site = rollUpSiteScore(pages.map((p) => ({ score: p.score ?? 0, worst: p.worst, failed: !!p.error })));
  return {
    score,
    pages: pages.length,
    failedPages: pages.filter((p) => p.error).length,
    bySeverity,
    byCode,
    byLanguage,
    translationCandidates: Number(cand?.n ?? 0),
    siteScore: site.score,
    riskBand: site.band,
  };
}

/** How many strings the free scan drafts and shows before signup. */
export const PUBLIC_DRAFT_COUNT = 10;
/** Order the free scan shows strings in: most repeated, then shortest (UI labels first). */
export const PUBLIC_STRING_ORDER = "occurrences DESC, length(source_text) ASC, created_at, id";

/** Drafts the strings the free-scan results page shows. Falls back to mock drafts without an API key. */
async function draftPublicStrings(scanId: string, siteName: string) {
  const items = await query<{ id: string; source_text: string; kind: string; context: string | null }>(
    `SELECT id, source_text, kind, context FROM public_scan_strings WHERE scan_id = $1
     ORDER BY ${PUBLIC_STRING_ORDER} LIMIT ${PUBLIC_DRAFT_COUNT}`,
    [scanId]
  );
  if (!items.length) return;
  const res = await draftTranslations(
    items.map((it) => ({ id: it.id, text: it.source_text, kind: it.kind, context: it.context })),
    { siteName, provider: translationProvider() === "none" ? "mock" : undefined }
  );
  for (const it of items) {
    const d = res.drafts.get(it.id);
    if (d) await query(`UPDATE public_scan_strings SET draft_text = $2, provider = $3 WHERE id = $1`, [it.id, d, res.provider]);
  }
}

/**
 * Fills drafts for pending items: first from translation memory (an approved
 * translation of the same text on any of the owner's sites), then via Claude.
 */
export async function generateDrafts(siteId: string, itemIds?: string[]): Promise<{ drafted: number; error?: string }> {
  const site = await queryOne<SiteRow>(`SELECT * FROM sites WHERE id = $1`, [siteId]);
  if (!site) return { drafted: 0, error: "Site not found" };

  const items = await query<{ id: string; source_text: string; source_hash: string; kind: string; context: string | null }>(
    `SELECT id, source_text, source_hash, kind, context FROM translation_items
     WHERE site_id = $1 AND status = 'pending' ${itemIds ? "AND id = ANY($2::uuid[])" : ""}
     ORDER BY occurrences DESC, created_at LIMIT 400`,
    itemIds ? [siteId, itemIds] : [siteId]
  );
  if (!items.length) return { drafted: 0 };

  let drafted = 0;
  const remaining: typeof items = [];
  for (const it of items) {
    const mem = await queryOne<{ final_text: string }>(
      `SELECT t.final_text FROM translation_items t JOIN sites s ON s.id = t.site_id
       WHERE s.user_id = $1 AND t.source_hash = $2 AND t.status IN ('approved','published') AND t.final_text IS NOT NULL
       ORDER BY t.updated_at DESC LIMIT 1`,
      [site.user_id, it.source_hash]
    );
    if (mem) {
      await query(
        `UPDATE translation_items SET status = 'draft', draft_text = $2, provider = 'memory', error = NULL, updated_at = now() WHERE id = $1`,
        [it.id, mem.final_text]
      );
      drafted++;
    } else remaining.push(it);
  }

  if (!remaining.length) return { drafted };
  const res = await draftTranslations(
    remaining.map((it) => ({ id: it.id, text: it.source_text, kind: it.kind, context: it.context })),
    { siteName: site.name, glossary: site.glossary }
  );
  for (const it of remaining) {
    const d = res.drafts.get(it.id);
    if (d) {
      await query(
        `UPDATE translation_items SET status = 'draft', draft_text = $2, provider = $3, error = NULL, updated_at = now() WHERE id = $1`,
        [it.id, d, res.provider]
      );
      drafted++;
    } else if (res.error) {
      await query(`UPDATE translation_items SET error = $2, updated_at = now() WHERE id = $1`, [it.id, res.error]);
    }
  }
  return { drafted, error: res.error };
}
