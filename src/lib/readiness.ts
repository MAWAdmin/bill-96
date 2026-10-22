import { frenchAlternate, normalizeUrl } from "./scanner/hreflang";
import type { HreflangTag } from "./scanner/types";

/**
 * Turns a scan's pages into what a store owner cares about: for each page of
 * the store (its English and French versions paired up), is the French
 * version there and free of English? Technical findings (hreflang, lang
 * attributes, console errors) don't affect readiness; they are listed
 * separately for a developer.
 */

/** Findings that make a French page "not ready" (Bill 96 content problems). */
export const LANGUAGE_CODES = [
  "UNTRANSLATED_TEXT",
  "UNTRANSLATED_ATTRIBUTES",
  "UNTRANSLATED_META",
  "ENGLISH_MORE_PROMINENT",
  "ENGLISH_LARGER_TEXT",
  "ENGLISH_DOMINATES_ABOVE_FOLD",
];
export const PROMINENCE_CODES = ["ENGLISH_MORE_PROMINENT", "ENGLISH_LARGER_TEXT", "ENGLISH_DOMINATES_ABOVE_FOLD"];
/** Shown to the owner through readiness itself, so never listed as a technical finding. */
export const OWNER_CODES = [...LANGUAGE_CODES, "NO_FRENCH_VERSION", "ENGLISH_PAGE_WITH_FRENCH_VERSION", "HTTP_ERROR", "LOAD_FAILED"];

export type PageStatus = "missing" | "leftovers" | "unchecked" | "failed" | "unclear" | "ready";

export const STATUS_ORDER: PageStatus[] = ["missing", "leftovers", "unchecked", "failed", "unclear", "ready"];

export interface ReadinessPage {
  id: string;
  url: string;
  final_url: string | null;
  title: string | null;
  page_language: string | null;
  html_lang: string | null;
  error: string | null;
  hreflang: HreflangTag[] | null;
  has_screenshot: boolean;
  codes: string[];
}

export interface PageGroup {
  status: PageStatus;
  title: string;
  english: ReadinessPage | null;
  french: ReadinessPage | null;
  /** Owner-facing problem codes (NO_FRENCH_VERSION or LANGUAGE_CODES on the French page). */
  problems: string[];
}

export interface Readiness {
  groups: PageGroup[];
  counts: Record<PageStatus, number>;
  /** Share of checked pages that are French-ready, 0–100; null when no French could be judged. */
  percent: number | null;
  /** Pages judged for readiness (ready + leftovers + missing). */
  judged: number;
  frenchPages: number;
}

const isFrenchSide = (p: ReadinessPage) =>
  p.page_language === "fr" || p.page_language === "bilingual" || (p.html_lang ?? "").toLowerCase().startsWith("fr");
const failed = (p: ReadinessPage) => !!p.error || p.codes.includes("HTTP_ERROR");

function frenchStatus(p: ReadinessPage): { status: PageStatus; problems: string[] } {
  if (failed(p)) return { status: "failed", problems: [] };
  const problems = LANGUAGE_CODES.filter((c) => p.codes.includes(c));
  return { status: problems.length ? "leftovers" : "ready", problems };
}

export function computeReadiness(pages: ReadinessPage[]): Readiness {
  const byUrl = new Map<string, ReadinessPage>();
  for (const p of pages) {
    byUrl.set(normalizeUrl(p.url), p);
    if (p.final_url) byUrl.set(normalizeUrl(p.final_url), p);
  }

  const groups: PageGroup[] = [];
  const paired = new Set<string>();
  // English pages that link a French version come first so their twins get paired.
  const linked = pages.filter((p) => !failed(p) && p.codes.includes("ENGLISH_PAGE_WITH_FRENCH_VERSION"));
  for (const en of linked) {
    const href = frenchAlternate(en.hreflang ?? [], en.final_url || en.url);
    const fr = href ? byUrl.get(href) ?? null : null;
    if (fr && fr.id !== en.id) {
      paired.add(fr.id);
      groups.push({ ...frenchStatus(fr), title: fr.title || en.title || fr.url, english: en, french: fr });
    } else {
      groups.push({ status: "unchecked", problems: [], title: en.title || en.url, english: en, french: null });
    }
    paired.add(en.id);
  }

  for (const p of pages) {
    if (paired.has(p.id)) continue;
    const title = p.title || p.url;
    if (failed(p)) groups.push({ status: "failed", problems: [], title, ...side(p) });
    else if (isFrenchSide(p)) groups.push({ ...frenchStatus(p), title, english: null, french: p });
    else if (p.codes.includes("NO_FRENCH_VERSION")) groups.push({ status: "missing", problems: ["NO_FRENCH_VERSION"], title, english: p, french: null });
    else groups.push({ status: "unclear", problems: [], title, ...side(p) });
  }

  groups.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<PageStatus, number>;
  for (const g of groups) counts[g.status]++;
  const judged = counts.ready + counts.leftovers + counts.missing;
  return {
    groups,
    counts,
    percent: judged ? Math.round((counts.ready / judged) * 100) : null,
    judged,
    frenchPages: groups.filter((g) => g.french).length,
  };
}

/** Puts a page that is neither clearly English nor French on the side it leans to, for links. */
function side(p: ReadinessPage): Pick<PageGroup, "english" | "french"> {
  return isFrenchSide(p) ? { english: null, french: p } : { english: p, french: null };
}

/** The page a group's title should open: the French version when there is one. */
export const primaryPage = (g: PageGroup) => (g.french ?? g.english)!;
