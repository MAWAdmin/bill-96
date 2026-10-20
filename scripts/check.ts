/**
 * Command-line checker: same scanner as the web app, no database.
 *
 *   npm run check -- https://store.com/products/x [more urls]
 *   npm run check -- --site https://store.com --max 10
 *   npm run check -- --json https://store.com
 */
import { scanPage, closeBrowser } from "../src/lib/scanner/scanPage";
import { discoverUrls } from "../src/lib/scanner/discover";
import { draftTranslations } from "../src/lib/translate";
import { translationProvider } from "../src/lib/config";

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const withDrafts = args.includes("--translate");
  const siteIdx = args.indexOf("--site");
  const maxIdx = args.indexOf("--max");
  const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) || 10 : 10;
  const optionValues = new Set([siteIdx, maxIdx].filter((i) => i >= 0).map((i) => i + 1));
  let urls = args.filter((a, i) => !a.startsWith("--") && !optionValues.has(i));
  if (siteIdx >= 0) urls = await discoverUrls(args[siteIdx + 1], max);
  if (!urls.length) {
    console.log("Usage: npm run check -- <url> [...urls] | --site <url> [--max N] [--json] [--translate]");
    process.exit(1);
  }

  const results = [];
  const cache = new Map();
  for (const url of urls) {
    const r = await scanPage(url, { reciprocityCache: cache, screenshot: false });
    if (r.skipped) {
      if (!asJson) console.log(`\nSkipped ${r.url}: ${r.error}`);
      continue;
    }
    results.push(r);
    if (asJson) continue;
    console.log("\n" + "=".repeat(78));
    console.log(`${r.url}  →  score ${r.score}/100  (${r.language ?? "failed"})`);
    if (r.metrics) {
      const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);
      console.log(`  French text share ${pct(r.metrics.frCharShare)} · French prominence ${pct(r.metrics.frProminenceShare)} · hreflang tags ${r.hreflang.length}`);
    }
    for (const i of r.issues) console.log(`  [${i.severity.toUpperCase()}] ${i.code}: ${i.message}`);
    if (r.candidates.length) console.log(`  ${r.candidates.length} string(s) need French.`);
    if (withDrafts && r.candidates.length) {
      const items = r.candidates.slice(0, 40).map((c, k) => ({ id: String(k), text: c.text, kind: c.kind, context: c.context }));
      const res = await draftTranslations(items, { siteName: new URL(r.url).hostname });
      if (res.error) console.log(`  Drafts: ${res.error}`);
      for (const it of items) {
        const fr = res.drafts.get(it.id);
        if (fr) console.log(`    EN: ${it.text}\n    FR: ${fr}  (draft — review before publishing)`);
      }
    }
  }
  if (asJson) console.log(JSON.stringify(results.map(({ screenshot, blocks, ...r }) => r), null, 2));
  else console.log(`\nTranslation drafts: ${translationProvider() === "none" ? "off (no ANTHROPIC_API_KEY)" : "available with --translate"}`);
  await closeBrowser();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeBrowser();
  process.exit(1);
});
