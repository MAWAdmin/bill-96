import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isUuid, loadScan } from "@/lib/access";
import { query, queryOne } from "@/lib/db";
import { FrShareBar, LangBadge, ScoreBadge, SeverityBadge, Stat } from "@/components/ui";
import { ISSUE_LABELS } from "@/lib/issueLabels";
import type { Block, HreflangTag, PageMetrics } from "@/lib/scanner/types";

interface PageDetail {
  id: string;
  url: string;
  final_url: string | null;
  http_status: number | null;
  title: string | null;
  html_lang: string | null;
  page_language: string | null;
  score: number | null;
  metrics: PageMetrics | null;
  hreflang: HreflangTag[] | null;
  blocks: Block[] | null;
  console_errors: string[] | null;
  has_screenshot: boolean;
  error: string | null;
}

export default async function PageDetailView({
  params,
  searchParams,
}: {
  params: Promise<{ scanId: string; pageId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { scanId, pageId } = await params;
  const { lang } = await searchParams;
  const user = await requireUser();
  const scan = await loadScan(user.id, scanId);
  if (!isUuid(pageId)) notFound();
  const page = await queryOne<PageDetail>(`SELECT * FROM pages WHERE id = $1 AND scan_id = $2`, [pageId, scan.id]);
  if (!page) notFound();
  const issues = await query<{ id: string; code: string; severity: string; message: string; details: any }>(
    `SELECT id, code, severity, message, details FROM issues WHERE page_id = $1
     ORDER BY array_position(ARRAY['critical','high','medium','low','info'], severity)`,
    [page.id]
  );
  const m = page.metrics;
  const blocks = (page.blocks ?? []).filter((b) => !lang || b.lang === lang);

  return (
    <>
      <div className="crumbs">
        <Link href="/dashboard">Sites</Link> / <Link href={`/sites/${scan.site_id}`}>{scan.site_name}</Link> /{" "}
        <Link href={`/scans/${scan.id}`}>Scan</Link> /
      </div>
      <div className="page-head">
        <div>
          <h1>{page.title || "Untitled page"}</h1>
          <p>
            <a href={page.final_url || page.url} target="_blank" rel="noreferrer">{page.final_url || page.url}</a>
            {page.http_status ? ` · HTTP ${page.http_status}` : ""} · <code>lang=&quot;{page.html_lang || "—"}&quot;</code>
          </p>
        </div>
        <ScoreBadge score={page.score} />
      </div>

      {page.error && <div className="alert alert-error">{page.error}</div>}

      {m && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          <Stat label="Detected language" value={<LangBadge lang={page.page_language} />} />
          <Stat label="French prominence" value={<FrShareBar share={m.frProminenceShare} />} sub="weighted by size, weight & position" />
          <Stat label="French text share" value={<FrShareBar share={m.frCharShare} />} sub={`${m.frChars} FR / ${m.enChars} EN chars`} />
          <Stat label="Largest text" value={`${m.maxFontFr || "–"} / ${m.maxFontEn || "–"}`} sub="px, French / English" />
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h2>Issues ({issues.length})</h2>
          {issues.length === 0 && <p className="muted">No issues on this page.</p>}
          {issues.map((i) => (
            <div key={i.id} className={`issue sev-${i.severity}`}>
              <div className="row">
                <SeverityBadge severity={i.severity} />
                <strong>{ISSUE_LABELS[i.code]?.label ?? i.code}</strong>
              </div>
              <div style={{ marginTop: 4 }}>{i.message}</div>
              {ISSUE_LABELS[i.code]?.fix && <div className="small muted" style={{ marginTop: 4 }}>Fix: {ISSUE_LABELS[i.code].fix}</div>}
              {Array.isArray(i.details?.examples) && (
                <ul>{i.details.examples.map((e: string, k: number) => <li key={k}>{e}</li>)}</ul>
              )}
              {Array.isArray(i.details?.urls) && (
                <ul>{i.details.urls.map((e: string, k: number) => <li key={k}>{e}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Screenshot</h2>
          {page.has_screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="shot" src={`/api/screenshots/${page.id}`} alt={`Screenshot of ${page.url}`} />
          ) : (
            <p className="muted">No screenshot.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>hreflang ({page.hreflang?.length ?? 0})</h2>
        {page.hreflang?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>URL</th></tr></thead>
              <tbody>
                {page.hreflang.map((t, k) => (
                  <tr key={k}><td><code>{t.hreflang}</code></td><td className="small">{t.href}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No hreflang tags.</p>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Text blocks by prominence</h2>
          <span className="spacer" />
          <div className="tabs" style={{ margin: 0, border: 0 }}>
            {[["", "All"], ["fr", "French"], ["en", "English"], ["mixed", "Mixed"], ["unknown", "Unclear"]].map(([v, l]) => (
              <Link key={v} href={v ? `?lang=${v}` : "?"} className={(lang ?? "") === v ? "active" : ""}>{l}</Link>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Lang</th><th>Text</th><th>Where</th><th className="num">Size</th><th className="num">Weight</th><th className="num">Prominence</th></tr>
            </thead>
            <tbody>
              {blocks.slice(0, 200).map((b, k) => (
                <tr key={k}>
                  <td><LangBadge lang={b.lang} /></td>
                  <td style={{ maxWidth: 480 }}>{b.text.length > 160 ? b.text.slice(0, 160) + "…" : b.text}</td>
                  <td className="small muted">
                    {b.kind !== "text" ? `${b.kind} · ` : ""}{b.role}{b.inViewport ? " · above fold" : ""}
                  </td>
                  <td className="num">{b.fontSize ? `${Math.round(b.fontSize * 10) / 10}px` : "–"}</td>
                  <td className="num">{b.fontWeight || "–"}</td>
                  <td className="num">{Math.round(b.prominence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {blocks.length === 0 && <p className="muted">No blocks.</p>}
      </div>

      {page.console_errors && page.console_errors.length > 0 && (
        <div className="card">
          <h2>Console errors</h2>
          <ul className="small">{page.console_errors.slice(0, 20).map((e, k) => <li key={k}><code>{e}</code></li>)}</ul>
        </div>
      )}
    </>
  );
}
