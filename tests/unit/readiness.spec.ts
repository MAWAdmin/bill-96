import { test, expect } from "@playwright/test";
import { computeReadiness, type ReadinessPage } from "../../src/lib/readiness";

let n = 0;
const page = (url: string, o: Partial<ReadinessPage> = {}): ReadinessPage => ({
  id: `p${++n}`,
  url,
  final_url: url,
  title: url.split("/").pop() || "home",
  page_language: "fr",
  html_lang: "fr-CA",
  error: null,
  hreflang: [],
  has_screenshot: true,
  codes: [],
  ...o,
});
const fr = (href: string) => [{ hreflang: "fr-CA", href, raw: href }];
const english = (url: string, french: string, codes: string[] = ["ENGLISH_PAGE_WITH_FRENCH_VERSION"]) =>
  page(url, { page_language: "en", html_lang: "en-CA", hreflang: fr(french), codes });

test("an English page and its French version are one store page, judged on the French side", () => {
  const en = english("https://s.com/products/a", "https://s.com/fr/products/a");
  const frPage = page("https://s.com/fr/products/a/", { codes: ["UNTRANSLATED_TEXT", "HREFLANG_NO_X_DEFAULT"] });
  const r = computeReadiness([en, frPage]);
  expect(r.groups).toHaveLength(1);
  expect(r.groups[0]).toMatchObject({ status: "leftovers", problems: ["UNTRANSLATED_TEXT"], english: en, french: frPage });
  expect(r.percent).toBe(0);
});

test("English pages whose French version wasn't checked don't count against readiness", () => {
  const r = computeReadiness([english("https://s.com/a", "https://s.com/fr/a"), english("https://s.com/b", "https://s.com/fr/b")]);
  expect(r.counts.unchecked).toBe(2);
  expect(r.percent).toBeNull();
  expect(r.frenchPages).toBe(0);
});

test("readiness is the share of judged pages that are French-ready", () => {
  const r = computeReadiness([
    page("https://s.com/fr/ok", { codes: ["HTML_LANG_MISSING", "CONSOLE_ERRORS"] }),
    page("https://s.com/en-only", { page_language: "en", html_lang: "en", codes: ["NO_FRENCH_VERSION"] }),
    page("https://s.com/broken", { error: "Timeout", codes: ["LOAD_FAILED"] }),
    page("https://s.com/gone", { codes: ["HTTP_ERROR"] }),
    page("https://s.com/cart", { page_language: "unknown", html_lang: "" }),
  ]);
  expect(r.counts).toMatchObject({ ready: 1, missing: 1, failed: 2, unclear: 1 });
  expect(r.percent).toBe(50);
  expect(r.groups.map((g) => g.status)).toEqual(["missing", "failed", "failed", "unclear", "ready"]);
});

test("bilingual pages and pages declared French are judged as French", () => {
  const r = computeReadiness([
    page("https://s.com/sale", { page_language: "bilingual", html_lang: "en", codes: ["ENGLISH_MORE_PROMINENT"] }),
    page("https://s.com/store", { page_language: "unknown", html_lang: "fr" }),
  ]);
  expect(r.groups.map((g) => [g.status, !!g.french])).toEqual([["leftovers", true], ["ready", true]]);
});
