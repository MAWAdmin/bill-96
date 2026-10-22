import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { loadScan } from "@/lib/access";
import { query, queryOne } from "@/lib/db";
import { loadReadiness } from "@/lib/results";
import { OWNER_CODES, PROMINENCE_CODES } from "@/lib/readiness";
import { cancelScan, startScan } from "@/app/actions";
import { AutoRefresh, CheckNowButton, SubmitButton } from "@/components/forms";
import { Delta, Disclaimer, fmtDate, PairRow, plural, ReadinessRing, readinessHeadline, SeverityBadge } from "@/components/ui";
import { ISSUE_LABELS } from "@/lib/issueLabels";
import { SEVERITY_ORDER } from "@/lib/scanner/types";

const ADD_FRENCH_HINT: Record<string, string> = {
  shopify: "Turn on French in Shopify (Settings → Languages) and translate these pages with the Translate & Adapt app.",
  wordpress: "Add French versions with WPML, Polylang or TranslatePress.",
  generic: "Publish a French version of each page and link it to the English one.",
};

interface Todo {
  icon: string;
  kind: "translate" | "missing" | "prominence" | "other";
  title: string;
  text: string;
  action?: ReactNode;
}

export default async function ScanPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const user = await requireUser();
  const scan = await loadScan(user.id, scanId);
  const active = scan.status === "running" || scan.status === "queued";
  const [r, site, prev, open, approved, technical] = await Promise.all([
    loadReadiness(scan.id),
    queryOne<{ platform: string }>(`SELECT platform FROM sites WHERE id = $1`, [scan.site_id]),
    queryOne<{ created_at: Date; summary: any }>(
      `SELECT created_at, summary FROM scans WHERE site_id = $1 AND status = 'completed' AND created_at < $2
       ORDER BY created_at DESC LIMIT 1`,
      [scan.site_id, scan.created_at]
    ),
    queryOne<{ n: string }>(`SELECT count(*) AS n FROM translation_items WHERE site_id = $1 AND status IN ('pending','draft')`, [scan.site_id]),
    queryOne<{ n: string }>(`SELECT count(*) AS n FROM translation_items WHERE site_id = $1 AND status = 'approved'`, [scan.site_id]),
    query<{ code: string; n: string }>(`SELECT code, count(DISTINCT page_id) AS n FROM issues WHERE scan_id = $1 GROUP BY code`, [scan.id]),
  ]);
  const pct = scan.pages_total ? Math.round((scan.pages_done / scan.pages_total) * 100) : 0;
  const recheck = startScan.bind(null, scan.site_id);
  const openStrings = Number(open?.n ?? 0);
  const approvedStrings = Number(approved?.n ?? 0);

  const todos: Todo[] = [];
  if (openStrings) {
    todos.push({
      icon: "Aa",
      kind: "translate",
      title: `Review ${plural(openStrings, "French translation")}`,
      text: "Text from your pages that still needs French, each with a French draft ready to check.",
      action: <Link className="btn btn-primary" href={`/translations?site=${scan.site_id}`}>Start reviewing</Link>,
    });
  } else if (r.counts.leftovers && approvedStrings) {
    todos.push({
      icon: "⇪",
      kind: "translate",
      title: "Put your approved translations on the site",
      text: "Download them and add them in your store, then check again to see the English disappear.",
      action: <a className="btn" href={`/api/translations/export?site=${scan.site_id}&format=csv`}>Download CSV</a>,
    });
  }
  if (r.counts.missing) {
    todos.push({
      icon: "+",
      kind: "missing",
      title: `Add French versions of ${plural(r.counts.missing, "page")}`,
      text: `These pages are only in English. ${ADD_FRENCH_HINT[site?.platform ?? "generic"] ?? ADD_FRENCH_HINT.generic}`,
      action: <a className="btn" href="#pages">See pages</a>,
    });
  }
  const prominence = r.groups.filter((g) => g.problems.some((c) => PROMINENCE_CODES.includes(c))).length;
  if (prominence) {
    todos.push({
      icon: "↕",
      kind: "prominence",
      title: `Give French top billing on ${plural(prominence, "page")}`,
      text: "English is bigger or shown first there. French has to be at least as prominent as English.",
      action: <a className="btn" href="#pages">See pages</a>,
    });
  }
  if (r.counts.unchecked && r.percent !== null) {
    todos.push({
      icon: "↻",
      kind: "other",
      title: `Check ${plural(r.counts.unchecked, "more French page")}`,
      text: "These English pages link to French versions we haven't looked at yet. Check again to include them.",
    });
  }
  if (r.counts.failed) {
    todos.push({
      icon: "!",
      kind: "other",
      title: `${plural(r.counts.failed, "page")} didn't load`,
      text: "Make sure they open in your browser, then check again.",
    });
  }

  const tech = technical
    .filter((t) => !OWNER_CODES.includes(t.code))
    .map((t) => ({ code: t.code, n: Number(t.n), label: ISSUE_LABELS[t.code] }))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.label?.severity ?? "info") - SEVERITY_ORDER.indexOf(b.label?.severity ?? "info") || b.n - a.n);
  const head = readinessHeadline(r);
  const done = !active && scan.pages_done > 0;

  return (
    <>
      <AutoRefresh active={active} />
      <div className="crumbs">
        <Link href="/dashboard">Sites</Link> / <Link href={`/sites/${scan.site_id}`}>{scan.site_name}</Link> /
      </div>
      <div className="page-head">
        <div>
          <h1>{scan.site_name}</h1>
          <p>
            {active ? "Started" : "Checked"} {fmtDate(scan.created_at)} · {plural(scan.pages_done, "page")}
            {scan.status === "cancelled" ? " · cancelled" : scan.status === "failed" ? " · stopped early" : ""}
          </p>
        </div>
        {active && (
          <form action={cancelScan.bind(null, scan.id)}>
            <SubmitButton className="btn btn-danger" pendingText="Cancelling…">Cancel</SubmitButton>
          </form>
        )}
      </div>

      {active && (
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>
              {scan.status === "queued"
                ? "Getting ready…"
                : scan.pages_total
                  ? `Checking your store… page ${Math.min(scan.pages_done + 1, scan.pages_total)} of ${scan.pages_total}`
                  : "Finding your pages…"}
            </strong>
            <span className="spacer" />
            <span className="muted">{pct}%</span>
          </div>
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
          <p className="small muted" style={{ margin: "10px 0 0" }}>
            Each page opens in a real browser. When an English page links to a French version, we check that one too.
          </p>
        </div>
      )}
      {scan.error && <div className="alert alert-error">{scan.error}</div>}

      {done && (
        <div className="card hero-card" data-testid="readiness">
          <ReadinessRing percent={r.percent} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <h2>{head.title}</h2>
            <p className="lead">{head.lead}</p>
            <div className="row">
              <CheckNowButton action={recheck} className={r.percent === null ? "btn btn-primary" : "btn"}>Check again</CheckNowButton>
              <Delta now={r.percent} before={prev?.summary?.readiness?.percent} since={prev?.created_at ?? null} />
            </div>
          </div>
        </div>
      )}

      {done && todos.length > 0 && (
        <div className="card" data-testid="todos">
          <h2>What to do next</h2>
          {todos.map((t) => (
            <div key={t.title} className="todo">
              <div className={`todo-icon t-${t.kind}`} aria-hidden>{t.icon}</div>
              <div>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
              </div>
              {t.action}
            </div>
          ))}
        </div>
      )}
      {done && todos.length === 0 && r.percent === 100 && (
        <div className="card celebrate">
          <div className="big" aria-hidden>🎉</div>
          <h2>Nothing to fix on the pages we checked</h2>
          <p className="muted">Check again after you change your store to make sure it stays that way.</p>
        </div>
      )}

      <div className="card" id="pages">
        <h2>Pages we checked</h2>
        {r.groups.length === 0 ? (
          <p className="muted">{active ? "Pages show up here as they're checked." : "No pages were checked."}</p>
        ) : (
          <>
            <p className="small muted">Each row is one page of your store, with its English (EN) and French (FR) versions.</p>
            <div className="pair-list">
              {r.groups.map((g) => <PairRow key={(g.french ?? g.english)!.id} group={g} scanId={scan.id} />)}
            </div>
          </>
        )}
      </div>

      {tech.length > 0 && (
        <details className="tech">
          <summary>Technical details for your developer ({tech.length})</summary>
          <div className="tech-body">
            <p className="small muted">
              These don&apos;t change what visitors read, but they help search engines and browsers show the right language.
            </p>
            <div className="table-wrap">
              <table>
                <tbody>
                  {tech.map((t) => (
                    <tr key={t.code}>
                      <td style={{ width: 90 }}><SeverityBadge severity={t.label?.severity ?? "info"} /></td>
                      <td>
                        <strong>{t.label?.label ?? t.code}</strong>
                        <div className="small muted">{t.label?.fix}</div>
                      </td>
                      <td className="num">{plural(t.n, "page")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
      <Disclaimer />
    </>
  );
}
