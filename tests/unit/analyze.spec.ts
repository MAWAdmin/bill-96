import { test, expect } from "@playwright/test";
import { analyzePage } from "../../src/lib/scanner/analyze";
import type { Extraction, RawBlock } from "../../src/lib/scanner/extract";
import {
  checkHreflangTags,
  frenchAlternate,
  hasFrenchAlternate,
  normalizeUrl,
  parseHreflangFromHtml,
} from "../../src/lib/scanner/hreflang";
import { isPrivateIp } from "../../src/lib/net";
import { scoreFromIssues } from "../../src/lib/scanner/types";

const block = (text: string, o: Partial<RawBlock> = {}): RawBlock => ({
  text,
  kind: "text",
  role: "body",
  tag: "p",
  fontSize: 16,
  fontWeight: 400,
  top: 100,
  inViewport: true,
  selector: "p",
  ...o,
});

const ex = (blocks: RawBlock[], htmlLang = "fr-CA", siteName: string | null = null): Extraction => ({
  htmlLang,
  title: "t",
  siteName,
  canonical: null,
  hreflang: [],
  blocks,
  truncated: false,
});

const codes = (a: { issues: { code: string }[] }) => a.issues.map((i) => i.code);

test("English-only page without French alternate is critical", () => {
  const a = analyzePage(
    ex([block("Our maple syrup is made from the first sap of the season and shipped free to your door."), block("Add to cart", { role: "button" })], "en"),
    false
  );
  expect(a.language).toBe("en");
  expect(codes(a)).toContain("NO_FRENCH_VERSION");
  expect(a.candidates.map((c) => c.text)).toContain("Add to cart");
  expect(scoreFromIssues(a.issues)).toBeLessThanOrEqual(50);
});

test("English page that links a French version is only informational", () => {
  const a = analyzePage(ex([block("Our maple syrup is made from the first sap of the season and shipped free to your door.")], "en"), true);
  expect(codes(a)).toEqual(["ENGLISH_PAGE_WITH_FRENCH_VERSION"]);
  expect(a.candidates).toHaveLength(0);
});

test("big English heading over small French text is flagged as more prominent", () => {
  const a = analyzePage(
    ex(
      [
        block("Spring sale: save up to 40% on all products this week only", { fontSize: 48, fontWeight: 700, role: "heading" }),
        block("Soldes du printemps : économisez jusqu'à 40 % sur tous les produits cette semaine seulement", { fontSize: 12 }),
      ],
      "en"
    ),
    false
  );
  expect(a.language).toBe("bilingual");
  expect(codes(a)).toEqual(expect.arrayContaining(["ENGLISH_MORE_PROMINENT", "ENGLISH_LARGER_TEXT"]));
});

test("equal-size bilingual text is not flagged for prominence", () => {
  const a = analyzePage(
    ex([
      block("Économisez jusqu'à 40 % sur tous les produits de l'érable cette semaine", { fontSize: 20 }),
      block("Save up to 40% on all maple products this week", { fontSize: 20 }),
    ]),
    false
  );
  expect(codes(a)).not.toContain("ENGLISH_MORE_PROMINENT");
  expect(codes(a)).not.toContain("ENGLISH_LARGER_TEXT");
});

test("French page with leftover English UI strings and alt text", () => {
  const a = analyzePage(
    ex([
      block("Notre sirop d'érable ambré est fabriqué avec la première sève de la saison, dans notre érablière familiale."),
      block("Add to cart", { role: "button" }),
      block("Bottle of pure maple syrup on a wooden table", { kind: "alt", fontSize: 0 }),
      block("Shop our best-selling maple syrup", { kind: "meta", role: "meta", fontSize: 0, inViewport: false }),
    ]),
    false
  );
  expect(a.language).toBe("fr");
  expect(codes(a)).toEqual(expect.arrayContaining(["UNTRANSLATED_TEXT", "UNTRANSLATED_ATTRIBUTES", "UNTRANSLATED_META"]));
  expect(a.candidates.map((c) => c.kind).sort()).toEqual(["alt", "meta", "text"]);
});

test("fully French page has no language issues and no candidates", () => {
  const a = analyzePage(
    ex([block("Depuis trois générations, notre famille récolte la sève des érables de la Beauce."), block("Ajouter au panier")]),
    false
  );
  expect(a.issues).toHaveLength(0);
  expect(a.candidates).toHaveLength(0);
});

