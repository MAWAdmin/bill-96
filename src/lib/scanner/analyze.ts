import type { Extraction, RawBlock } from "./extract";
import { brandStripper, detectLanguage, type Lang } from "./language";
import type { Block, ContentLanguage, Issue, PageMetrics, TranslationCandidate } from "./types";

/**
 * Bill 96 heuristics for one page.
 *
 * The Charter of the French language requires commercial websites aimed at
 * Quebec to be available in French, with French at least as favourable /
 * prominent as any other language. We measure "prominence" per text block from
 * what a visitor actually sees: amount of text, rendered font size, weight,
 * whether it is above the fold, and whether it is a heading or button.
 *
 * This is risk triage for a human reviewer, not a legal determination.
 */

const ROLE_FACTOR: Record<string, number> = { heading: 1.3, button: 1.2, nav: 1.1, link: 1, body: 1, footer: 0.6, meta: 0 };

export function prominenceOf(b: RawBlock): number {
  if (b.kind !== "text") return 0;
  const size = Math.min(b.fontSize || 16, 96) / 16;
  return (
    b.text.length *
    size *
    size *
    (b.fontWeight >= 600 ? 1.3 : 1) *
    (b.inViewport ? 1.5 : 1) *
    (ROLE_FACTOR[b.role] ?? 1)
  );
}

export function classifyBlocks(raw: RawBlock[], stripBrands: (text: string) => string = (t) => t): Block[] {
  return raw.map((b) => ({
    text: b.text,
    kind: b.kind,
    role: b.role,
    tag: b.tag,
    fontSize: b.fontSize,
    fontWeight: b.fontWeight,
    inViewport: b.inViewport,
    selector: b.selector,
    lang: detectLanguage(stripBrands(b.text)).lang,
    prominence: prominenceOf(b),
  }));
}

export function computeMetrics(blocks: Block[], truncated = false): PageMetrics {
  const m: PageMetrics = {
    frChars: 0,
    enChars: 0,
    frCharShare: null,
    frProminence: 0,
    enProminence: 0,
    frProminenceShare: null,
    frAboveFold: 0,
    enAboveFold: 0,
    maxFontFr: 0,
    maxFontEn: 0,
    blockCounts: { fr: 0, en: 0, mixed: 0, unknown: 0 },
    truncated,
  };
  for (const b of blocks) {
    m.blockCounts[b.lang]++;
    if (b.kind !== "text" || (b.lang !== "fr" && b.lang !== "en")) continue;
    const fr = b.lang === "fr";
    if (fr) {
      m.frChars += b.text.length;
      m.frProminence += b.prominence;
      if (b.inViewport) m.frAboveFold += b.prominence;
      m.maxFontFr = Math.max(m.maxFontFr, b.fontSize);
    } else {
      m.enChars += b.text.length;
      m.enProminence += b.prominence;
      if (b.inViewport) m.enAboveFold += b.prominence;
      m.maxFontEn = Math.max(m.maxFontEn, b.fontSize);
    }
  }
  const chars = m.frChars + m.enChars;
  if (chars > 0) m.frCharShare = round(m.frChars / chars);
  const prom = m.frProminence + m.enProminence;
  if (prom > 0) m.frProminenceShare = round(m.frProminence / prom);
  m.frProminence = Math.round(m.frProminence);
  m.enProminence = Math.round(m.enProminence);
  m.frAboveFold = Math.round(m.frAboveFold);
  m.enAboveFold = Math.round(m.enAboveFold);
  return m;
}

export function contentLanguage(m: PageMetrics): ContentLanguage {
  if (m.frChars + m.enChars < 40 || m.frCharShare === null) return "unknown";
  if (m.frCharShare >= 0.85) return "fr";
  if (m.frCharShare <= 0.15) return "en";
  return "bilingual";
}

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

export interface PageAnalysis {
  blocks: Block[];
  metrics: PageMetrics;
  language: ContentLanguage;
  issues: Issue[];
  candidates: TranslationCandidate[];
}

/**
 * @param hasFrenchAlternate whether hreflang points to a French version of this page
 * @param brands business/brand names that may stay in English (the page's own
 *   declared site name is always added)
 */
