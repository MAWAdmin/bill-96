import { test, expect } from "@playwright/test";
import { rankIssues, riskBand, rollUpSiteScore, worstOf } from "../../src/lib/siteScore";

test.describe("site score rollup", () => {
  test("clean site scores 100 and is low risk", () => {
    expect(rollUpSiteScore([{ score: 100, worst: null }, { score: 100, worst: "info" }])).toEqual({ score: 100, band: "low" });
  });

  test("pages with serious issues weigh more than clean ones", () => {
    // Plain average would be 87.5; the critical page counts 4x.
    const r = rollUpSiteScore([
      { score: 50, worst: "critical" },
      { score: 100, worst: null },
      { score: 100, worst: null },
      { score: 100, worst: null },
    ]);
    expect(r.score).toBe(71); // (4*50 + 3*100) / 7
    expect(r.band).toBe("high");
  });

  test("weights follow severity: critical > high > medium > low", () => {
    const one = (worst: "critical" | "high" | "medium" | "low") => rollUpSiteScore([{ score: 0, worst }, { score: 100, worst: null }]).score!;
    expect(one("critical")).toBeLessThan(one("high"));
    expect(one("high")).toBeLessThan(one("medium"));
    expect(one("medium")).toBeLessThan(one("low"));
    expect(one("low")).toBe(50);
  });

  test("pages that failed to load are left out", () => {
    expect(rollUpSiteScore([{ score: 0, worst: "critical", failed: true }, { score: 92, worst: "low" }])).toEqual({ score: 92, band: "low" });
    expect(rollUpSiteScore([{ score: 0, worst: "critical", failed: true }])).toEqual({ score: null, band: null });
    expect(rollUpSiteScore([])).toEqual({ score: null, band: null });
  });

  test("band thresholds", () => {
    expect(riskBand(100, null)).toBe("low");
    expect(riskBand(85, null)).toBe("low");
    expect(riskBand(84, null)).toBe("medium");
    expect(riskBand(60, null)).toBe("medium");
    expect(riskBand(59, null)).toBe("high");
    expect(riskBand(35, null)).toBe("high");
    expect(riskBand(34, null)).toBe("critical");
    expect(riskBand(0, null)).toBe("critical");
  });

  test("the worst issue sets a floor on the band", () => {
    expect(riskBand(95, "critical")).toBe("high");
    expect(riskBand(95, "high")).toBe("medium");
    expect(riskBand(95, "medium")).toBe("low");
    expect(riskBand(20, "high")).toBe("critical");
  });

  test("worstOf and rankIssues", () => {
    expect(worstOf([null, "low", "high", "medium"])).toBe("high");
    expect(worstOf([null, null])).toBeNull();
    const ranked = rankIssues([
      { code: "HTML_LANG_MISSING", severity: "low", pages: 6 },
      { code: "UNTRANSLATED_TEXT", severity: "high", pages: 1 },
      { code: "NO_FRENCH_VERSION", severity: "critical", pages: 1 },
      { code: "ENGLISH_MORE_PROMINENT", severity: "high", pages: 3 },
    ]);
    expect(ranked.map((i) => i.code)).toEqual(["NO_FRENCH_VERSION", "ENGLISH_MORE_PROMINENT", "UNTRANSLATED_TEXT", "HTML_LANG_MISSING"]);
  });
});
