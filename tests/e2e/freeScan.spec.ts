import { test, expect } from "@playwright/test";

/**
 * Free scan funnel in Chrome: paste the fixture store's URL on /scan →
 * results with no account → email unlock (lead reaches the fake HubSpot in
 * the fixture server) → share link → signup → the scan's English strings are
 * in the new site's translation queue.
 */

const FIXTURE = "http://127.0.0.1:4100/";
const uid = Date.now().toString(36);
const EMAIL = `merchant-${uid}@example.com`;
// Copy rule: never "compliant"/"certified", in English or French.
const FORBIDDEN = /complian|certif|conform/i;

test.describe.configure({ mode: "serial" });

let scanUrl = "";
let siteScore = "";

test("paste a URL on /scan and see results without an account", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Run a free scan" }).click();
  await expect(page.getByRole("heading", { name: "Free Bill 96 French scan" })).toBeVisible();
  await page.getByLabel("Store URL").fill(FIXTURE);
  await page.getByRole("button", { name: "Scan my site" }).click();
  // First request to a fresh dev server compiles the route.
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}\?lang=en$/, { timeout: 90_000 });
  scanUrl = page.url();

  // Progress view auto-refreshes until the scan and its French drafts are done.
  const score = page.getByTestId("site-score");
  await expect(score).toBeVisible({ timeout: 150_000 });
  siteScore = (await score.innerText()).trim();
  expect(Number(siteScore)).toBeGreaterThan(0);
  expect(Number(siteScore)).toBeLessThan(100);
  await expect(page.getByTestId("risk-band")).toHaveText("High risk"); // a page with no French version → at least high
  await expect(page.getByText("Pages checked")).toBeVisible();

  const top = page.getByTestId("top-issues").getByTestId("issue");
  await expect(top).toHaveCount(5);
  await expect(top.first()).toContainText("Pages with no French version");
  await expect(top.first()).toContainText("Fix: Publish a French version");

  const drafts = page.getByTestId("drafts").locator("tbody tr");
  await expect(drafts).toHaveCount(10);
  const firstRow = drafts.first().locator("td");
  const english = await firstRow.first().innerText();
  await expect(firstRow.last()).toHaveText(`[FR] ${english}`); // mock provider in tests
  await expect(page.getByText("Placeholder drafts")).toBeVisible();

  // Locked until email.
  await expect(page.getByTestId("all-issues")).toHaveCount(0);
  await expect(page.getByTestId("string-count")).toHaveCount(0);
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);

  await page.getByRole("link", { name: "Français" }).click();
  await expect(page.getByRole("heading", { name: "Analyse du français" })).toBeVisible();
  await expect(page.getByTestId("risk-band")).toHaveText("Risque élevé");
  await expect(page.getByText("Pages sans version française")).toBeVisible();
  await expect(page.getByRole("button", { name: "Afficher tous les résultats" })).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);
});

test("one free scan per domain per 24 hours, and public API guards", async ({ page, request }) => {
  const id = new URL(scanUrl).pathname.split("/").pop()!;
  // Same domain, different page: no new scan, the existing results are returned.
  const again = await request.post("/api/public-scan", { data: { url: "http://127.0.0.1:4100/fr/good.html" } });
  expect(again.status()).toBe(429);
  expect(Number(again.headers()["retry-after"])).toBeGreaterThan(23 * 3600);
  expect((await again.json()).existing).toEqual({ id, resultsUrl: `/scan/${id}` });

  await page.goto("/scan");
  await page.getByLabel("Store URL").fill("127.0.0.1:4100/en/product.html");
  await page.getByRole("button", { name: "Scan my site" }).click();
  await expect(page).toHaveURL(new RegExp(`/scan/${id}\\?lang=en&reused=1$`));
  await expect(page.getByText("This site was scanned in the last 24 hours.")).toBeVisible();

  const status = await request.get(`/api/public-scan/${id}`);
  expect(await status.json()).toMatchObject({ id, status: "completed", siteScore: Number(siteScore), riskBand: "high" });

  const bad = await request.post("/api/public-scan", { data: { url: "not a url" } });
  expect(bad.status()).toBe(400);
  const badEmail = await request.post(`/api/public-scan/${id}/unlock`, { data: { email: "nope" } });
  expect(badEmail.status()).toBe(400);
  expect((await page.goto(`/scan/${"x".repeat(43)}`))?.status()).toBe(404);
});

test("a site that can't be loaded gets a clear message and can be scanned again", async ({ page, request }) => {
  // Nothing listens on this port, so discovery finds nothing and the homepage fails to load.
  const url = "http://127.0.0.1:4199/";
  await page.goto("/scan");
  await page.getByLabel("Store URL").fill(url);
  await page.getByRole("button", { name: "Scan my site" }).click();
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}\?lang=en$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  const card = page.getByTestId("scan-unreachable");
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card).toContainText("We couldn't load this site");
  await expect(card).toContainText("ERR_CONNECTION_REFUSED");
  await expect(page.getByTestId("site-score")).toHaveCount(0);
  await expect(page.getByText("We didn't find English text")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show full results" })).toHaveCount(0);

  // Nothing to unlock, and the domain's free scan isn't used up.
  expect((await request.post(`/api/public-scan/${id}/unlock`, { data: { email: "someone@example.com" } })).status()).toBe(409);
  expect((await request.post("/api/public-scan", { data: { url } })).status()).toBe(202);
});

test("email unlock → share link + HubSpot contact → signup → strings in the queue", async ({ page, request, browser }) => {
  await page.goto(scanUrl);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Name (optional)").fill("Marie Tremblay");
  await page.getByRole("button", { name: "Show full results" }).click();
  await expect(page).toHaveURL(/\/scan\/[A-Za-z0-9_-]{43}\?lang=en$/);
  const shareUrl = page.url().split("?")[0];

  expect(await page.getByTestId("all-issues").getByTestId("issue").count()).toBeGreaterThan(5);
  const stringCount = Number(await page.getByTestId("string-count").innerText());
  expect(stringCount).toBeGreaterThan(10);
  await expect(page.getByText(`${stringCount} English strings need French.`)).toBeVisible();
  await expect(page.getByLabel("Share these results")).toHaveValue(shareUrl);
  expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);

  const contacts = await (await request.get("http://127.0.0.1:4100/hubspot/__contacts")).json();
  expect(contacts).toContainEqual({
    email: EMAIL,
    website: FIXTURE,
    bill96_free_scan: "true",
    bill96_site_score: siteScore,
    firstname: "Marie",
    lastname: "Tremblay",
  });

  // The share link works for anyone, and doesn't carry the email.
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto(shareUrl);
  await expect(other.getByTestId("string-count")).toHaveText(String(stringCount));
  await expect(other.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?from=scan");
  expect(await other.content()).not.toContain(EMAIL);
  await ctx.close();

  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup\?from=scan&email=/);
  await expect(page.getByLabel("Email")).toHaveValue(EMAIL);
  await page.getByLabel("Name").fill("Marie Tremblay");
  await page.getByLabel("Password").fill("correct-horse-42");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const site = page.locator("tr", { hasText: "127.0.0.1:4100" });
  await expect(site).toBeVisible();
  await expect(site.locator(".score")).toHaveText(siteScore);

  await page.goto("/translations");
  await expect(page.getByRole("link", { name: `To review (${stringCount})` })).toBeVisible();
  await expect(page.getByTestId("translation-item").filter({ hasText: "Add to cart" }).first()).toBeVisible();
});
