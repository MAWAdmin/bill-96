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
