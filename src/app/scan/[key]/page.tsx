import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { queuePosition } from "@/lib/jobs";
import { ISSUE_LABELS } from "@/lib/issueLabels";
import type { IssueGroup, RiskBand } from "@/lib/siteScore";
import { HTML_LANG, ISSUE_COPY, pickLang, STRINGS, type Lang } from "@/lib/freeScan/i18n";
import { loadPublicResults, loadPublicView, type PublicScan } from "@/lib/freeScan/store";
import { TopBar } from "@/components/TopBar";
import { AutoRefresh } from "@/components/forms";
import { ScoreBadge, Stat } from "@/components/ui";
import { ShareLink, SignupCta, UnlockForm } from "@/components/FreeScan";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "French-language scan · Analyse du français | Bill 96 Checker", robots: { index: false } };

const BAND_CLASS: Record<RiskBand, string> = { low: "b-ok", medium: "b-medium", high: "b-high", critical: "b-critical" };
const TOP_ISSUES = 5;

const clip = (s: string, n = 300) => (s.length > n ? s.slice(0, n) + "…" : s);

export default async function FreeScanResults({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ lang?: string; reused?: string }>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const lang = pickLang(sp.lang, (await headers()).get("accept-language"));
  const t = STRINGS[lang];
  const r = t.results;
  const view = await loadPublicView(key);
  if (!view) notFound();
  const user = await getUser();
  const other = lang === "fr" ? "en" : "fr";

  const shell = (domain: ReactNode, children: ReactNode) => (
    <>
      <TopBar user={user} />
      <main className="container" lang={HTML_LANG[lang]}>
        <div className="page-head">
          <div>
            <h1>{r.title}</h1>
            {domain && <p>{domain}</p>}
          </div>
          <Link href={`/scan/${key}?lang=${other}${sp.reused ? "&reused=1" : ""}`} lang={HTML_LANG[other]}>{t.otherLang}</Link>
        </div>
        {children}
        <p className="disclaimer">{t.disclaimer}</p>
      </main>
    </>
  );

  if (view.kind === "expired") {
    return shell(
      null,
      <div className="card empty">
        <p>{r.expired}</p>
        <Link className="btn btn-primary" href={`/scan?lang=${lang}`}>{r.tryAgain}</Link>
      </div>
    );
  }

  const { scan, unlocked } = view;
  const domain = <a href={scan.input_urls[0]} target="_blank" rel="noreferrer nofollow">{scan.domain}</a>;
  if (scan.status === "queued" || scan.status === "running") return shell(domain, <Progress scan={scan} lang={lang} />);
  if (scan.status !== "completed") {
    return shell(
      domain,
      <div className="card">
        <div className="alert alert-error">{r.failed}</div>
        <Link className="btn btn-primary" href={`/scan?lang=${lang}`}>{r.tryAgain}</Link>
      </div>
    );
  }

  const res = await loadPublicResults(scan.id);
  if (scan.score === null) {
    // Nothing loaded: no score to show, nothing to unlock, and the domain can be scanned again.
    return shell(
      domain,
      <div className="card" data-testid="scan-unreachable">
        <h2>{r.noPages}</h2>
        <p className="muted">{r.noPagesHint}</p>
        {res.failed.error && (
          <p className="small">
            {r.reason} <code>{clip(res.failed.error, 200)}</code>
          </p>
        )}
        <Link className="btn btn-primary" href={`/scan?lang=${lang}`}>{r.tryAgain}</Link>
      </div>
    );
  }
  const summary = scan.summary ?? {};
  const band = summary.riskBand ?? null;
  const totalStrings = summary.translationCandidates ?? 0;
  const gaps = res.issues.filter((i) => i.severity !== "info");
  const mockDrafts = res.strings.some((s) => s.provider === "mock");

  return shell(
    domain,
    <>
      {sp.reused && <div className="alert alert-info">{r.reused}</div>}

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Stat
          label={r.siteScore}
          value={<span data-testid="site-score"><ScoreBadge score={scan.score} /></span>}
          sub={
            <>
              {band && <span className={`badge ${BAND_CLASS[band]}`} data-testid="risk-band">{t.bands[band]}</span>}
              <div>{r.scoreHint}</div>
            </>
          }
        />
        <Stat
          label={r.pagesChecked}
          value={(summary.pages ?? 0) - res.failed.pages}
          sub={res.failed.pages > 0 ? r.pagesFailed(res.failed.pages) : undefined}
        />
        <Stat label={r.gapsFound} value={res.gaps} />
        <Stat
          label={r.englishStrings}
          value={unlocked ? <span data-testid="string-count">{totalStrings}</span> : <span className="muted">{r.locked}</span>}
          sub={unlocked ? r.stringsHint : r.lockedHint}
        />
      </div>

      {unlocked ? (
        <div className="card" data-testid="all-issues">
          <h2>{r.allIssues}</h2>
          {res.issues.length === 0 && <p className="muted">{r.noGaps}</p>}
          {res.issues.map((i) => <IssueItem key={i.code} issue={i} lang={lang} />)}
        </div>
      ) : (
        <div className="card" data-testid="top-issues">
          <h2>{r.topIssues}</h2>
          {gaps.length === 0 && <p className="muted">{r.noGaps}</p>}
          {gaps.slice(0, TOP_ISSUES).map((i) => <IssueItem key={i.code} issue={i} lang={lang} />)}
          <p className="small muted" style={{ margin: 0 }}>{r.lockedMore}</p>
        </div>
      )}

      <div className="card">
        <h2>{r.drafts}</h2>
        <p className="muted">{r.draftsIntro}</p>
        {res.strings.length === 0 ? (
          <p className="muted">{r.noStrings}</p>
        ) : (
          <div className="table-wrap">
            <table data-testid="drafts">
              <thead>
                <tr><th>{r.colEnglish}</th><th>{r.colFrench}</th></tr>
              </thead>
              <tbody>
                {res.strings.map((s) => (
                  <tr key={s.id}>
                    <td lang="en">{clip(s.source_text)}</td>
                    <td lang="fr-CA">{s.draft_text ? clip(s.draft_text) : <span className="muted">{r.noDraft}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mockDrafts && <p className="small muted" style={{ marginTop: 10 }}>{r.mockDrafts}</p>}
      </div>

      {unlocked ? (
        <div className="grid grid-2">
          <div className="card">
            <h2>{r.ctaTitle}</h2>
            <p>
              <strong>{r.stringsTotal(totalStrings)}.</strong> {res.strings.length > 0 && r.stringsShown(res.strings.length)}
            </p>
            <p className="muted">{r.ctaBody(totalStrings)}</p>
            <SignupCta lang={lang} />
          </div>
          <div className="card">
            <h2>{r.shareTitle}</h2>
            <ShareLink path={`/scan/${key}`} lang={lang} />
            {scan.share_expires_at && (
              <p className="small muted" style={{ marginTop: 8 }}>
                {r.shareHint(new Date(scan.share_expires_at).toLocaleDateString(HTML_LANG[lang], { dateStyle: "long" }))}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <h2>{r.unlockTitle}</h2>
          <p className="muted">{r.unlockBody}</p>
          <UnlockForm scanId={scan.id} lang={lang} />
        </div>
      )}
    </>
  );
}

function Progress({ scan, lang }: { scan: PublicScan; lang: Lang }) {
  const r = STRINGS[lang].results;
  const pct = scan.pages_total ? Math.round((scan.pages_done / scan.pages_total) * 100) : 0;
  const line =
    scan.status === "queued"
      ? r.queued(queuePosition(scan.id) ?? 0)
      : !scan.pages_total
        ? r.discovering
        : scan.pages_done < scan.pages_total
          ? r.scanning
          : r.drafting;
  return (
    <div className="card">
      <AutoRefresh active />
      <div className="row" style={{ marginBottom: 8 }}>
        <strong>{line}</strong>
        <span className="spacer" />
        <span className="muted">{r.pages(scan.pages_done, scan.pages_total)}</span>
      </div>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function IssueItem({ issue, lang }: { issue: IssueGroup; lang: Lang }) {
  const t = STRINGS[lang];
  const copy = ISSUE_COPY[issue.code]?.[lang] ?? { title: ISSUE_LABELS[issue.code]?.label ?? issue.code, fix: ISSUE_LABELS[issue.code]?.fix ?? "" };
  return (
    <div className={`issue sev-${issue.severity}`} data-testid="issue">
      <div className="row">
        <span className={`badge b-${issue.severity}`}>{t.severity[issue.severity] ?? issue.severity}</span>
        <strong>{copy.title}</strong>
        <span className="spacer" />
        <span className="small muted">{t.results.onPages(issue.pages)}</span>
      </div>
      {copy.fix && <div className="small" style={{ marginTop: 4 }}>{t.results.fix} {copy.fix}</div>}
    </div>
  );
}
