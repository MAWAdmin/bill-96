import { NextResponse, type NextRequest } from "next/server";

// Cheap edge check: bounce visitors without a session cookie to /login.
// The session itself is validated server-side by requireUser().
const PROTECTED = ["/dashboard", "/sites", "/scans", "/translations", "/api/"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.has("b96_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
