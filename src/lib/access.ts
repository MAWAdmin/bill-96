import "server-only";
import { notFound } from "next/navigation";
import { queryOne } from "./db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

export interface Site {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  platform: string;
  connector_config: string | null;
  glossary: string;
  auto_translate: boolean;
  max_pages: number;
  created_at: Date;
}

export interface Scan {
  id: string;
  site_id: string;
  status: string;
  mode: string;
  input_urls: string[];
  max_pages: number;
  pages_total: number;
  pages_done: number;
  score: number | null;
  summary: any;
  error: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

/** Each loader returns the row only if it belongs to `userId`, else 404s. */
export async function loadSite(userId: string, siteId: string): Promise<Site> {
  if (!isUuid(siteId)) notFound();
  const s = await queryOne<Site>(`SELECT * FROM sites WHERE id = $1 AND user_id = $2`, [siteId, userId]);
  if (!s) notFound();
  return s;
}

export async function loadScan(userId: string, scanId: string): Promise<Scan & { site_name: string; base_url: string }> {
  if (!isUuid(scanId)) notFound();
  const s = await queryOne<Scan & { site_name: string; base_url: string }>(
    `SELECT sc.*, s.name AS site_name, s.base_url FROM scans sc JOIN sites s ON s.id = sc.site_id
     WHERE sc.id = $1 AND s.user_id = $2`,
    [scanId, userId]
  );
  if (!s) notFound();
  return s;
}

export async function ownsItem(userId: string, itemId: string): Promise<{ id: string; site_id: string } | null> {
  if (!isUuid(itemId)) return null;
  return queryOne(
    `SELECT t.id, t.site_id FROM translation_items t JOIN sites s ON s.id = t.site_id WHERE t.id = $1 AND s.user_id = $2`,
    [itemId, userId]
  );
}
