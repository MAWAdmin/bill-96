import { test, expect } from "@playwright/test";
import { scanPage, closeBrowser } from "../../src/lib/scanner/scanPage";
import { discoverUrls } from "../../src/lib/scanner/discover";
import { assertScannableUrl } from "../../src/lib/net";

// Real browser scans of the fixture storefront (tests/fixtures/site).
const ORIGIN = "http://127.0.0.1:4100";
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  process.env.ALLOW_PRIVATE_URLS = "1";
});
test.afterAll(async () => {
  await closeBrowser();
});

const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

test("English-only page → NO_FRENCH_VERSION", async () => {
  const r = await scanPage(`${ORIGIN}/english-only.html`, { screenshot: false });
  expect(r.error).toBeNull();
  expect(r.language).toBe("en");
  expect(codes(r)).toContain("NO_FRENCH_VERSION");
  expect(r.candidates.map((c) => c.text)).toContain("Subscribe");
});

test("French product page with English leftovers", async () => {
  const r = await scanPage(`${ORIGIN}/fr/product.html`, { screenshot: true });
  expect(r.language).toBe("fr");
  expect(codes(r)).toEqual(expect.arrayContaining(["UNTRANSLATED_TEXT", "UNTRANSLATED_ATTRIBUTES", "UNTRANSLATED_META", "ENGLISH_LARGER_TEXT"]));
  // Reciprocal hreflang with the English page → no reciprocity issues.
  expect(codes(r)).not.toContain("HREFLANG_NOT_RECIPROCAL");
  const texts = r.candidates.map((c) => c.text);
  expect(texts).toEqual(expect.arrayContaining(["Add to cart", "Free shipping on all orders over $50!", "Enter quantity"]));
  expect(r.screenshot?.length).toBeGreaterThan(1000);
  const banner = r.blocks.find((b) => b.text.startsWith("Free shipping"));
  expect(banner?.fontSize).toBe(36);
  expect(banner?.fontWeight).toBe(700);
});

test("bilingual page with dominant English", async () => {
  const r = await scanPage(`${ORIGIN}/bilingual.html`, { screenshot: false });
  expect(r.language).toBe("bilingual");
  expect(codes(r)).toEqual(expect.arrayContaining(["ENGLISH_MORE_PROMINENT", "ENGLISH_LARGER_TEXT"]));
});

test("broken hreflang setup", async () => {
  const r = await scanPage(`${ORIGIN}/broken-hreflang.html`, { screenshot: false });
  expect(codes(r)).toEqual(
    expect.arrayContaining(["HREFLANG_INVALID_CODE", "HREFLANG_NO_X_DEFAULT", "HREFLANG_BROKEN_ALTERNATE", "HREFLANG_NOT_RECIPROCAL", "HTML_LANG_MISSING"])
  );
});

test("clean French page scores 100", async () => {
  const r = await scanPage(`${ORIGIN}/fr/good.html`, { screenshot: false });
  expect(r.issues).toEqual([]);
  expect(r.score).toBe(100);
});

test("sitemap discovery", async () => {
  const urls = await discoverUrls(`${ORIGIN}/`, 20);
  expect(urls[0]).toBe(ORIGIN);
  expect(urls).toHaveLength(7);
  expect(urls).toContain(`${ORIGIN}/fr/product.html`);
});

test("private URLs are refused when not allowed", async () => {
  process.env.ALLOW_PRIVATE_URLS = "0";
  try {
    await expect(assertScannableUrl("http://127.0.0.1:4100/")).rejects.toThrow(/not allowed/);
    await expect(assertScannableUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/not allowed/);
    await expect(assertScannableUrl("file:///etc/passwd")).rejects.toThrow(/http/);
  } finally {
    process.env.ALLOW_PRIVATE_URLS = "1";
  }
});
