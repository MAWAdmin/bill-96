import type { BlockKind, BlockRole } from "./extract";
import type { Lang } from "./language";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
}

export interface Block {
  text: string;
  kind: BlockKind;
  role: BlockRole;
  tag: string;
  fontSize: number;
  fontWeight: number;
  inViewport: boolean;
  selector: string;
  lang: Lang;
  prominence: number;
}

export type ContentLanguage = "fr" | "en" | "bilingual" | "unknown";

export interface PageMetrics {
  frChars: number;
  enChars: number;
  frCharShare: number | null;
  frProminence: number;
  enProminence: number;
  frProminenceShare: number | null;
  frAboveFold: number;
  enAboveFold: number;
  maxFontFr: number;
  maxFontEn: number;
  blockCounts: Record<Lang, number>;
  truncated: boolean;
}

export interface HreflangTag {
  hreflang: string;
  href: string;
  raw: string;
}

export interface TranslationCandidate {
  text: string;
  kind: BlockKind;
  context: string;
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
export const SEVERITY_PENALTY: Record<Severity, number> = { critical: 50, high: 20, medium: 8, low: 3, info: 0 };

export function scoreFromIssues(issues: Issue[]): number {
  return Math.max(0, 100 - issues.reduce((n, i) => n + SEVERITY_PENALTY[i.severity], 0));
}
