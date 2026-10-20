import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadScan } from "@/lib/access";
import { query } from "@/lib/db";
import { cancelScan } from "@/app/actions";
import { AutoRefresh, SubmitButton } from "@/components/forms";
import { Disclaimer, fmtDate, FrShareBar, LangBadge, ScoreBadge, SeverityBadge, Stat, StatusBadge } from "@/components/ui";
import { ISSUE_LABELS } from "@/lib/issueLabels";
import { SEVERITY_ORDER } from "@/lib/scanner/types";

interface PageRow {
  id: string;
  url: string;
  final_url: string | null;
  title: string | null;
  page_language: string | null;
  score: number | null;
  metrics: { frProminenceShare: number | null } | null;
  error: string | null;
  worst: string | null;
  n_issues: string;
}

export default async function ScanPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const user = await requireUser();
  const scan = await loadScan(user.id, scanId);
  const pages = await query<PageRow>(
    `SELECT p.id, p.url, p.final_url, p.title, p.page_language, p.score, p.metrics, p.error,
            (SELECT count(*) FROM issues i WHERE i.page_id = p.id AND i.severity <> 'info') AS n_issues,
            (SELECT i.severity FROM issues i WHERE i.page_id = p.id
             ORDER BY array_position(ARRAY['critical','high','medium','low','info'], i.severity) LIMIT 1) AS worst
     FROM pages p WHERE p.scan_id = $1 ORDER BY p.score ASC NULLS FIRST, p.created_at`,
    [scan.id]
  );
  const active = scan.status === "running" || scan.status === "queued";
  const pct = scan.pages_total ? Math.round((scan.pages_done / scan.pages_total) * 100) : 0;
  const s = scan.summary;
  const byCode = s?.byCode
    ? Object.entries(s.byCode as Record<string, number>).sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(ISSUE_LABELS[a[0]]?.severity ?? "info") - SEVERITY_ORDER.indexOf(ISSUE_LABELS[b[0]]?.severity ?? "info") ||
          b[1] - a[1]
      )
    : [];

  return (
    <>
      <AutoRefresh active={active} />
      <div className="crumbs">
        <Link href="/dashboard">Sites</Link> / <Link href={`/sites/${scan.site_id}`}>{scan.site_name}</Link> /
      </div>
      <div className="page-head">
        <div>
          <h1>Scan · {fmtDate(scan.created_at)}</h1>
          <p>
            <StatusBadge status={scan.status} /> {scan.mode === "sitemap" ? "Whole site" : "URL list"} ·{" "}
            {scan.pages_done}/{scan.pages_total} pages
          </p>
        </div>
        <div className="row">
          {active && (
            <form action={cancelScan.bind(null, scan.id)}>
              <SubmitButton className="btn btn-danger" pendingText="Cancelling…">Cancel scan</SubmitButton>
            </form>
          )}
          {scan.status === "completed" && (
            <Link className="btn btn-primary" href={`/translations?site=${scan.site_id}`}>Review translations →</Link>
          )}
        </div>
      </div>

      {active && (
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <strong>{scan.status === "queued" ? "Waiting to start…" : scan.pages_total ? "Scanning pages…" : "Discovering pages…"}</strong>
            <span className="spacer" />
            <span className="muted">{pct}%</span>
          </div>
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {scan.error && <div className="alert alert-error">{scan.error}</div>}

      {s && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 20 }}>
            <Stat label="Score" value={<ScoreBadge score={scan.score} />} sub="average of page scores" />
            <Stat label="Pages" value={s.pages} sub={s.failedPages ? `${s.failedPages} failed to load` : "all loaded"} />
            <Stat label="Critical + high" value={(s.bySeverity.critical ?? 0) + (s.bySeverity.high ?? 0)} />
            <Stat label="Strings to translate" value={s.translationCandidates} />
          </div>
          {byCode.length > 0 && (
            <div className="card">
              <h2>Issues by type</h2>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {byCode.map(([code, n]) => (
                      <tr key={code}>
                        <td style={{ width: 90 }}><SeverityBadge severity={ISSUE_LABELS[code]?.severity ?? "info"} /></td>
                        <td>
                          <strong>{ISSUE_LABELS[code]?.label ?? code}</strong>
                          <div className="small muted">{ISSUE_LABELS[code]?.fix}</div>
                        </td>
                        <td className="num">{n} page{n === 1 ? "" : "s"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="card">
        <h2>Pages</h2>
        {pages.length === 0 ? (
          <p className="muted">{active ? "Results appear here as pages finish." : "No pages were scanned."}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Language</th>
                  <th>French prominence</th>
                  <th>Worst issue</th>
                  <th className="num">Issues</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/scans/${scan.id}/pages/${p.id}`} className="url">{p.title || p.url}</Link>
                      <span className="url small muted">{p.final_url || p.url}</span>
                    </td>
                    <td><LangBadge lang={p.error ? null : p.page_language} /></td>
                    <td><FrShareBar share={p.metrics?.frProminenceShare} /></td>
                    <td>{p.worst ? <SeverityBadge severity={p.worst} /> : <span className="badge b-ok">none</span>}</td>
                    <td className="num">{Number(p.n_issues)}</td>
                    <td className="num"><ScoreBadge score={p.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Disclaimer />
    </>
  );
}
