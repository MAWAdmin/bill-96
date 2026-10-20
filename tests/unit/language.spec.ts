import { test, expect } from "@playwright/test";
import { detectLanguage, tokenize } from "../../src/lib/scanner/language";

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
