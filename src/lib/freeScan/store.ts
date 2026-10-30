import "server-only";
import { json, query, queryOne } from "../db";
import { randomToken } from "../crypto";
import { isUuid } from "../access";
import { translationProvider } from "../config";
import { enqueueScan, generateDrafts, queuePosition, PUBLIC_DRAFT_COUNT, PUBLIC_STRING_ORDER, type ScanSummary } from "../jobs";
import { rankIssues, type IssueGroup } from "../siteScore";
import type { Severity } from "../scanner/types";
import { domainKey, domainQuota, MAX_ACTIVE_PUBLIC_SCANS, PUBLIC_SCAN_PAGES, SHARE_LINK_DAYS } from "./limits";
import { pushFreeScanLead } from "./hubspot";

/**
 * Free scans: public rows in `scans` (source = 'public', site_id and owner_id
 * NULL) that anyone can start, an email unlocks, and a signup with that email
 * claims into a real site and translation queue.
 */

export interface PublicScan {
  id: string;
  status: string;
  input_urls: string[];
  domain: string;
  pages_total: number;
  pages_done: number;
  score: number | null;
  summary: Partial<ScanSummary> | null;
  error: string | null;
  share_token: string | null;
  share_expires_at: Date | null;
  created_at: Date;
}

const COLUMNS = `id, status, input_urls, domain, pages_total, pages_done, score, summary, error, share_token, share_expires_at, created_at`;

export type StartResult =
  | { ok: true; id: string; position: number | null }
  | { ok: false; reason: "domain"; existingId: string; retryAfterSec: number }
  | { ok: false; reason: "busy" };

/** `homepage` must already have passed the SSRF guard. */
export async function startPublicScan(homepage: string): Promise<StartResult> {
  const domain = domainKey(homepage);
  const last = await queryOne<{ id: string; created_at: Date }>(
    `SELECT id, created_at FROM scans WHERE source = 'public' AND domain = $1 AND status <> 'failed'
     ORDER BY created_at DESC LIMIT 1`,
    [domain]
  );
  const quota = domainQuota(last?.created_at ?? null);
  if (!quota.allowed) return { ok: false, reason: "domain", existingId: last!.id, retryAfterSec: quota.retryAfterSec };
  const active = await queryOne<{ n: string }>(`SELECT count(*) AS n FROM scans WHERE source = 'public' AND status IN ('queued','running')`);
  if (Number(active?.n ?? 0) >= MAX_ACTIVE_PUBLIC_SCANS) return { ok: false, reason: "busy" };
  const scan = (await queryOne<{ id: string }>(
    `INSERT INTO scans (source, mode, input_urls, max_pages, domain) VALUES ('public', 'sitemap', $1::jsonb, $2, $3) RETURNING id`,
    [json([homepage]), PUBLIC_SCAN_PAGES, domain]
  ))!;
  enqueueScan(scan.id);
  return { ok: true, id: scan.id, position: queuePosition(scan.id) };
}

export async function getPublicScan(id: string): Promise<PublicScan | null> {
  if (!isUuid(id)) return null;
  return queryOne<PublicScan>(`SELECT ${COLUMNS} FROM scans WHERE id = $1 AND source = 'public'`, [id]);
}

export type PublicView = { kind: "scan"; scan: PublicScan; unlocked: boolean } | { kind: "expired" };

/** `/scan/:key`: a scan id shows the locked view, a share token the full one. */
export async function loadPublicView(key: string): Promise<PublicView | null> {
  if (isUuid(key)) {
    const scan = await getPublicScan(key);
    return scan ? { kind: "scan", scan, unlocked: false } : null;
  }
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(key)) return null;
  const scan = await queryOne<PublicScan & { expired: boolean }>(
    `SELECT ${COLUMNS}, share_expires_at <= now() AS expired FROM scans WHERE share_token = $1 AND source = 'public'`,
    [key]
  );
  if (!scan) return null;
  return scan.expired ? { kind: "expired" } : { kind: "scan", scan, unlocked: true };
}

export interface PublicString {
  id: string;
  source_text: string;
  kind: string;
  draft_text: string | null;
  provider: string | null;
}

export interface PublicResults {
  issues: IssueGroup[];
  /** Issues that need fixing (everything but "info"), counted once per page. */
  gaps: number;
  strings: PublicString[];
}

