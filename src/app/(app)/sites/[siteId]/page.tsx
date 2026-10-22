import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadSite, type Scan } from "@/lib/access";
import { query } from "@/lib/db";
import { getConnector } from "@/lib/connectors";
import { loadReadiness } from "@/lib/results";
import { startScan } from "@/app/actions";
import { ActionForm, CheckNowButton, ScanModeFields, SubmitButton } from "@/components/forms";
import { Delta, fmtDate, plural, ReadinessRing, readinessHeadline, StatusBadge } from "@/components/ui";

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
  const toReview = (tc.pending ?? 0) + (tc.draft ?? 0);
  const approved = (tc.approved ?? 0) + (tc.published ?? 0);
  const completed = scans.filter((s) => s.status === "completed");
  const latest = completed[0];
  const running = scans.find((s) => s.status === "running" || s.status === "queued");
  const r = latest ? await loadReadiness(latest.id) : null;
  const head = r ? readinessHeadline(r) : null;
  const check = startScan.bind(null, site.id);

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
        <Link className="btn btn-ghost" href={`/sites/${site.id}/settings`}>Settings</Link>
      </div>

      {running && (
        <div className="alert alert-info row">
          <span>We&apos;re checking this site right now.</span>
          <span className="spacer" />
          <Link href={`/scans/${running.id}`}>Watch progress →</Link>
        </div>
      )}

      <div className="card hero-card">
        <ReadinessRing percent={r?.percent} />
        <div style={{ flex: 1, minWidth: 260 }}>
          {head ? (
            <>
              <h2>{head.title}</h2>
              <p className="lead">Last checked {fmtDate(latest!.created_at)} · {plural(latest!.pages_done, "page")}</p>
              <div className="row">
                <Link className="btn btn-primary" href={`/scans/${latest!.id}`}>See what to fix</Link>
                {!running && <CheckNowButton action={check} className="btn">Check again</CheckNowButton>}
                <Delta now={r!.percent} before={completed[1]?.summary?.readiness?.percent} since={completed[1]?.created_at ?? null} />
              </div>
            </>
          ) : (
            <>
              <h2>Let&apos;s see how French-ready {site.name} is</h2>
              <p className="lead">
                We open your pages in a real browser, find English where French is needed, and draft French translations for you to review.
                It takes a few minutes.
              </p>
              {!running && <CheckNowButton action={check} className="btn btn-primary btn-lg">Check now</CheckNowButton>}
            </>
          )}
        </div>
      </div>

      <div className="card row">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ marginBottom: 4 }}>French translations</h2>
          <p className="muted" style={{ margin: 0 }}>
            {toReview || approved
              ? `${plural(toReview, "string")} to review · ${approved} approved`
              : "Text that needs French shows up here, each with a French draft to check."}
          </p>
        </div>
        <Link className={toReview ? "btn btn-primary" : "btn"} href={`/translations?site=${site.id}`}>
          {toReview ? "Review translations" : "Open translations"}
        </Link>
      </div>

      <details className="tech">
        <summary>Choose which pages to check</summary>
        <div className="tech-body">
          <ActionForm action={check}>
            <ScanModeFields defaultMax={site.max_pages} baseUrl={site.base_url} />
            <SubmitButton pendingText="Starting…">Start check</SubmitButton>
          </ActionForm>
        </div>
      </details>

      {scans.length > 0 && (
        <div className="card">
          <h2>Past checks</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th className="num">Pages</th>
                  <th className="num">French-ready</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => {
                  const pct = s.summary?.readiness?.percent;
                  return (
                    <tr key={s.id}>
                      <td><Link href={`/scans/${s.id}`}>{fmtDate(s.created_at)}</Link></td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="num">{s.pages_done}</td>
                      <td className="num">{pct === null || pct === undefined ? "–" : `${pct}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
