import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadSite, type Scan } from "@/lib/access";
import { query } from "@/lib/db";
import { getConnector } from "@/lib/connectors";
import { startScan } from "@/app/actions";
import { ActionForm, ScanModeFields, SubmitButton } from "@/components/forms";
import { fmtDate, ScoreBadge, SeverityBadge, Stat, StatusBadge } from "@/components/ui";
import { ISSUE_LABELS } from "@/lib/issueLabels";

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const user = await requireUser();
  const site = await loadSite(user.id, siteId);
  const scans = await query<Scan>(`SELECT * FROM scans WHERE site_id = $1 ORDER BY created_at DESC LIMIT 20`, [site.id]);
  const counts = await query<{ status: string; n: string }>(
    `SELECT status, count(*) AS n FROM translation_items WHERE site_id = $1 GROUP BY status`,
    [site.id]
  );
  const tc = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<string, number>;
  const latest = scans.find((s) => s.status === "completed");
  const topCodes = latest?.summary?.byCode
    ? Object.entries(latest.summary.byCode as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 8)
    : [];

  return (
    <>
      <div className="crumbs"><Link href="/dashboard">Sites</Link> /</div>
      <div className="page-head">
        <div>
          <h1>{site.name}</h1>
          <p>
            <a href={site.base_url} target="_blank" rel="noreferrer">{site.base_url}</a> · {getConnector(site.platform).label}
          </p>
        </div>
        <div className="row">
          <Link className="btn" href={`/translations?site=${site.id}`}>Translations</Link>
          <Link className="btn" href={`/sites/${site.id}/settings`}>Settings</Link>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Stat label="Latest score" value={<ScoreBadge score={latest?.score} />} sub={latest ? fmtDate(latest.finished_at) : "no completed scan"} />
        <Stat label="Pages checked" value={latest?.summary?.pages ?? "–"} />
        <Stat label="Pending / drafts" value={`${tc.pending ?? 0} / ${tc.draft ?? 0}`} sub="strings needing French" />
        <Stat label="Approved" value={(tc.approved ?? 0) + (tc.published ?? 0)} sub="ready to publish/export" />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Run a scan</h2>
          <ActionForm action={startScan.bind(null, site.id)}>
            <ScanModeFields defaultMax={site.max_pages} baseUrl={site.base_url} />
            <SubmitButton pendingText="Starting…">Start scan</SubmitButton>
          </ActionForm>
        </div>
        <div className="card">
          <h2>Top issues in latest scan</h2>
          {topCodes.length === 0 ? (
            <p className="muted">{latest ? "No issues found. 🎉" : "Run a scan to see issues."}</p>
          ) : (
            <table>
              <tbody>
                {topCodes.map(([code, n]) => (
                  <tr key={code}>
                    <td><SeverityBadge severity={ISSUE_LABELS[code]?.severity ?? "info"} /></td>
                    <td>{ISSUE_LABELS[code]?.label ?? code}</td>
                    <td className="num">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Scan history</h2>
        {scans.length === 0 ? (
          <p className="muted">No scans yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th className="num">Pages</th>
                  <th className="num">Critical</th>
                  <th className="num">High</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/scans/${s.id}`}>{fmtDate(s.created_at)}</Link></td>
                    <td>{s.mode === "sitemap" ? "Whole site" : "URL list"}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td className="num">{s.pages_done}/{s.pages_total}</td>
                    <td className="num">{s.summary?.bySeverity?.critical ?? "–"}</td>
                    <td className="num">{s.summary?.bySeverity?.high ?? "–"}</td>
                    <td className="num"><ScoreBadge score={s.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
