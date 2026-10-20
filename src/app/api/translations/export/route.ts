import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/access";
import { query, queryOne } from "@/lib/db";

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const siteId = url.searchParams.get("site");
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const all = url.searchParams.get("all") === "1";
  if (!isUuid(siteId)) return new Response("Bad request", { status: 400 });
  const site = await queryOne<{ name: string }>(`SELECT name FROM sites WHERE id = $1 AND user_id = $2`, [siteId, user.id]);
  if (!site) return new Response("Not found", { status: 404 });

  const rows = await query<{
    source_text: string;
    french: string | null;
    kind: string;
    status: string;
    context: string | null;
    first_seen_url: string | null;
    occurrences: number;
  }>(
    `SELECT source_text, coalesce(final_text, draft_text) AS french, kind, status, context, first_seen_url, occurrences
     FROM translation_items WHERE site_id = $1 ${all ? "" : "AND status IN ('approved','published')"}
     ORDER BY first_seen_url NULLS LAST, source_text`,
    [siteId]
  );
  const slug = site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
  const fname = `${slug}-fr-CA-translations.${format}`;

  if (format === "json") {
    return new Response(JSON.stringify({ site: site.name, locale: "fr-CA", exportedAt: new Date().toISOString(), items: rows }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${fname}"` },
    });
  }
  const header = ["source_en", "translation_fr_ca", "kind", "status", "context", "first_seen_url", "occurrences"];
  const lines = [header.join(",")].concat(
    rows.map((r) => [r.source_text, r.french, r.kind, r.status, r.context, r.first_seen_url, r.occurrences].map(csvCell).join(","))
  );
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${fname}"` },
  });
}
