import { defineConfig } from "@playwright/test";

// End-to-end tests: drives the real web app in Google Chrome against the
// fixture storefront. Uses a throwaway database and mock translation drafts.
const APP_PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    channel: process.env.BROWSER_CHANNEL === "chromium" ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/fixtures/server.mjs",
      url: "http://127.0.0.1:4100/",
      reuseExistingServer: true,
      env: { FIXTURE_PORT: "4100" },
    },
    {
      command: `rm -rf .e2e-data && npx next dev -p ${APP_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${APP_PORT}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        DATA_DIR: ".e2e-data",
        ALLOW_PRIVATE_URLS: "1",
        TRANSLATION_PROVIDER: "mock",
        DATABASE_URL: "",
        SCAN_CONCURRENCY: "3",
      },
    },
  ],
});
