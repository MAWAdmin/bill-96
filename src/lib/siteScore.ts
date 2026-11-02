import { SEVERITY_ORDER, type Severity } from "./scanner/types";

/**
 * Site-level score for the free scan: rolls the per-page 0–100 scores up into
 * one number, weighting each page by the worst issue on it so a few serious
 * pages are not averaged away by many clean ones. Pages that failed to load
 * say nothing about French gaps and are left out.
 */

export type RiskBand = "low" | "medium" | "high" | "critical";
export const RISK_BANDS: RiskBand[] = ["low", "medium", "high", "critical"];

/** How much a page counts, by its worst issue. */
export const PAGE_WEIGHT: Record<Severity | "none", number> = { critical: 4, high: 3, medium: 2, low: 1, info: 1, none: 1 };

export interface PageScore {
  score: number;
  worst: Severity | null;
  failed?: boolean;
}

export interface SiteScore {
  score: number | null;
  band: RiskBand | null;
}

export function rollUpSiteScore(pages: PageScore[]): SiteScore {
  const scored = pages.filter((p) => !p.failed);
  if (!scored.length) return { score: null, band: null };
  let total = 0;
  let weight = 0;
  for (const p of scored) {
    const w = PAGE_WEIGHT[p.worst ?? "none"];
    total += w * p.score;
    weight += w;
  }
  const score = Math.round(total / weight);
  return { score, band: riskBand(score, worstOf(scored.map((p) => p.worst))) };
}

/**
 * Band from the score, raised by the worst issue anywhere on the site: one
 * critical gap (e.g. a page with no French version) is never "low" risk.
 */
export function riskBand(score: number, worst: Severity | null): RiskBand {
  const byScore: RiskBand = score >= 85 ? "low" : score >= 60 ? "medium" : score >= 35 ? "high" : "critical";
  const floor: RiskBand = worst === "critical" ? "high" : worst === "high" ? "medium" : "low";
  return RISK_BANDS[Math.max(RISK_BANDS.indexOf(byScore), RISK_BANDS.indexOf(floor))];
}

export function worstOf(severities: (Severity | null)[]): Severity | null {
  let best: Severity | null = null;
  for (const s of severities) if (s && (best === null || SEVERITY_ORDER.indexOf(s) < SEVERITY_ORDER.indexOf(best))) best = s;
  return best;
}

export interface IssueGroup {
  code: string;
  severity: Severity;
  pages: number;
}

/** Most serious first, then the ones on the most pages. */
export function rankIssues(groups: IssueGroup[]): IssueGroup[] {
  return [...groups].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.pages - a.pages || a.code.localeCompare(b.code)
  );
}
