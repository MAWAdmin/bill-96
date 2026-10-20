import type { ReactNode } from "react";

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

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_CLS[status] ?? "b-neutral"}`}>{status}</span>;
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
