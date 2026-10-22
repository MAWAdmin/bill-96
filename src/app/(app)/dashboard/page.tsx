import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getConnector } from "@/lib/connectors";
import { loadReadiness } from "@/lib/results";
import { Disclaimer, fmtDate, plural, ReadinessRing } from "@/components/ui";

interface Row {
  id: string;
  name: string;
  base_url: string;
  platform: string;
  done_id: string | null;
  done_at: Date | null;
  last_id: string | null;
  last_status: string | null;
  open: string;
}

export default async function Dashboard() {
  const user = await requireUser();
  const sites = await query<Row>(
    `SELECT s.id, s.name, s.base_url, s.platform,
            lc.id AS done_id, lc.created_at AS done_at, la.id AS last_id, la.status AS last_status,
            (SELECT count(*) FROM translation_items t WHERE t.site_id = s.id AND t.status IN ('pending','draft')) AS open
     FROM sites s
     LEFT JOIN LATERAL (SELECT id, created_at FROM scans WHERE site_id = s.id AND status = 'completed' ORDER BY created_at DESC LIMIT 1) lc ON true
     LEFT JOIN LATERAL (SELECT id, status FROM scans WHERE site_id = s.id ORDER BY created_at DESC LIMIT 1) la ON true
     WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
    [user.id]
  );
  const readiness = await Promise.all(sites.map((s) => (s.done_id ? loadReadiness(s.done_id) : null)));

  if (sites.length === 0) {
    return (
      <>
        <div className="card celebrate" style={{ maxWidth: 640, margin: "40px auto" }}>
          <div className="big" aria-hidden>⚜️</div>
          <h1>No sites yet</h1>
          <p className="muted" style={{ fontSize: 16 }}>
            Add your store and we&apos;ll show you how French-ready it is, what to fix first, and French drafts for any English we find.
          </p>
          <Link href="/sites/new" className="btn btn-primary btn-lg">Add your first site</Link>
        </div>
        <Disclaimer />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your sites</h1>
          <p>How French-ready each store is, and what to do next.</p>
        </div>
        <Link href="/sites/new" className="btn btn-primary">+ Add site</Link>
      </div>

      <div className="grid grid-3">
        {sites.map((s, i) => {
          const r = readiness[i];
          const checking = s.last_status === "running" || s.last_status === "queued";
          const open = Number(s.open);
          return (
            <div key={s.id} className="card site-card" style={{ margin: 0 }}>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/sites/${s.id}`} className="site-name">{s.name}</Link>
                  <span className="url small muted">{s.base_url.replace(/^https?:\/\//, "")} · {getConnector(s.platform).label}</span>
                </div>
                <ReadinessRing percent={r?.percent} small />
              </div>
              <div className="small muted">
                {checking
                  ? <Link href={`/scans/${s.last_id}`}>Checking now…</Link>
                  : s.done_at
                    ? r?.percent === null && r?.counts.unchecked ? "French not checked yet" : `Last checked ${fmtDate(s.done_at)}`
                    : "Not checked yet"}
              </div>
              <div className="row">
                {open > 0 ? (
                  <Link className="btn btn-primary btn-sm" href={`/translations?site=${s.id}`}>Review {plural(open, "translation")}</Link>
                ) : (
                  <Link className="btn btn-sm" href={`/sites/${s.id}`}>{s.done_at ? "See results" : "Check it now"}</Link>
                )}
              </div>
            </div>
          );
        })}
        <Link href="/sites/new" className="card add-card" style={{ margin: 0 }}>+ Add another site</Link>
      </div>
      <Disclaimer />
    </>
  );
}
