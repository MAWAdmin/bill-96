import { test, expect, type Page } from "@playwright/test";

/**
 * Full user journey in Chrome: sign up → add a Shopify site → scan the
 * fixture storefront → inspect issues → review/approve French drafts →
 * export → connector settings → tenant isolation → logout.
 */

const FIXTURE = "http://127.0.0.1:4100/";
const uid = Date.now().toString(36);

async function signup(page: Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-42");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe.configure({ mode: "serial" });

let siteUrl = "";
let scanUrl = "";

test("landing page and auth guard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /French-first/ })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  // First server action on a fresh dev server compiles it and creates the
  // database, which can be slow on a busy machine.
  await expect(page.locator(".alert-error")).toHaveText("Incorrect email or password.", { timeout: 90_000 });
});

test("sign up, add a site and scan it", async ({ page }) => {
  await signup(page, "Owner", `owner-${uid}@example.com`);
  await expect(page.getByText("No sites yet.")).toBeVisible();

  await page.getByRole("link", { name: "Add your first site" }).click();
  await page.getByLabel("Name").fill("Boutique Érable");
  await page.getByLabel("Website URL").fill(FIXTURE);
  await page.getByLabel("Platform").selectOption("shopify");
  await page.getByRole("button", { name: "Add site" }).click();
  await expect(page.getByRole("heading", { name: "Boutique Érable" })).toBeVisible();
  siteUrl = page.url();

  await page.getByLabel("Max pages").fill("10");
  await page.getByRole("button", { name: "Start scan" }).click();
  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/);
  scanUrl = page.url();

  // Progress view auto-refreshes until the scan completes.
  await expect(page.getByText("completed", { exact: true })).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText("7/7 pages")).toBeVisible();
  const rows = page.locator("table").last().locator("tbody tr");
  await expect(rows).toHaveCount(7);

  const types = page.locator(".card", { has: page.getByRole("heading", { name: "Issues by type" }) });
  for (const label of ["No French version", "English more prominent than French", "English text on French page", "hreflang not reciprocal"]) {
    await expect(types.getByText(label, { exact: true })).toBeVisible();
  }
});

test("page detail shows measured blocks, issues and screenshot", async ({ page }) => {
  await signin(page);
  await page.goto(scanUrl);
  await page.getByRole("link", { name: /Sirop d'érable pur/ }).click();
  await expect(page.getByText("English text on French page")).toBeVisible();
  await expect(page.getByText("English alt text / placeholders")).toBeVisible();
  await expect(page.getByText("English text larger than French")).toBeVisible();

  const shot = page.getByRole("img", { name: /Screenshot of/ });
  await expect(shot).toBeVisible();
  const src = await shot.getAttribute("src");
  const img = await page.request.get(src!);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/jpeg");
  await expect.poll(() => shot.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(1000);

  await page.getByRole("link", { name: "English", exact: true }).click();
  const banner = page.locator("tr", { hasText: "Free shipping on all orders over $50!" });
  await expect(banner).toContainText("36px");
  await expect(banner).toContainText("700");
});

test("translation queue: review, edit, approve, export, publish", async ({ page }) => {
  await signin(page);
  await page.goto("/translations");
  // Auto-translate (mock provider in tests) drafted every string after the scan.
  await expect(page.getByRole("link", { name: /^Pending \(0\)$/ })).toBeVisible();
  const item = page.getByTestId("translation-item").filter({ hasText: "Free shipping on all orders over $50!" });
  const box = item.getByLabel("French translation");
  await expect(box).toHaveValue("[FR] Free shipping on all orders over $50!");

  await box.fill("Livraison gratuite sur toutes les commandes de plus de 50 $ !");
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(item.getByText("approved", { exact: true })).toBeVisible();

  const ignore = page.getByTestId("translation-item").filter({ hasText: /^.*Subscribe/ }).first();
  await ignore.getByRole("button", { name: "Ignore" }).click();
  await expect(ignore.getByText("rejected", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("link", { name: /^Approved \(1\)$/ }).click();
  await expect(page.getByTestId("translation-item")).toHaveCount(1);
  await expect(page.getByLabel("French translation")).toHaveValue("Livraison gratuite sur toutes les commandes de plus de 50 $ !");

  const csvHref = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  const csv = await page.request.get(csvHref!);
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain("source_en,translation_fr_ca");
  expect(body).toContain("Livraison gratuite sur toutes les commandes de plus de 50 $ !");
  expect(body).not.toContain("[FR]");

  await page.getByRole("button", { name: "Publish to Shopify" }).click();
  await expect(page.locator(".alert-error")).toContainText("not implemented yet");
});

test("connector settings keep secrets server-side and validate", async ({ page }) => {
  await signin(page);
  await page.goto(`${siteUrl}/settings`);
  await page.getByLabel("Shop domain").fill("not-a-shop.example.com");
  await page.getByLabel("Admin API access token").fill("shpat_secret_token_value");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByText("Connection settings saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Admin API access token")).toHaveValue("");
  await expect(page.getByLabel("Admin API access token")).toHaveAttribute("placeholder", /saved/);
  expect(await page.content()).not.toContain("shpat_secret_token_value");

  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.locator(".alert-error")).toContainText("myshopify.com");

  await page.getByLabel("Translation glossary").fill("Boutique Érable\nAdd to cart => Ajouter au panier");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

test("another user cannot see this user's data", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signup(page, "Intruder", `intruder-${uid}@example.com`);
  await expect(page.getByText("No sites yet.")).toBeVisible();
  const res = await page.goto(siteUrl);
  expect(res?.status()).toBe(404);
  const scan = await page.goto(scanUrl);
  expect(scan?.status()).toBe(404);
  const siteId = siteUrl.split("/").pop();
  const exp = await page.request.get(`/api/translations/export?site=${siteId}&format=json`);
  expect(exp.status()).toBe(404);
  await ctx.close();
});

test("logout ends the session", async ({ page }) => {
  await signin(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/translations");
  await expect(page).toHaveURL(/\/login$/);
});

async function signin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`owner-${uid}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-42");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