export function analyzePage(ex: Extraction, hasFrenchAlternate: boolean, brands: string[] = []): PageAnalysis {
  const blocks = classifyBlocks(ex.blocks, brandStripper([...brands, ex.siteName]));
  const metrics = computeMetrics(blocks, ex.truncated);
  const language = contentLanguage(metrics);
  const htmlLang = ex.htmlLang.toLowerCase();
  const declaredFr = htmlLang.startsWith("fr");
  const issues: Issue[] = [];
  let needsFrench = false;

  const english = (pred: (b: Block) => boolean) =>
    blocks.filter((b) => (b.lang === "en" || b.lang === "mixed") && pred(b));
  const sample = (bs: Block[]) => [...new Set(bs.map((b) => b.text.slice(0, 120)))].slice(0, 12);

  if (language === "en" && !declaredFr) {
    if (hasFrenchAlternate) {
      issues.push({
        code: "ENGLISH_PAGE_WITH_FRENCH_VERSION",
        severity: "info",
        message: "English page; a French version is linked via hreflang. Make sure the French version is scanned too.",
      });
    } else {
      needsFrench = true;
      issues.push({
        code: "NO_FRENCH_VERSION",
        severity: "critical",
        message:
          "Page content is in English and no French version is linked. Documents available to the public must be in French, whatever the medium (Charter s. 52).",
        details: { frCharShare: metrics.frCharShare },
      });
    }
  }

  if (language === "bilingual" || language === "fr" || declaredFr) {
    needsFrench = true;
    if (metrics.enProminence > metrics.frProminence) {
      issues.push({
        code: "ENGLISH_MORE_PROMINENT",
        severity: "high",
        message: `English is visually more prominent than French (French prominence share ${pct(metrics.frProminenceShare)}). French must be at least as prominent, and markedly predominant in advertising.`,
        details: { frProminence: metrics.frProminence, enProminence: metrics.enProminence },
      });
    }
    if (metrics.maxFontEn > 0 && metrics.maxFontFr > 0 && metrics.maxFontEn > metrics.maxFontFr + 0.5) {
      issues.push({
        code: "ENGLISH_LARGER_TEXT",
        severity: "medium",
        message: `Largest English text (${metrics.maxFontEn}px) is bigger than the largest French text (${metrics.maxFontFr}px).`,
      });
    }
    if (metrics.enAboveFold > metrics.frAboveFold && metrics.enAboveFold > 0) {
      issues.push({
        code: "ENGLISH_DOMINATES_ABOVE_FOLD",
        severity: "medium",
        message: "English dominates the first screen visitors see (above the fold).",
        details: { frAboveFold: metrics.frAboveFold, enAboveFold: metrics.enAboveFold },
      });
    }
  }

  if (language === "fr" || declaredFr) {
    const untranslated = english((b) => b.kind === "text");
    if (untranslated.length) {
      const share = metrics.frProminenceShare ?? 1;
      issues.push({
        code: "UNTRANSLATED_TEXT",
        severity: share < 0.9 ? "high" : "medium",
        message: `${untranslated.length} visible text element(s) on this French page are still in English.`,
        details: { examples: sample(untranslated) },
      });
    }
    const attrs = english((b) => b.kind !== "text" && b.kind !== "meta");
    if (attrs.length) {
      issues.push({
        code: "UNTRANSLATED_ATTRIBUTES",
        severity: "medium",
        message: `${attrs.length} image alt text / placeholder / label(s) are in English.`,
        details: { examples: sample(attrs) },
      });
    }
    const meta = english((b) => b.kind === "meta");
    if (meta.length) {
      issues.push({
        code: "UNTRANSLATED_META",
        severity: "medium",
        message: "Page title or meta description is in English.",
        details: { examples: sample(meta) },
      });
    }
  }

  if (!htmlLang) {
    issues.push({
      code: "HTML_LANG_MISSING",
      severity: "low",
      message: 'The <html> element has no lang attribute (lang="fr-CA" on French pages, lang="en-CA" on English pages).',
    });
  } else if ((language === "fr" && !declaredFr) || (language === "en" && declaredFr)) {
    issues.push({
      code: "HTML_LANG_MISMATCH",
      severity: "low",
      message: `<html lang="${ex.htmlLang}"> does not match the detected content language (${language}).`,
    });
  }

  const candidates: TranslationCandidate[] = [];
  if (needsFrench) {
    const seen = new Set<string>();
    for (const b of blocks) {
      if (b.lang !== "en" && b.lang !== "mixed") continue;
      const key = `${b.kind}|${b.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ text: b.text, kind: b.kind, context: `${b.role} <${b.tag}>` });
    }
  }

  return { blocks, metrics, language, issues, candidates };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export type { Lang };
