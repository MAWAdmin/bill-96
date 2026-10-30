/**
 * Abuse limits for the public free scan. Pure functions so they can be unit
 * tested without a database; the API route feeds them the latest scan row.
 */

export const PUBLIC_SCAN_PAGES = 11; // homepage + up to 10 pages
export const DOMAIN_WINDOW_MS = 24 * 3600_000;
export const SHARE_LINK_DAYS = 30;
/** Public scans waiting or running at once; beyond this the API asks people to retry. */
export const MAX_ACTIVE_PUBLIC_SCANS = 20;

/** Turns what a visitor typed ("mystore.com/products/x") into the site's homepage URL. */
export function toHomepage(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("empty");
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  return `${url.protocol}//${url.host}/`;
}

/** One free scan per site: www/apex, case and paths count as the same domain. */
export function domainKey(url: string): string {
  return new URL(url).host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

export type Quota = { allowed: true } | { allowed: false; retryAfterSec: number };

/** `lastScanAt` is the newest public scan of the domain that did not fail. */
export function domainQuota(lastScanAt: Date | string | null, now = Date.now()): Quota {
  if (!lastScanAt) return { allowed: true };
  const elapsed = now - new Date(lastScanAt).getTime();
  if (elapsed >= DOMAIN_WINDOW_MS) return { allowed: true };
  return { allowed: false, retryAfterSec: Math.ceil((DOMAIN_WINDOW_MS - elapsed) / 1000) };
}

/** In-memory sliding-window limiter (per process, like the login throttle). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number
  ) {}

  /** Records a hit and returns false when the key is over the limit. */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  retryAfterSec(key: string, now = Date.now()): number {
    const oldest = (this.hits.get(key) ?? []).find((t) => now - t < this.windowMs);
    return oldest === undefined ? 0 : Math.ceil((oldest + this.windowMs - now) / 1000);
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
  }
}

/** First address in X-Forwarded-For, as the login throttle does. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
