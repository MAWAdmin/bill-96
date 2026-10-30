import { NextResponse } from "next/server";
import { assertScannableUrl, UrlError } from "@/lib/net";
import { PUBLIC_SCAN_IP_LIMIT } from "@/lib/config";
import { clientIp, RateLimiter, toHomepage } from "@/lib/freeScan/limits";
import { pickLang, STRINGS } from "@/lib/freeScan/i18n";
import { startPublicScan } from "@/lib/freeScan/store";

const ipLimiter = new RateLimiter(PUBLIC_SCAN_IP_LIMIT, 3600_000);

/**
 * Starts a free scan: { url, lang? } → 202 { id, status, position, resultsUrl }.
 * 429 when the IP or the domain is over its limit (the domain case includes
 * the existing scan), 503 when too many public scans are waiting.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; lang?: unknown };
  const t = STRINGS[pickLang(typeof body.lang === "string" ? body.lang : null, req.headers.get("accept-language"))];
  const ip = clientIp(req.headers);
  if (!ipLimiter.take(ip)) {
    return NextResponse.json({ error: t.errors.tooMany }, { status: 429, headers: { "retry-after": String(ipLimiter.retryAfterSec(ip)) } });
  }

  let homepage: string;
  try {
    homepage = await assertScannableUrl(toHomepage(typeof body.url === "string" ? body.url.slice(0, 2000) : ""));
  } catch (e) {
    const notAllowed = e instanceof UrlError && !e.message.startsWith("Not a valid URL");
    return NextResponse.json({ error: notAllowed ? t.errors.notAllowed : t.errors.invalidUrl }, { status: 400 });
  }

  const res = await startPublicScan(homepage);
  if (res.ok) {
    return NextResponse.json({ id: res.id, status: "queued", position: res.position, resultsUrl: `/scan/${res.id}` }, { status: 202 });
  }
  if (res.reason === "busy") return NextResponse.json({ error: t.errors.busy }, { status: 503, headers: { "retry-after": "300" } });
  return NextResponse.json(
    { error: t.results.reused, existing: { id: res.existingId, resultsUrl: `/scan/${res.existingId}` } },
    { status: 429, headers: { "retry-after": String(res.retryAfterSec) } }
  );
}