test.describe("business and brand names", () => {
  // A French page of a store whose name is English.
  const page = () => [
    block("Depuis trois générations, notre famille récolte la sève des érables de la Beauce."),
    block("Maple Shop", { kind: "alt", tag: "img" }),
    block("Sirop d'érable — Maple Shop", { kind: "meta", role: "meta", tag: "head" }),
  ];

  test("an English business name makes French text look English when it isn't known", () => {
    const a = analyzePage(ex(page()), false);
    expect(a.candidates.map((c) => c.text)).toEqual(expect.arrayContaining(["Maple Shop", "Sirop d'érable — Maple Shop"]));
  });

  test("the site's name and glossary brands never count as English", () => {
    const a = analyzePage(ex(page()), false, ["Maple Shop"]);
    expect(a.issues).toEqual([]);
    expect(a.candidates).toEqual([]);
  });

  test("the name the page declares (og:site_name) is used automatically", () => {
    const a = analyzePage(ex(page(), "fr-CA", "Maple Shop"), false);
    expect(a.issues).toEqual([]);
  });

  test("English around a brand name is still English", () => {
    const a = analyzePage(ex([...page(), block("Our Story — Maple Shop", { role: "heading", tag: "h2" })], "fr-CA", "Maple Shop"), false);
    expect(a.candidates.map((c) => c.text)).toEqual(["Our Story — Maple Shop"]);
  });
});

test.describe("hreflang", () => {
  test("normalizeUrl ignores trailing slash, fragment and host case", () => {
    expect(normalizeUrl("https://Shop.COM/fr/#top")).toBe(normalizeUrl("https://shop.com/fr"));
    expect(normalizeUrl("https://shop.com/")).toBe(normalizeUrl("https://shop.com"));
    expect(normalizeUrl("https://shop.com/a?x=1")).not.toBe(normalizeUrl("https://shop.com/a"));
  });

  test("accepts lowercase and script codes, rejects underscores", () => {
    const tags = [
      { hreflang: "fr-ca", href: "https://s.com/fr", raw: "/fr" },
      { hreflang: "zh-Hant", href: "https://s.com/zh", raw: "/zh" },
      { hreflang: "en_CA", href: "https://s.com/en", raw: "/en" },
      { hreflang: "x-default", href: "https://s.com/", raw: "/" },
    ];
    const issues = checkHreflangTags(tags, "https://s.com/fr/", null);
    const invalid = issues.find((i) => i.code === "HREFLANG_INVALID_CODE");
    expect(invalid?.message).toContain("en_CA");
    expect(invalid?.message).not.toContain("fr-ca");
    expect(invalid?.message).not.toContain("zh-Hant");
    expect(issues.map((i) => i.code)).not.toContain("HREFLANG_NO_SELF");
  });

  test("relative hrefs resolve and self-reference matches via canonical", () => {
    const tags = parseHreflangFromHtml(
      `<link rel="alternate" hreflang="fr-CA" href="/fr/p?a=1&amp;b=2"><link hreflang='en' rel='alternate' href='https://s.com/en/p'>`,
      "https://s.com/en/p"
    );
    expect(tags[0].href).toBe("https://s.com/fr/p?a=1&b=2");
    expect(hasFrenchAlternate(tags, "https://s.com/en/p")).toBe(true);
    expect(checkHreflangTags(tags, "https://s.com/en/p?utm=x", "https://s.com/en/p").map((i) => i.code)).not.toContain("HREFLANG_NO_SELF");
  });

  test("frenchAlternate prefers fr-CA, then fr, and never returns the page itself", () => {
    const tag = (hreflang: string, href: string) => ({ hreflang, href, raw: href });
    const tags = [tag("fr", "https://s.com/fr/p"), tag("fr-CA", "https://s.com/ca-fr/p/"), tag("en-CA", "https://s.com/p")];
    expect(frenchAlternate(tags, "https://s.com/p")).toBe("https://s.com/ca-fr/p");
    expect(frenchAlternate([tag("fr-FR", "https://s.com/fr-fr/p"), tag("fr", "https://s.com/fr/p")], "https://s.com/p")).toBe("https://s.com/fr/p");
    expect(frenchAlternate([tag("fr-CA", "https://s.com/fr/p")], "https://s.com/fr/p/")).toBeNull();
    expect(frenchAlternate([tag("en", "https://s.com/p")], "https://s.com/p")).toBeNull();
  });

  test("flags missing French alternate", () => {
    const issues = checkHreflangTags([{ hreflang: "en-CA", href: "https://s.com/", raw: "/" }], "https://s.com/", null);
    expect(issues.map((i) => i.code)).toContain("HREFLANG_NO_FRENCH");
  });
});

test("private IP detection", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
    expect(isPrivateIp(ip), ip).toBe(true);
  }
  for (const ip of ["8.8.8.8", "23.227.38.65", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
});
