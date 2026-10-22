import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isUuid, loadScan } from "@/lib/access";
import { query, queryOne } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { loadReadiness } from "@/lib/results";
import { OWNER_CODES, PROMINENCE_CODES, type ReadinessPage } from "@/lib/readiness";
import { FrShareBar, LangBadge, plural, SeverityBadge, Stat, StatusBadge, StatusPill } from "@/components/ui";
import { ADD_FRENCH_HINT, ISSUE_LABELS } from "@/lib/issueLabels";
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

interface IssueRow {
  id: string;
  code: string;
  severity: string;
  message: string;
  details: any;
}

const MAX_ENGLISH_ROWS = 40;
const ITEM_STATUS: Record<string, string> = { pending: "needs French", draft: "draft", approved: "approved", published: "published", rejected: "not needed" };

/** Where on the page a piece of text lives, in words a store owner uses. */
function whereLabel(b: Block): string {
  if (b.kind === "meta") return b.tag === "head" ? "Page title" : "Google search description";
  if (b.kind === "alt") return "Image description";
  if (b.kind === "placeholder") return "Form placeholder";
  if (b.kind === "value") return "Button";
  if (b.kind === "aria") return "Screen-reader label";
  return ({ heading: "Heading", button: "Button", nav: "Menu", footer: "Footer", link: "Link" } as Record<string, string>)[b.role] ?? "Text";
}

