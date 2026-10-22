import { test, expect } from "@playwright/test";
import { brandStripper, detectLanguage, englishNames, glossaryBrands, tokenize } from "../../src/lib/scanner/language";

test.describe("detectLanguage", () => {
  const cases: [string, string][] = [
    ["Add to cart", "en"],
    ["Ajouter au panier", "fr"],
    ["Free shipping on all orders over $50", "en"],
    ["Livraison gratuite pour les commandes de plus de 50 $", "fr"],
    ["Sold out", "en"],
    ["Épuisé", "fr"],
    ["Mon compte", "fr"],
    ["My account", "en"],
    ["Sign up for our newsletter", "en"],
    ["Abonnez-vous à notre infolettre", "fr"],
    ["Notre sirop d'érable est fabriqué au Québec", "fr"],
    ["GlowRadiance X200", "unknown"],
    ["$29.99", "unknown"],
    ["Menu", "unknown"],
    ["Ajouter to cart", "mixed"],
    // "or" is gold in French, "en" is French: jewellery alt text from a real store.
    ["Bague en or rose 14 carats sertie de diamants, avec anneau assorti.", "fr"],
    ["Bague de fiançailles en or rose 14 carats", "fr"],
    ["Code promo", "unknown"],
    ["Enter discount code", "en"],
    ["14K rose gold ring with a 0.49-carat old-cut natural centre diamond. Free shipping in Canada.", "en"],
  ];
  for (const [text, lang] of cases) {
    test(`${JSON.stringify(text)} -> ${lang}`, () => {
      expect(detectLanguage(text).lang).toBe(lang);
    });
  }

  test('French "on" is not counted as English (old stopword bug)', () => {
    const r = detectLanguage("On vous livre partout au Québec, on est fiers de nos produits");
    expect(r.en).toBe(0);
    expect(r.lang).toBe("fr");
  });

  test("splits French elisions", () => {
    expect(tokenize("l'érable d'été")).toEqual(["l'", "érable", "d'", "été"]);
  });
});

test.describe("brand names", () => {
  test("are blanked out, whole words only, any case", () => {
    const strip = brandStripper(["Maple Shop", "GlowRadiance"]);
    expect(detectLanguage(strip("Sirop d'érable pur 500 ml — MAPLE SHOP")).lang).toBe("fr");
    expect(detectLanguage(strip("Maple Shop")).lang).toBe("unknown");
    expect(strip("GlowRadiances")).toBe("GlowRadiances");
  });

  test("everyday words and very short names are never blanked out", () => {
    const strip = brandStripper(["Shop", "Boutique", "AB", null, ""]);
    expect(strip("Shop now")).toBe("Shop now");
    expect(detectLanguage(strip("Shop now")).lang).toBe("en");
  });

  test("glossary bare terms are brands; notes in brackets are dropped", () => {
    expect(glossaryBrands("Add to cart => Ajouter au panier\nGlowRadiance (brand: keep as is)\n\n  Pajar  \n")).toEqual(["GlowRadiance", "Pajar"]);
  });
});

test("English business names get one reminder; French, coined and confirmed names don't", () => {
  const names = ["Maple Shop", "maple shop", "Bijoutiers Paul Nudelman", "Pajar Canada", "Boutique Érable", null, "GlowRadiance Store"];
  expect(englishNames(names, ["GlowRadiance Store"])).toEqual([{ name: "Maple Shop", genericWords: ["shop"] }]);
});
