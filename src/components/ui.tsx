import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { PageGroup, PageStatus, Readiness } from "@/lib/readiness";

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="score score-none">–</span>;
  const cls = score >= 85 ? "score-good" : score >= 60 ? "score-mid" : "score-bad";
  return <span className={`score ${cls}`}>{score}</span>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge b-${severity}`}>{severity}</span>;
}

const LANG_LABEL: Record<string, string> = {
  fr: "French",
  en: "English",
  bilingual: "Bilingual",
  mixed: "Mixed",
  unknown: "Unclear",
};

export function LangBadge({ lang }: { lang: string | null }) {
  if (!lang) return <span className="badge b-high">Failed</span>;
  const cls = lang === "fr" ? "b-fr" : lang === "en" ? "b-en" : "b-neutral";
  return <span className={`badge ${cls}`}>{LANG_LABEL[lang] ?? lang}</span>;
}

const STATUS_CLS: Record<string, string> = {
  queued: "b-info",
  running: "b-low",
  completed: "b-ok",
  failed: "b-high",
  cancelled: "b-neutral",
  pending: "b-medium",
  draft: "b-low",
  approved: "b-ok",
  rejected: "b-neutral",
  published: "b-fr",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${STATUS_CLS[status] ?? "b-neutral"}`}>{label ?? status}</span>;
}

export function FrShareBar({ share }: { share: number | null | undefined }) {
  if (share === null || share === undefined) return <span className="muted">–</span>;
  const fr = Math.round(share * 100);
  return (
    <div title={`French ${fr}% / English ${100 - fr}%`} style={{ minWidth: 90 }}>
      <div className="bar">
        <div className="fr" style={{ width: `${fr}%` }} />
        <div className="en" style={{ width: `${100 - fr}%` }} />
      </div>
      <div className="small muted">{fr}% FR</div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "–";
  return new Date(d).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function Disclaimer() {
  return (
    <p className="disclaimer">
      Automated triage to help you find French-language gaps. It is not legal advice and does not certify compliance with the
      Charter of the French language (Bill 96). AI translations are drafts for human review.
    </p>
  );
}

/** Big percentage ring for French readiness. */
export function ReadinessRing({ percent, small }: { percent: number | null | undefined; small?: boolean }) {
  const has = percent !== null && percent !== undefined;
  const p = has ? percent : 0;
  const color = p >= 85 ? "var(--ok)" : p >= 50 ? "var(--warn)" : "var(--bad)";
  return (
    <div
      className={`ring${small ? " ring-sm" : ""}${has ? "" : " empty-ring"}`}
      style={{ "--p": p, "--c": color } as CSSProperties}
      role="img"
      aria-label={has ? `${p}% French-ready` : "French readiness not known yet"}
    >
      <span>{has ? `${p}%` : "–"}</span>
    </div>
  );
}

export const STATUS_LABEL: Record<PageStatus, string> = {
  ready: "French-ready",
  leftovers: "English left",
  missing: "No French version",
  unchecked: "French not checked",
  failed: "Couldn't load",
  unclear: "Too little text",
};

export function StatusPill({ status }: { status: PageStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Plain-language names for the problems a store owner fixes. */
export const PROBLEM_LABEL: Record<string, string> = {
  NO_FRENCH_VERSION: "Only in English",
  UNTRANSLATED_TEXT: "English text",
  UNTRANSLATED_ATTRIBUTES: "English image text or labels",
  UNTRANSLATED_META: "English page title",
  ENGLISH_MORE_PROMINENT: "English stands out more",
  ENGLISH_LARGER_TEXT: "English text is bigger",
  ENGLISH_DOMINATES_ABOVE_FOLD: "English shown first",
};

/** One row of the "pages we checked" list: an English page and its French version. */
export function PairRow({ group, scanId }: { group: PageGroup; scanId: string }) {
  const href = (id: string) => `/scans/${scanId}/pages/${id}`;
  const main = group.french ?? group.english!;
  return (
    <div className="pair" data-testid="page-pair">
      <div><StatusPill status={group.status} /></div>
      <div style={{ minWidth: 0 }}>
        <Link href={href(main.id)} className="pair-title url">{group.title}</Link>
        {group.problems.length > 0 && (
          <div className="problem-chips">
            {group.problems.map((c) => <span key={c} className="problem-chip">{PROBLEM_LABEL[c] ?? c}</span>)}
          </div>
        )}
      </div>
      <div className="pair-links">
        {group.english ? <Link className="lang-chip" href={href(group.english.id)} title={group.english.url}>EN</Link> : null}
        {group.french ? (
          <Link className="lang-chip" href={href(group.french.id)} title={group.french.url}>FR</Link>
        ) : (
          <span className="lang-chip none" title="No French version checked">FR</span>
        )}
      </div>
    </div>
  );
}

/** "▲ 12 points since Oct 20" against an earlier readiness percentage. */
export function Delta({ now, before, since }: { now: number | null; before: number | null | undefined; since: Date | string | null }) {
  if (now === null || before === null || before === undefined) return null;
  const d = now - before;
  const when = since ? ` since ${new Date(since).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}` : "";
  if (d === 0) return <span className="delta">No change{when}</span>;
  return <span className={`delta ${d > 0 ? "up" : "down"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)} points{when}</span>;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The one-sentence answer to "how French-ready is this store?". */
export function readinessHeadline(r: Readiness): { title: string; lead: string } {
  const unchecked = r.counts.unchecked
    ? ` ${plural(r.counts.unchecked, "English page")} link${r.counts.unchecked === 1 ? "s" : ""} to French we haven't checked yet.`
    : "";
  if (r.percent === null) {
    if (r.counts.unchecked) {
      return {
        title: "Your French pages haven't been checked yet",
        lead: `We checked ${plural(r.counts.unchecked, "English page")}. ${r.counts.unchecked === 1 ? "It links" : "Each one links"} to a French version that this check didn't include. Check again to look at the French side.`,
      };
    }
    return { title: "We couldn't judge the French yet", lead: "The pages we checked didn't load or had too little text to tell." };
  }
  if (r.percent === 100) {
    const all = r.judged === 1 ? "The page we checked is" : `All ${r.judged} pages we checked are`;
    return { title: "Your French looks great", lead: `${all} French-ready.${unchecked}` };
  }
  return {
    title: `${r.counts.ready} of ${r.judged} ${r.judged === 1 ? "page is" : "pages are"} French-ready`,
    lead: `Here's what's left, most important first.${unchecked}`,
  };
}
