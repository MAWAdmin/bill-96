import type { Severity } from "./scanner/types";

/** Human-readable names and fix guidance for each issue code. */
export const ISSUE_LABELS: Record<string, { label: string; severity: Severity; fix: string }> = {
  NO_FRENCH_VERSION: {
    label: "No French version",
    severity: "critical",
    fix: "Publish a French version of this page (Shopify: enable French in Settings > Languages and translate with Translate & Adapt; WordPress: WPML/Polylang/TranslatePress) and link it with hreflang.",
  },
  ENGLISH_MORE_PROMINENT: {
    label: "English more prominent than French",
    severity: "high",
    fix: "Give French text at least the same size, weight and placement as English, or remove the English duplicate.",
  },
  ENGLISH_LARGER_TEXT: {
    label: "English text larger than French",
    severity: "medium",
    fix: "Make the French heading/label at least as large as the English one.",
  },
  ENGLISH_DOMINATES_ABOVE_FOLD: {
    label: "English dominates the first screen",
    severity: "medium",
    fix: "Lead with French in the hero, header and announcement bar.",
  },
  UNTRANSLATED_TEXT: {
    label: "English text on French page",
    severity: "high",
    fix: "Translate the listed strings (see the Translations queue). Often theme/app strings missed by the translation app.",
  },
  UNTRANSLATED_ATTRIBUTES: {
    label: "English alt text / placeholders",
    severity: "medium",
    fix: "Translate image alt text, input placeholders, and button labels.",
  },
  UNTRANSLATED_META: {
    label: "English page title / description",
    severity: "medium",
    fix: "Translate the SEO title and meta description for the French page.",
  },
  ENGLISH_PAGE_WITH_FRENCH_VERSION: {
    label: "English page (French version linked)",
    severity: "info",
    fix: "Nothing to do here; make sure the French version is scanned too.",
  },
  HTML_LANG_MISSING: {
    label: "Missing <html lang>",
    severity: "low",
    fix: 'Add a lang attribute to the <html> tag: lang="fr-CA" on French pages, lang="en-CA" on English pages.',
  },
  HTML_LANG_MISMATCH: { label: "<html lang> mismatch", severity: "low", fix: "Make the lang attribute match the page's actual language." },
  HREFLANG_MISSING: { label: "No hreflang tags", severity: "low", fix: "Add <link rel=alternate hreflang> tags for each language version and x-default." },
  HREFLANG_NO_SELF: { label: "hreflang missing self-reference", severity: "low", fix: "Include the page itself in its hreflang set." },
  HREFLANG_NO_X_DEFAULT: { label: "No x-default hreflang", severity: "low", fix: 'Add hreflang="x-default" pointing at the default/selector page.' },
  HREFLANG_INVALID_CODE: { label: "Invalid hreflang code", severity: "medium", fix: 'Use ISO codes like "fr-CA", "en-CA", "fr".' },
  HREFLANG_NO_FRENCH: { label: "No French hreflang", severity: "high", fix: 'Add an hreflang="fr-CA" (or "fr") alternate.' },
  HREFLANG_CONFLICT: { label: "Conflicting hreflang", severity: "medium", fix: "Each language code should point to exactly one URL." },
  HREFLANG_BROKEN_ALTERNATE: { label: "Broken hreflang alternate", severity: "medium", fix: "Fix or remove hreflang links that 404 or fail." },
  HREFLANG_NOT_RECIPROCAL: { label: "hreflang not reciprocal", severity: "medium", fix: "Each alternate page must link back to this page." },
  HTTP_ERROR: { label: "HTTP error", severity: "high", fix: "The page returned an error status." },
  LOAD_FAILED: { label: "Page failed to load", severity: "critical", fix: "Check the URL is reachable from the scanner." },
  CONSOLE_ERRORS: { label: "JavaScript errors", severity: "info", fix: "Broken scripts can stop translation apps from swapping text to French." },
};

/** How to add a French version, per store platform. */
export const ADD_FRENCH_HINT: Record<string, string> = {
  shopify: "Turn on French in Shopify (Settings → Languages), then translate your pages with the Translate & Adapt app.",
  wordpress: "Add French versions with WPML, Polylang or TranslatePress.",
  generic: "Publish a French version and link it to the English one.",
};
