import fs from "node:fs/promises";
import path from "node:path";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/access";
import { queryOne } from "@/lib/db";
import { SCREENSHOT_DIR } from "@/lib/config";

export async function GET(_req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { pageId } = await params;
  if (!isUuid(pageId)) return new Response("Not found", { status: 404 });
  const owned = await queryOne(
    `SELECT 1 FROM pages p JOIN scans sc ON sc.id = p.scan_id JOIN sites s ON s.id = sc.site_id
     WHERE p.id = $1 AND s.user_id = $2`,
    [pageId, user.id]
  );
  if (!owned) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(SCREENSHOT_DIR, `${pageId}.jpg`));
    return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
