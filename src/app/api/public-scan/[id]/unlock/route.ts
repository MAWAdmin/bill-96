import { NextResponse } from "next/server";
import { clientIp, RateLimiter } from "@/lib/freeScan/limits";
import { pickLang, STRINGS } from "@/lib/freeScan/i18n";
import { unlockPublicScan } from "@/lib/freeScan/store";

const limiter = new RateLimiter(20, 3600_000);

/** Email unlock: { email, name?, lang? } → { shareUrl, expiresAt }. Also pushes the lead to HubSpot. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; name?: unknown; lang?: unknown };
  const t = STRINGS[pickLang(typeof body.lang === "string" ? body.lang : null, req.headers.get("accept-language"))];
  const ip = clientIp(req.headers);
  if (!limiter.take(ip)) {
    return NextResponse.json({ error: t.errors.tooMany }, { status: 429, headers: { "retry-after": String(limiter.retryAfterSec(ip)) } });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: t.errors.invalidEmail }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) || null : null;

  const res = await unlockPublicScan(id, email, name);
  if (!res.ok) {
    return res.reason === "not_ready"
      ? NextResponse.json({ error: t.errors.notReady }, { status: 409 })
      : NextResponse.json({ error: t.errors.generic }, { status: 404 });
  }
  return NextResponse.json({ shareUrl: `/scan/${res.token}`, expiresAt: res.expiresAt.toISOString() });
}