export async function loadPublicResults(scanId: string): Promise<PublicResults> {
  const rows = await query<{ code: string; severity: Severity; pages: string }>(
    `SELECT code,
            (array_agg(severity ORDER BY array_position(ARRAY['critical','high','medium','low','info'], severity)))[1] AS severity,
            count(DISTINCT page_id) AS pages
     FROM issues WHERE scan_id = $1 GROUP BY code`,
    [scanId]
  );
  const issues = rankIssues(rows.map((r) => ({ code: r.code, severity: r.severity, pages: Number(r.pages) })));
  const strings = await query<PublicString>(
    `SELECT id, source_text, kind, draft_text, provider FROM public_scan_strings WHERE scan_id = $1
     ORDER BY ${PUBLIC_STRING_ORDER} LIMIT ${PUBLIC_DRAFT_COUNT}`,
    [scanId]
  );
  return { issues, gaps: issues.filter((i) => i.severity !== "info").reduce((n, i) => n + i.pages, 0), strings };
}

export type UnlockResult = { ok: true; token: string; expiresAt: Date } | { ok: false; reason: "not_found" | "not_ready" };

/**
 * Saves the email (the first one wins, so a shared link can't be re-claimed
 * by someone else), issues or reuses the 30-day share token, and pushes the
 * lead to HubSpot.
 */
export async function unlockPublicScan(scanId: string, email: string, name: string | null): Promise<UnlockResult> {
  const expires = new Date(Date.now() + SHARE_LINK_DAYS * 86400_000);
  const row = await queryOne<{ share_token: string; share_expires_at: Date; input_urls: string[]; score: number | null }>(
    `UPDATE scans SET
       email = COALESCE(email, $2),
       share_token = CASE WHEN share_expires_at > now() THEN share_token ELSE $3 END,
       share_expires_at = CASE WHEN share_expires_at > now() THEN share_expires_at ELSE $4::timestamptz END
     WHERE id = $1 AND source = 'public' AND status = 'completed'
     RETURNING share_token, share_expires_at, input_urls, score`,
    [scanId, email, randomToken(), expires.toISOString()]
  );
  if (!row) return { ok: false, reason: (await getPublicScan(scanId)) ? "not_ready" : "not_found" };
  await pushFreeScanLead({ email, websiteUrl: row.input_urls[0], siteScore: row.score, name });
  return { ok: true, token: row.share_token, expiresAt: new Date(row.share_expires_at) };
}

/**
 * Signup hook: attaches the new user's unclaimed free scans to new sites (one
 * per domain) and copies their English strings into each site's translation
 * queue. Returns the number of scans claimed.
 */
export async function claimPublicScans(userId: string, email: string): Promise<number> {
  const scans = await query<{ id: string; domain: string; input_urls: string[] }>(
    `SELECT id, domain, input_urls FROM scans
     WHERE source = 'public' AND site_id IS NULL AND email = $1 AND status = 'completed' ORDER BY created_at`,
    [email]
  );
  const byDomain = new Map<string, typeof scans>();
  for (const s of scans) byDomain.set(s.domain, [...(byDomain.get(s.domain) ?? []), s]);
  // Placeholder drafts made without an API key never enter a real queue.
  const keepMockDrafts = translationProvider() === "mock";

  for (const [domain, group] of byDomain) {
    const site = (await queryOne<{ id: string }>(`INSERT INTO sites (user_id, name, base_url) VALUES ($1, $2, $3) RETURNING id`, [
      userId,
      domain,
      group[group.length - 1].input_urls[0],
    ]))!;
    for (const scan of group) {
      await query(`UPDATE scans SET site_id = $2, owner_id = $3 WHERE id = $1 AND site_id IS NULL`, [scan.id, site.id, userId]);
      await query(
        `INSERT INTO translation_items
           (site_id, source_hash, source_text, kind, context, first_seen_url, last_seen_scan_id, occurrences, status, draft_text, provider)
         SELECT $1, source_hash, source_text, kind, context, first_seen_url, scan_id, occurrences,
                CASE WHEN keep THEN 'draft' ELSE 'pending' END,
                CASE WHEN keep THEN draft_text END,
                CASE WHEN keep THEN provider END
         FROM (SELECT *, draft_text IS NOT NULL AND (provider <> 'mock' OR $3::boolean) AS keep
               FROM public_scan_strings WHERE scan_id = $2) s
         ON CONFLICT (site_id, source_hash, kind) DO UPDATE SET
           occurrences = EXCLUDED.occurrences, last_seen_scan_id = EXCLUDED.last_seen_scan_id, updated_at = now()`,
        [site.id, scan.id, keepMockDrafts]
      );
    }
    // Same as after an app scan: draft the rest in the background.
    void generateDrafts(site.id).catch(() => {});
  }
  return scans.length;
}
