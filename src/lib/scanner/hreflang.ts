import type { HreflangTag, Issue } from "./types";
import { fetchText } from "../net";

const CODE = /^([a-z]{2,3})(-[a-z]{4})?(-([a-z]{2}|\d{3}))?$/i;

/** Compare URLs ignoring fragment, trailing slash and host case. */
export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    let s = url.toString();
    if (url.pathname !== "/" && s.endsWith("/")) s = s.slice(0, -1);
    if (url.pathname === "/" && !url.search) s = s.replace(/\/$/, "");
    return s;
  } catch {
    return u;
  }
}

export const isFrenchCode = (code: string) => /^fr(-|$)/i.test(code);

export function hasFrenchAlternate(tags: HreflangTag[], pageUrl: string): boolean {
  const self = normalizeUrl(pageUrl);
  return tags.some((t) => isFrenchCode(t.hreflang) && normalizeUrl(t.href) !== self);
}

/** Static checks that need only this page's tags. */
export function checkHreflangTags(tags: HreflangTag[], pageUrl: string, canonical: string | null): Issue[] {
  const issues: Issue[] = [];
  if (tags.length === 0) {
    issues.push({
      code: "HREFLANG_MISSING",
      severity: "low",
      message: "No hreflang tags. If French and English versions exist, link them so search engines serve French to Quebec users.",
    });
    return issues;
  }
  const selves = new Set([normalizeUrl(pageUrl), canonical ? normalizeUrl(canonical) : ""]);
  if (!tags.some((t) => selves.has(normalizeUrl(t.href)))) {
    issues.push({ code: "HREFLANG_NO_SELF", severity: "low", message: "hreflang set does not include this page itself (self-reference)." });
  }
  if (!tags.some((t) => t.hreflang.toLowerCase() === "x-default")) {
    issues.push({ code: "HREFLANG_NO_X_DEFAULT", severity: "low", message: "No x-default hreflang tag." });
  }
  const bad = tags.filter((t) => t.hreflang.toLowerCase() !== "x-default" && !CODE.test(t.hreflang));
  if (bad.length) {
    issues.push({
      code: "HREFLANG_INVALID_CODE",
      severity: "medium",
      message: `Invalid hreflang code(s): ${bad.map((t) => `"${t.hreflang}"`).join(", ")}.`,
    });
  }
  if (!tags.some((t) => isFrenchCode(t.hreflang))) {
    issues.push({
      code: "HREFLANG_NO_FRENCH",
      severity: "high",
      message: 'hreflang tags exist but none is French ("fr" or "fr-CA").',
    });
  }
  const byCode = new Map<string, Set<string>>();
  for (const t of tags) {
    const k = t.hreflang.toLowerCase();
    if (!byCode.has(k)) byCode.set(k, new Set());
    byCode.get(k)!.add(normalizeUrl(t.href));
  }
  const conflicts = [...byCode].filter(([, s]) => s.size > 1).map(([k]) => k);
  if (conflicts.length) {
    issues.push({ code: "HREFLANG_CONFLICT", severity: "medium", message: `Same hreflang code points to different URLs: ${conflicts.join(", ")}.` });
  }
  return issues;
}

export function parseHreflangFromHtml(html: string, baseUrl: string): HreflangTag[] {
  const out: HreflangTag[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    const rel = attr("rel");
    const relVal = rel ? rel[2] ?? rel[3] ?? rel[4] : "";
    if (!/\balternate\b/i.test(relVal)) continue;
    const hl = attr("hreflang");
    const href = attr("href");
    if (!hl || !href) continue;
    const raw = (href[2] ?? href[3] ?? href[4] ?? "").replace(/&amp;/g, "&");
    let abs = raw;
    try {
      abs = new URL(raw, baseUrl).toString();
    } catch {}
    out.push({ hreflang: hl[2] ?? hl[3] ?? hl[4] ?? "", href: abs, raw });
  }
  return out;
}

/**
 * Fetches each alternate (up to `limit`) and checks it exists and links back.
 * `cache` is shared across a scan so each alternate is fetched once.
 */
export async function checkReciprocity(
  tags: HreflangTag[],
  pageUrl: string,
  cache: Map<string, Promise<{ status: number; tags: HreflangTag[] } | null>>,
  limit = 6
): Promise<Issue[]> {
  const self = normalizeUrl(pageUrl);
  const targets = [...new Set(tags.map((t) => normalizeUrl(t.href)))].filter((u) => u !== self).slice(0, limit);
  const broken: string[] = [];
  const oneWay: string[] = [];
  await Promise.all(
    targets.map(async (target) => {
      if (!cache.has(target)) {
        cache.set(
          target,
          fetchText(target)
            .then((r) => ({ status: r.status, tags: parseHreflangFromHtml(r.text, r.url) }))
            .catch(() => null)
        );
      }
      const res = await cache.get(target)!;
      if (!res || res.status >= 400) broken.push(target);
      else if (!res.tags.some((t) => normalizeUrl(t.href) === self)) oneWay.push(target);
    })
  );
  const issues: Issue[] = [];
  if (broken.length) {
    issues.push({
      code: "HREFLANG_BROKEN_ALTERNATE",
      severity: "medium",
      message: `${broken.length} hreflang alternate(s) could not be loaded.`,
      details: { urls: broken },
    });
  }
  if (oneWay.length) {
    issues.push({
      code: "HREFLANG_NOT_RECIPROCAL",
      severity: "medium",
      message: `${oneWay.length} alternate page(s) do not link back to this page (hreflang must be reciprocal).`,
      details: { urls: oneWay },
    });
  }
  return issues;
}
