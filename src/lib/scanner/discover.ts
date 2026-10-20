import { fetchText } from "../net";
import { normalizeUrl } from "./hreflang";

/**
 * Finds pages to scan for a site: sitemap(s) first (robots.txt, sitemap.xml,
 * Shopify's sitemap index, WordPress's wp-sitemap.xml), then falls back to
 * links on the homepage. Child sitemaps are sampled round-robin so a small
 * page budget still covers products, collections, pages and blog posts.
 */

const ASSET = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|css|js|xml|json|mp4|mp3|woff2?|md|txt|csv|rss|atom)(\?|$)/i;

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&").trim()
  );
}

async function tryFetch(url: string) {
  try {
    const r = await fetchText(url, { timeoutMs: 12_000 });
    return r.status < 400 ? r : null;
  } catch {
    return null;
  }
}

export async function discoverUrls(baseUrl: string, max: number): Promise<string[]> {
  const base = new URL(baseUrl);
  const origin = base.origin;
  const sameSite = (u: string) => {
    try {
      const x = new URL(u);
      return x.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "") && !ASSET.test(x.pathname);
    } catch {
      return false;
    }
  };

  const sitemapUrls = new Set<string>();
  const robots = await tryFetch(`${origin}/robots.txt`);
  for (const m of robots?.text.matchAll(/^\s*sitemap:\s*(\S+)/gim) ?? []) sitemapUrls.add(m[1]);
  for (const p of ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"]) sitemapUrls.add(origin + p);

  const groups: string[][] = [];
  const visited = new Set<string>();
  const queue = [...sitemapUrls];
  while (queue.length && visited.size < 15) {
    const sm = queue.shift()!;
    if (visited.has(sm)) continue;
    visited.add(sm);
    const res = await tryFetch(sm);
    if (!res || !/<(urlset|sitemapindex)\b/i.test(res.text)) continue;
    if (/<sitemapindex\b/i.test(res.text)) queue.push(...locs(res.text));
    else groups.push(locs(res.text).filter(sameSite));
    if (groups.length && groups.flat().length >= max * 4) break;
  }

  const result: string[] = [normalizeUrl(base.toString())];
  const seen = new Set(result);
  const add = (u: string) => {
    const n = normalizeUrl(u);
    if (!seen.has(n) && result.length < max) {
      seen.add(n);
      result.push(n);
    }
  };
  for (let i = 0; result.length < max && groups.some((g) => i < g.length); i++) {
    for (const g of groups) if (i < g.length) add(g[i]);
  }

  if (result.length < max) {
    const home = await tryFetch(base.toString());
    for (const m of home?.text.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi) ?? []) {
      try {
        const abs = new URL(m[1].replace(/&amp;/g, "&"), home!.url).toString();
        if (sameSite(abs) && /^https?:/.test(abs)) add(abs);
      } catch {}
    }
  }
  return result.slice(0, max);
}
