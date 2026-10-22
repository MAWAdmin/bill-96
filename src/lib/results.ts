import "server-only";
import { query } from "./db";
import { computeReadiness, type Readiness, type ReadinessPage } from "./readiness";

/** Readiness of one scan, computed from its pages and their issue codes. */
export async function loadReadiness(scanId: string): Promise<Readiness> {
  const pages = await query<ReadinessPage>(
    `SELECT p.id, p.url, p.final_url, p.title, p.page_language, p.html_lang, p.error, p.hreflang, p.has_screenshot,
            coalesce(jsonb_agg(i.code) FILTER (WHERE i.code IS NOT NULL), '[]'::jsonb) AS codes
     FROM pages p LEFT JOIN issues i ON i.page_id = p.id
     WHERE p.scan_id = $1 GROUP BY p.id ORDER BY p.created_at`,
    [scanId]
  );
  return computeReadiness(pages);
}