function Screenshot({ page, side, scanId, current }: { page: ReadinessPage; side: string; scanId: string; current: boolean }) {
  return (
    <div className="card">
      <div className="shot-label">
        {side} version
        <span className="spacer" />
        {!current && <Link href={`/scans/${scanId}/pages/${page.id}`} className="small">Open →</Link>}
      </div>
      {page.has_screenshot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="shot" src={`/api/screenshots/${page.id}`} alt={`Screenshot of the ${side} page`} />
      ) : (
        <p className="muted">No screenshot.</p>
      )}
      <a href={page.final_url || page.url} target="_blank" rel="noreferrer" className="url small" style={{ marginTop: 8 }}>
        {page.final_url || page.url}
      </a>
    </div>
  );
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
  const [issues, readiness] = await Promise.all([
    query<IssueRow>(
      `SELECT id, code, severity, message, details FROM issues WHERE page_id = $1
       ORDER BY array_position(ARRAY['critical','high','medium','low','info'], severity)`,
      [page.id]
    ),
    loadReadiness(scan.id),
  ]);
  const group = readiness.groups.find((g) => g.english?.id === page.id || g.french?.id === page.id);
  const isEnglishSide = group?.english?.id === page.id;
  const twin = isEnglishSide ? group?.french : group?.english;
  const ownerIssues = issues.filter((i) => OWNER_CODES.includes(i.code) && i.code !== "ENGLISH_PAGE_WITH_FRENCH_VERSION");
  const techIssues = issues.filter((i) => !OWNER_CODES.includes(i.code));
  const m = page.metrics;
  const blocks = (page.blocks ?? []).filter((b) => !lang || b.lang === lang);

  // Each piece of English once, with its French from the translations queue.
  const seen = new Set<string>();
  const english = (page.blocks ?? []).filter((b) => {
    const key = `${b.kind}|${b.text}`;
    if ((b.lang !== "en" && b.lang !== "mixed") || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const items = english.length
    ? await query<{ source_hash: string; kind: string; status: string; draft_text: string | null; final_text: string | null }>(
        `SELECT source_hash, kind, status, draft_text, final_text FROM translation_items WHERE site_id = $1 AND source_hash = ANY($2::text[])`,
        [scan.site_id, [...new Set(english.map((b) => sha256(b.text)))]]
      )
    : [];
  const itemFor = new Map(items.map((i) => [`${i.source_hash}|${i.kind}`, i]));
  const missing = ownerIssues.some((i) => i.code === "NO_FRENCH_VERSION");
  const loadProblems = ownerIssues.filter((i) => i.code === "LOAD_FAILED" || i.code === "HTTP_ERROR");
  const prominence = ownerIssues.filter((i) => PROMINENCE_CODES.includes(i.code));
  const showEnglish = !isEnglishSide && english.length > 0;
  const site = await queryOne<{ platform: string }>(`SELECT platform FROM sites WHERE id = $1`, [scan.site_id]);
  const translationsHref = `/translations?site=${scan.site_id}`;

  return (
    <>
      <div className="crumbs">
        <Link href="/dashboard">Sites</Link> / <Link href={`/sites/${scan.site_id}`}>{scan.site_name}</Link> /{" "}
        <Link href={`/scans/${scan.id}`}>Check results</Link> /
      </div>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1>{page.title || "Untitled page"}</h1>
          <p>
            {isEnglishSide ? "English version" : "French version"} ·{" "}
            <a href={page.final_url || page.url} target="_blank" rel="noreferrer">{page.final_url || page.url}</a>
          </p>
        </div>
        {group && <StatusPill status={group.status} />}
      </div>

      {page.error && <div className="alert alert-error">This page didn&apos;t load: {page.error}</div>}

      <div className="card">
        <h2>What needs fixing</h2>
        {loadProblems.map((i) => <p key={i.id}>{i.message}</p>)}
        {missing && (
          <>
            <p>This page is only in English. {ADD_FRENCH_HINT[site?.platform ?? "generic"] ?? ADD_FRENCH_HINT.generic}</p>
            {english.length > 0 && (
              <p className="row">
                <span className="muted">{plural(english.length, "piece")} of its text are waiting for French in Translations.</span>
                <Link className="btn btn-sm" href={translationsHref}>See the French</Link>
              </p>
            )}
          </>
        )}
        {showEnglish && (
          <>
            <h3>Still in English ({english.length})</h3>
            <div className="fix-list" data-testid="still-english">
              {english.slice(0, MAX_ENGLISH_ROWS).map((b) => {
                const item = itemFor.get(`${sha256(b.text)}|${b.kind}`);
                const french = item?.final_text ?? item?.draft_text;
                return (
                  <div key={`${b.kind}|${b.text}`} className="fix-row">
                    <div>
                      <div className="fix-where">{whereLabel(b)}</div>
                      <div lang="en">{b.text}</div>
                    </div>
                    <div>
                      <div className="fix-where">
                        French {item && <StatusBadge status={item.status} label={ITEM_STATUS[item.status] ?? item.status} />}
                      </div>
                      {french ? <div lang="fr-CA">{french}</div> : <div className="muted">Not written yet</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="row">
              <Link className="btn btn-primary" href={translationsHref}>Review the French</Link>
              {english.length > MAX_ENGLISH_ROWS && <span className="small muted">and {english.length - MAX_ENGLISH_ROWS} more there</span>}
            </div>
          </>
        )}
        {prominence.length > 0 && (
          <>
            <h3 style={{ marginTop: showEnglish ? 24 : 0 }}>English is more visible than French</h3>
            <ul style={{ marginTop: 0 }}>{prominence.map((i) => <li key={i.id}>{i.message}</li>)}</ul>
            <p className="small muted" style={{ margin: 0 }}>Give French at least the same size and place as English, or remove the English.</p>
          </>
        )}
        {!missing && !showEnglish && prominence.length === 0 && loadProblems.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            {isEnglishSide && group?.french ? (
              <>This is the English version, so there&apos;s nothing to translate here. <Link href={`/scans/${scan.id}/pages/${group.french.id}`}>See the French version →</Link></>
            ) : isEnglishSide && group?.status === "unchecked" ? (
              "This is the English version. It links to a French version that this check didn't include."
            ) : (
              "Nothing on this page. 🎉"
            )}
          </p>
        )}
      </div>

      {group && (
        <div className={twin ? "grid grid-2" : "single-shot"}>
          {group?.english && <Screenshot page={group.english} side="English" scanId={scan.id} current={isEnglishSide} />}
          {group?.french && <Screenshot page={group.french} side="French" scanId={scan.id} current={!isEnglishSide} />}
        </div>
      )}

      <details className="tech" open={!!lang}>
        <summary>Technical details for your developer</summary>
        <div className="tech-body">
          {techIssues.map((i) => (
            <div key={i.id} className={`issue sev-${i.severity}`}>
              <div className="row">
                <SeverityBadge severity={i.severity} />
                <strong>{ISSUE_LABELS[i.code]?.label ?? i.code}</strong>
              </div>
              <div style={{ marginTop: 4 }}>{i.message}</div>
              {ISSUE_LABELS[i.code]?.fix && <div className="small muted" style={{ marginTop: 4 }}>Fix: {ISSUE_LABELS[i.code].fix}</div>}
              {Array.isArray(i.details?.urls) && <ul>{i.details.urls.map((e: string, k: number) => <li key={k}>{e}</li>)}</ul>}
            </div>
          ))}

          {m && (
            <div className="grid grid-4" style={{ margin: "16px 0" }}>
              <Stat label="Detected language" value={<LangBadge lang={page.page_language} />} sub={<code>lang=&quot;{page.html_lang || "—"}&quot;</code>} />
              <Stat label="French prominence" value={<FrShareBar share={m.frProminenceShare} />} sub="weighted by size, weight & position" />
              <Stat label="French text share" value={<FrShareBar share={m.frCharShare} />} sub={`${m.frChars} FR / ${m.enChars} EN chars`} />
              <Stat label="Largest text" value={`${m.maxFontFr || "–"} / ${m.maxFontEn || "–"}`} sub="px, French / English" />
            </div>
          )}

          <h3>hreflang ({page.hreflang?.length ?? 0})</h3>
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

          <div className="row" style={{ margin: "18px 0 8px" }}>
            <h3 style={{ margin: 0 }}>Text blocks by prominence</h3>
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
                {blocks.slice(0, lang ? 200 : 30).map((b, k) => (
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
          {!lang && blocks.length > 30 && <p className="small muted">Showing the 30 most prominent of {blocks.length}. Pick a language above to see more.</p>}

          {page.console_errors && page.console_errors.length > 0 && (
            <>
              <h3>Console errors</h3>
              <ul className="small">{page.console_errors.slice(0, 20).map((e, k) => <li key={k}><code>{e}</code></li>)}</ul>
            </>
          )}
        </div>
      </details>
    </>
  );
}
