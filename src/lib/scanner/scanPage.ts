import type { Browser, BrowserContext } from "playwright";
import { AUTOSCROLL_SCRIPT, EXTRACT_SCRIPT, type Extraction } from "./extract";
import { analyzePage } from "./analyze";
import { checkHreflangTags, checkReciprocity, hasFrenchAlternate } from "./hreflang";
import { BROWSER_UA, isHostAllowed } from "../net";
import { scoreFromIssues, type Block, type ContentLanguage, type HreflangTag, type Issue, type PageMetrics, type TranslationCandidate } from "./types";

export interface PageResult {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  title: string | null;
  htmlLang: string | null;
  language: ContentLanguage | null;
  metrics: PageMetrics | null;
  hreflang: HreflangTag[];
  blocks: Block[];
  consoleErrors: string[];
  issues: Issue[];
  candidates: TranslationCandidate[];
  score: number;
  screenshot: Buffer | null;
  error: string | null;
  /** True when the URL is not an HTML page (e.g. a .md or PDF in the sitemap); not scored. */
  skipped: boolean;
}

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b?.isConnected()) return b;
  }
  const { chromium } = await import("playwright");
  const channel = process.env.BROWSER_CHANNEL || "chrome";
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  browserPromise = chromium.launch({
    channel: channel === "chromium" ? undefined : channel,
    headless: true,
    proxy: proxy ? { server: proxy, bypass: "localhost,127.0.0.1" } : undefined,
  });
  return browserPromise;
}

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => {});
}

async function newGuardedContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: "fr-CA",
    extraHTTPHeaders: { "accept-language": "fr-CA,fr;q=0.9,en;q=0.5" },
    userAgent: BROWSER_UA,
  });
  // Every request the page makes (including redirects and sub-resources) is
  // checked, so a scanned page can't make the scanner read internal services.
  await context.route("**/*", async (route) => {
    try {
      // Video/audio never affects text or layout measurements; skipping it
      // makes heavy storefront pages load much faster.
      if (route.request().resourceType() === "media") return route.abort("blockedbyclient");
      const u = new URL(route.request().url());
      if ((u.protocol === "http:" || u.protocol === "https:") && !(await isHostAllowed(u.hostname))) {
        return route.abort("blockedbyclient");
      }
    } catch {}
    return route.continue();
  });
  return context;
}

export async function scanPage(
  url: string,
  opts: { reciprocityCache?: Map<string, Promise<any>>; screenshot?: boolean } = {}
): Promise<PageResult> {
  const result: PageResult = {
    url,
    finalUrl: null,
    httpStatus: null,
    title: null,
    htmlLang: null,
    language: null,
    metrics: null,
    hreflang: [],
    blocks: [],
    consoleErrors: [],
    issues: [],
    candidates: [],
    score: 0,
    screenshot: null,
    error: null,
    skipped: false,
  };

  const browser = await getBrowser();
  const context = await newGuardedContext(browser);
  const page = await context.newPage();
  page.on("console", (msg) => {
    // Requests the scanner blocks itself (video, private hosts) are logged by
    // Chrome as net::ERR_BLOCKED_BY_CLIENT; they are not the site's errors.
    if (msg.type() !== "error" || msg.text().includes("ERR_BLOCKED_BY_CLIENT")) return;
    if (result.consoleErrors.length < 50) result.consoleErrors.push(msg.text().slice(0, 500));
  });
  page.on("pageerror", (err) => {
    if (result.consoleErrors.length < 50) result.consoleErrors.push(String(err).slice(0, 500));
  });

  try {
    // domcontentloaded + a settle period: storefronts with chat widgets and
    // analytics never reach "networkidle". Heavy pages (100+ requests) can
    // exceed the first timeout while other pages load in parallel, so retry
    // once with a longer one before reporting the page as failed.
    let res;
    try {
      res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (e) {
      if (!(e instanceof Error && /Timeout/i.test(e.message))) throw e;
      res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }
    result.httpStatus = res?.status() ?? null;
    const contentType = res?.headers()["content-type"] ?? "";
    if (contentType && !/html/i.test(contentType)) {
      result.skipped = true;
      result.error = `Not an HTML page (${contentType.split(";")[0]})`;
      return result;
    }
    await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => {});
    await page.evaluate(AUTOSCROLL_SCRIPT).catch(() => {});
    await page.waitForTimeout(1_000);
    result.finalUrl = page.url();

    const ex = (await page.evaluate(EXTRACT_SCRIPT)) as Extraction;
    result.title = ex.title;
    result.htmlLang = ex.htmlLang;
    result.hreflang = ex.hreflang;

    const pageUrl = result.finalUrl || url;
    const analysis = analyzePage(ex, hasFrenchAlternate(ex.hreflang, pageUrl));
    result.language = analysis.language;
    result.metrics = analysis.metrics;
    result.blocks = analysis.blocks;
    result.candidates = analysis.candidates;
    result.issues.push(...analysis.issues);
    result.issues.push(...checkHreflangTags(ex.hreflang, pageUrl, ex.canonical));
    if (ex.hreflang.length) {
      result.issues.push(...(await checkReciprocity(ex.hreflang, pageUrl, opts.reciprocityCache ?? new Map(), ex.canonical)));
    }
    if (result.httpStatus && result.httpStatus >= 400) {
      result.issues.push({ code: "HTTP_ERROR", severity: "high", message: `Page returned HTTP ${result.httpStatus}.` });
    }
    if (result.consoleErrors.length) {
      result.issues.push({
        code: "CONSOLE_ERRORS",
        severity: "info",
        message: `${result.consoleErrors.length} JavaScript/console error(s) on load. Translation apps that fail can leave English visible.`,
      });
    }
    if (opts.screenshot !== false) {
      result.screenshot = await page.screenshot({ type: "jpeg", quality: 60 }).catch(() => null);
    }
    result.score = scoreFromIssues(result.issues);
  } catch (e) {
    result.error = e instanceof Error ? e.message.split("\n")[0] : String(e);
    result.issues.push({ code: "LOAD_FAILED", severity: "critical", message: `Page could not be loaded: ${result.error}` });
    result.score = 0;
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}
