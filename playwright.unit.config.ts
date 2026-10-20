import { defineConfig } from "@playwright/test";

// Unit + scanner integration tests (no web app). Uses the fixture storefront.
export default defineConfig({
  testDir: "tests/unit",
  timeout: 60_000,
  reporter: "list",
  use: { channel: process.env.BROWSER_CHANNEL === "chromium" ? undefined : "chrome" },
  webServer: {
    command: "node tests/fixtures/server.mjs",
    url: "http://127.0.0.1:4100/",
    reuseExistingServer: true,
    env: { FIXTURE_PORT: "4100" },
  },
});
