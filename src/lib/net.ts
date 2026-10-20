import dns from "node:dns/promises";
import net from "node:net";

/**
 * Outbound-request guard. Users submit arbitrary URLs, so without this the
 * scanner could be pointed at internal services (cloud metadata, databases,
 * admin panels) and return their contents. Set ALLOW_PRIVATE_URLS=1 for local
 * development and tests.
 */

const allowPrivate = () => process.env.ALLOW_PRIVATE_URLS === "1";

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

const hostCache = new Map<string, Promise<boolean>>();

/** True when the host resolves only to public addresses (or private URLs are allowed). */
export async function isHostAllowed(hostname: string): Promise<boolean> {
  if (allowPrivate()) return true;
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return !isPrivateIp(host);
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (!hostCache.has(host)) {
    hostCache.set(
      host,
      dns
        .lookup(host, { all: true })
        .then((addrs) => addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address)))
        .catch(() => false)
    );
    setTimeout(() => hostCache.delete(host), 5 * 60_000).unref?.();
  }
  return hostCache.get(host)!;
}

export class UrlError extends Error {}

/** Validates a user-supplied URL. Returns the normalised URL string. */
export async function assertScannableUrl(input: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new UrlError(`Not a valid URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UrlError("Only http(s) URLs can be scanned.");
  if (url.username || url.password) throw new UrlError("URLs with credentials are not allowed.");
  if (!(await isHostAllowed(url.hostname))) throw new UrlError(`Host not allowed (private or unresolvable): ${url.hostname}`);
  url.hash = "";
  return url.toString();
}

const MAX_BYTES = 3_000_000;

/** GET with redirect hops re-validated, timeout, and size cap. */
export async function fetchText(
  input: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<{ status: number; url: string; text: string; contentType: string }> {
  let url = await assertScannableUrl(input);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      headers: { "user-agent": "Bill96Checker/1.0 (+French-language compliance scanner)", ...opts.headers },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertScannableUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    return {
      status: res.status,
      url,
      text: Buffer.concat(chunks).toString("utf8"),
      contentType: res.headers.get("content-type") || "",
    };
  }
  throw new UrlError("Too many redirects");
}
