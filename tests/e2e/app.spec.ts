import { test, expect, type Page } from "@playwright/test";

/**
 * Full user journey in Chrome: sign up → add a Shopify site → check the
 * fixture storefront → readiness, to-dos and page pairs → page detail →
 * review/approve French drafts one at a time → export → French twins of
 * English pages → connector settings → tenant isolation → logout.
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

test("sign up, add a site and check it", async ({ page }) => {
  await signup(page, "Owner", `owner-${uid}@example.com`);
  await expect(page.getByRole("heading", { name: "No sites yet" })).toBeVisible();

  await page.getByRole("link", { name: "Add your first site" }).click();
  await page.getByLabel("Name").fill("Boutique Érable");
  await page.getByLabel("Website URL").fill(FIXTURE);
  await page.getByLabel("Platform").selectOption("shopify");
  await page.getByRole("button", { name: "Add site" }).click();
  await expect(page.getByRole("heading", { name: "Boutique Érable", exact: true })).toBeVisible();
  siteUrl = page.url();

  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/);
  scanUrl = page.url();

  // Progress view auto-refreshes until the check completes.
  const readiness = page.getByTestId("readiness");
  await expect(readiness).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/· 7 pages$/)).toBeVisible();
  // Home, the clean French page and the French "store" page are ready; the
  // product (English left), the bilingual sale page and the English-only page aren't.
  await expect(readiness.getByRole("heading", { name: "3 of 6 pages are French-ready" })).toBeVisible();
  await expect(readiness.getByRole("img", { name: "50% French-ready" })).toBeVisible();

  // The English and French product pages are one row.
  await expect(page.getByTestId("page-pair")).toHaveCount(6);
  const product = page.getByTestId("page-pair").filter({ hasText: "Sirop d'érable pur" });
  await expect(product).toContainText("English left");
  await expect(product.getByRole("link", { name: "EN", exact: true })).toBeVisible();
  await expect(product.getByRole("link", { name: "FR", exact: true })).toBeVisible();
  await expect(page.getByTestId("page-pair").filter({ hasText: "Our Story" })).toContainText("No French version");

  const todos = page.getByTestId("todos");
  await expect(todos.getByRole("heading", { name: /^Review \d+ French translations$/ })).toBeVisible();
  await expect(todos.getByRole("heading", { name: "Add French versions of 1 page" })).toBeVisible();
  await expect(todos.getByRole("heading", { name: "Give French top billing on 2 pages" })).toBeVisible();

  // Technical findings are tucked away for a developer.
  await expect(page.getByText("hreflang not reciprocal", { exact: true })).toBeHidden();
  await page.getByText(/^Technical details for your developer/).click();
  await expect(page.getByText("hreflang not reciprocal", { exact: true })).toBeVisible();
});

test("page detail shows both versions, what to fix and measured blocks", async ({ page }) => {
  await signin(page);
  await page.goto(scanUrl);
  await page.getByRole("link", { name: /Sirop d'érable pur/ }).click();
  // Each piece of English once, where it is, and its French draft.
  const english = page.getByTestId("still-english");
  const row = (text: string) => english.locator(".fix-row", { hasText: text });
  await expect(row("Free shipping on all orders over $50!")).toContainText("[FR] Free shipping on all orders over $50!");
  await expect(row("Free shipping on all orders over $50!")).toContainText("draft");
  await expect(row("Enter quantity")).toContainText("Form placeholder");
  await expect(row("Bottle of pure maple syrup on a wooden table")).toContainText("Image description");
  await expect(row("Shop our best-selling maple syrup with free shipping.")).toContainText("Google search description");
  await expect(english.locator(".fix-row", { hasText: "Add to cart" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "English is more visible than French" })).toBeVisible();
  await expect(page.getByText(/Largest English text \(36px\)/)).toBeVisible();

  await expect(page.getByRole("img", { name: "Screenshot of the English page" })).toBeVisible();
  const shot = page.getByRole("img", { name: "Screenshot of the French page" });
  await expect(shot).toBeVisible();
  const src = await shot.getAttribute("src");
  const img = await page.request.get(src!);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/jpeg");
  await expect.poll(() => shot.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(1000);

  await page.getByText("Technical details for your developer").click();
  await page.getByRole("link", { name: "English", exact: true }).click();
  const banner = page.locator("tr", { hasText: "Free shipping on all orders over $50!" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("36px");
  await expect(banner).toContainText("700");
});

test("translations: review one at a time, approve, export", async ({ page }) => {
  await signin(page);
  // Auto-translate (mock provider in tests) drafted every string after the check.
  await page.goto("/translations?view=all");
  const item = page.getByTestId("translation-item").filter({ hasText: "Free shipping on all orders over $50!" });
  const box = item.getByLabel("French translation");
  await expect(box).toHaveValue("[FR] Free shipping on all orders over $50!");
  await box.fill("Livraison gratuite sur toutes les commandes de plus de 50 $ !");
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(item.getByText("approved", { exact: true })).toBeVisible();

  await page.goto("/translations");
  const progress = page.getByTestId("deck-progress");
  await expect(progress).toHaveText(/^1 of \d+ done$/);
  const total = Number((await progress.textContent())!.match(/of (\d+)/)![1]);
  const card = page.getByTestId("review-card");
  const first = (await card.getByTestId("source-text").textContent())!;
  await card.getByLabel("French translation").fill("Texte vérifié à la main");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(progress).toHaveText(`2 of ${total} done`);
  await expect(card.getByTestId("source-text")).not.toHaveText(first);
  await card.getByRole("button", { name: "Not needed" }).click();
  await expect(progress).toHaveText(`3 of ${total} done`);
  // Saved on the server, not just on screen.
  await page.reload();
  await expect(progress).toHaveText(`3 of ${total} done`);

  await page.goto("/translations?view=all&status=approved");
  await expect(page.getByRole("link", { name: "Approved (2)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Not needed (1)" })).toBeVisible();
  await expect(page.getByTestId("translation-item")).toHaveCount(2);

  const csvHref = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  const csv = await page.request.get(csvHref!);
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain("source_en,translation_fr_ca");
  expect(body).toContain("Livraison gratuite sur toutes les commandes de plus de 50 $ !");
  expect(body).toContain("Texte vérifié à la main");
  expect(body).not.toContain("[FR]");

  // Publishing isn't built yet, so there's no button for it, only the way to do it by hand.
  await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
  await expect(page.getByText(/Sending them straight to Shopify is coming soon/)).toBeVisible();
});

test("checking an English page also checks its French version", async ({ page }) => {
  await signin(page);
  await page.goto(siteUrl);
  await page.getByText("Choose which pages to check").click();
  await page.getByText("Specific URLs").click();
  await page.getByLabel("URLs (one per line)").fill(`${FIXTURE}en/product.html`);
  await page.getByRole("button", { name: "Start check" }).click();
  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("readiness")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/· 2 pages$/)).toBeVisible();
  const pair = page.getByTestId("page-pair");
  await expect(pair).toHaveCount(1);
  await expect(pair).toContainText("Sirop d'érable pur");
  await expect(pair.getByRole("link", { name: "FR", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "No sites yet" })).toBeVisible();
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
