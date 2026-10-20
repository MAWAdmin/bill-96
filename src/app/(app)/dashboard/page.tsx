import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getConnector } from "@/lib/connectors";
import { Disclaimer, fmtDate, ScoreBadge, Stat, StatusBadge } from "@/components/ui";

interface Row {
  id: string;
  name: string;
  base_url: string;
  platform: string;
  last_scan_id: string | null;
  last_status: string | null;
  last_score: number | null;
  last_at: Date | null;
  critical: number | null;
  pending: string;
}

export default async function Dashboard() {
  const user = await requireUser();
  const sites = await query<Row>(
    `SELECT s.id, s.name, s.base_url, s.platform,
            ls.id AS last_scan_id, ls.status AS last_status, ls.score AS last_score, ls.created_at AS last_at,
            (ls.summary->'bySeverity'->>'critical')::int AS critical,
            (SELECT count(*) FROM translation_items t WHERE t.site_id = s.id AND t.status IN ('pending','draft')) AS pending
     FROM sites s
     LEFT JOIN LATERAL (SELECT * FROM scans WHERE site_id = s.id ORDER BY created_at DESC LIMIT 1) ls ON true
     WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
    [user.id]
  );
  const scored = sites.filter((s) => s.last_score !== null);
  const avg = scored.length ? Math.round(scored.reduce((n, s) => n + (s.last_score ?? 0), 0) / scored.length) : null;
  const pending = sites.reduce((n, s) => n + Number(s.pending), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sites</h1>
          <p>Scan storefronts for French-language gaps and work through the translation queue.</p>
        </div>
        <Link href="/sites/new" className="btn btn-primary">+ Add site</Link>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Stat label="Sites" value={sites.length} />
        <Stat label="Average score" value={avg ?? "–"} sub="latest scan per site" />
        <Stat label="Critical issues" value={sites.reduce((n, s) => n + (s.critical ?? 0), 0)} sub="latest scans" />
        <Stat label="Strings to translate" value={pending} sub={<Link href="/translations">Open queue →</Link>} />
      </div>

      <div className="card">
        {sites.length === 0 ? (
          <div className="empty">
            <p>No sites yet.</p>
            <Link href="/sites/new" className="btn btn-primary">Add your first site</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Platform</th>
                  <th>Last scan</th>
                  <th className="num">Score</th>
                  <th className="num">To translate</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/sites/${s.id}`}><strong>{s.name}</strong></Link>
                      <span className="url small muted">{s.base_url}</span>
                    </td>
                    <td>{getConnector(s.platform).label}</td>
                    <td>
                      {s.last_scan_id ? (
                        <Link href={`/scans/${s.last_scan_id}`}>
                          <StatusBadge status={s.last_status!} /> <span className="small muted">{fmtDate(s.last_at)}</span>
                        </Link>
                      ) : (
                        <span className="muted">Never</span>
                      )}
                    </td>
                    <td className="num"><ScoreBadge score={s.last_score} /></td>
                    <td className="num">{Number(s.pending)}</td>
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
