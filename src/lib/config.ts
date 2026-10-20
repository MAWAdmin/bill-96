import path from "node:path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const IS_PROD = process.env.NODE_ENV === "production";
export const ALLOW_PRIVATE_URLS = process.env.ALLOW_PRIVATE_URLS === "1";
export const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP !== "0";
export const BROWSER_CHANNEL = process.env.BROWSER_CHANNEL || "chrome";
export const SCAN_CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY) || 2);
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

export type TranslationProvider = "claude" | "mock" | "none";

export function translationProvider(): TranslationProvider {
  if (process.env.TRANSLATION_PROVIDER === "mock") return "mock";
  return process.env.ANTHROPIC_API_KEY ? "claude" : "none";
}
export const SCREENSHOT_DIR = path.join(DATA_DIR, "screenshots");
