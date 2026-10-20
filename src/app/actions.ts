"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import {
  clearLoginFailures,
  createSession,
  destroySession,
  loginThrottled,
  recordLoginFailure,
  requireUser,
} from "@/lib/auth";
import { ALLOW_SIGNUP } from "@/lib/config";
import { assertScannableUrl, UrlError } from "@/lib/net";
import { isUuid, loadScan, loadSite, ownsItem } from "@/lib/access";
import { getConnector, openConfig, sealConfig, PLATFORMS } from "@/lib/connectors";
import { NotImplementedError } from "@/lib/connectors/types";
import { enqueueScan, generateDrafts } from "@/lib/jobs";

export interface FormState {
  error?: string;
  ok?: string;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------------------------------------------------------------- auth

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  if (!ALLOW_SIGNUP) return { error: "Sign-ups are disabled on this instance." };
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!name) return { error: "Name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  const exists = await queryOne(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (exists) return { error: "An account with this email already exists." };
  const user = await queryOne<{ id: string }>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [email, name, hashPassword(password)]
  );
  await createSession(user!.id);
  redirect("/dashboard");
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const key = `${email}|${ip}`;
  if (loginThrottled(key)) return { error: "Too many attempts. Try again in 15 minutes." };
  const user = await queryOne<{ id: string; password_hash: string }>(`SELECT id, password_hash FROM users WHERE email = $1`, [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginFailure(key);
    return { error: "Incorrect email or password." };
  }
  clearLoginFailures(key);
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------- sites

function parseMaxPages(v: string, fallback = 25) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 200) : fallback;
}

export async function createSite(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(fd, "name");
  const platform = str(fd, "platform") || "generic";
  if (!name) return { error: "Site name is required." };
  if (!PLATFORMS.includes(platform as never)) return { error: "Unknown platform." };
  let baseUrl: string;
  try {
    baseUrl = await assertScannableUrl(str(fd, "base_url"));
  } catch (e) {
    return { error: e instanceof UrlError ? e.message : "Invalid URL." };
  }
  const site = await queryOne<{ id: string }>(
    `INSERT INTO sites (user_id, name, base_url, platform, max_pages) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [user.id, name, baseUrl, platform, parseMaxPages(str(fd, "max_pages"))]
  );
  redirect(`/sites/${site!.id}`);
}

export async function updateSite(siteId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  await loadSite(user.id, siteId);
  const name = str(fd, "name");
  if (!name) return { error: "Site name is required." };
  let baseUrl: string;
  try {
    baseUrl = await assertScannableUrl(str(fd, "base_url"));
  } catch (e) {
    return { error: e instanceof UrlError ? e.message : "Invalid URL." };
  }
  await query(
    `UPDATE sites SET name = $2, base_url = $3, glossary = $4, auto_translate = $5, max_pages = $6 WHERE id = $1`,
    [siteId, name, baseUrl, str(fd, "glossary").slice(0, 20000), fd.get("auto_translate") === "on", parseMaxPages(str(fd, "max_pages"))]
  );
  revalidatePath(`/sites/${siteId}`);
  return { ok: "Settings saved." };
}

export async function saveConnector(siteId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const site = await loadSite(user.id, siteId);
  const platform = str(fd, "platform");
  if (!PLATFORMS.includes(platform as never)) return { error: "Unknown platform." };
  const connector = getConnector(platform);
  const previous = site.platform === platform ? openConfig(site.connector_config) : {};
  const config: Record<string, string> = {};
  for (const f of connector.configFields) {
    const v = str(fd, `cfg_${f.key}`);
    // Secret fields are never sent back to the browser; blank means "keep".
    config[f.key] = f.secret && !v ? previous[f.key] ?? "" : v;
  }
  await query(`UPDATE sites SET platform = $2, connector_config = $3 WHERE id = $1`, [
    siteId,
    platform,
    connector.configFields.length ? sealConfig(config) : null,
  ]);
  revalidatePath(`/sites/${siteId}/settings`);
  return { ok: "Connection settings saved." };
}

export async function testConnector(siteId: string, _: FormState): Promise<FormState> {
  const user = await requireUser();
  const site = await loadSite(user.id, siteId);
  const res = await getConnector(site.platform).testConnection(openConfig(site.connector_config));
  return res.ok ? { ok: res.message } : { error: res.message };
}

export async function deleteSite(siteId: string) {
  const user = await requireUser();
  await loadSite(user.id, siteId);
  await query(`DELETE FROM sites WHERE id = $1`, [siteId]);
  redirect("/dashboard");
}

// ---------------------------------------------------------------- scans

export async function startScan(siteId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const site = await loadSite(user.id, siteId);
  const mode = str(fd, "mode") === "urls" ? "urls" : "sitemap";
  const maxPages = parseMaxPages(str(fd, "max_pages"), site.max_pages);
  let urls: string[] = [];
  if (mode === "urls") {
    const lines = str(fd, "urls").split(/\s+/).filter(Boolean).slice(0, 200);
    if (!lines.length) return { error: "Enter at least one URL." };
    try {
      for (const l of lines) urls.push(await assertScannableUrl(l));
    } catch (e) {
      return { error: e instanceof UrlError ? e.message : "Invalid URL." };
    }
    urls = [...new Set(urls)];
  }
  const active = await queryOne(`SELECT 1 FROM scans WHERE site_id = $1 AND status IN ('queued','running')`, [siteId]);
  if (active) return { error: "A scan is already running for this site." };
  const scan = await queryOne<{ id: string }>(
    `INSERT INTO scans (site_id, mode, input_urls, max_pages, pages_total) VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING id`,
    [siteId, mode, JSON.stringify(urls), mode === "urls" ? urls.length : maxPages, urls.length]
  );
  enqueueScan(scan!.id);
  redirect(`/scans/${scan!.id}`);
}

export async function cancelScan(scanId: string) {
  const user = await requireUser();
  await loadScan(user.id, scanId);
  await query(`UPDATE scans SET status = 'cancelled', finished_at = now() WHERE id = $1 AND status IN ('queued','running')`, [scanId]);
  revalidatePath(`/scans/${scanId}`);
}

// ---------------------------------------------------------------- translations

export async function saveTranslation(
  itemId: string,
  action: "approve" | "save" | "reject" | "reopen",
  text: string
): Promise<FormState> {
  const user = await requireUser();
  const item = await ownsItem(user.id, itemId);
  if (!item) return { error: "Not found." };
  const t = text.trim().slice(0, 5000);
  if (action === "approve") {
    if (!t) return { error: "Enter a French translation before approving." };
    await query(`UPDATE translation_items SET status = 'approved', final_text = $2, updated_at = now() WHERE id = $1`, [itemId, t]);
  } else if (action === "save") {
    await query(
      `UPDATE translation_items SET status = CASE WHEN $2 = '' THEN 'pending' ELSE 'draft' END, draft_text = NULLIF($2, ''), updated_at = now() WHERE id = $1`,
      [itemId, t]
    );
  } else if (action === "reject") {
    await query(`UPDATE translation_items SET status = 'rejected', updated_at = now() WHERE id = $1`, [itemId]);
  } else {
    await query(
      `UPDATE translation_items SET status = CASE WHEN draft_text IS NULL THEN 'pending' ELSE 'draft' END, final_text = NULL, updated_at = now() WHERE id = $1`,
      [itemId]
    );
  }
  revalidatePath("/translations");
  return { ok: "Saved." };
}

export async function generateDraftsAction(siteId: string): Promise<FormState> {
  const user = await requireUser();
  await loadSite(user.id, siteId);
  const res = await generateDrafts(siteId);
  revalidatePath("/translations");
  if (res.error && !res.drafted) return { error: res.error };
  return { ok: `${res.drafted} draft(s) generated.${res.error ? ` Some failed: ${res.error}` : ""}` };
}

export async function approveAllDrafts(siteId: string): Promise<FormState> {
  const user = await requireUser();
  await loadSite(user.id, siteId);
  const rows = await query(
    `UPDATE translation_items SET status = 'approved', final_text = draft_text, updated_at = now()
     WHERE site_id = $1 AND status = 'draft' AND draft_text IS NOT NULL RETURNING id`,
    [siteId]
  );
  revalidatePath("/translations");
  return { ok: `${rows.length} draft(s) approved.` };
}

export async function publishApproved(siteId: string): Promise<FormState> {
  const user = await requireUser();
  const site = await loadSite(user.id, siteId);
  const connector = getConnector(site.platform);
  const items = await query<{ id: string; source_text: string; final_text: string; kind: string; first_seen_url: string | null }>(
    `SELECT id, source_text, final_text, kind, first_seen_url FROM translation_items WHERE site_id = $1 AND status = 'approved'`,
    [siteId]
  );
  if (!items.length) return { error: "No approved translations to publish." };
  try {
    const res = await connector.publishTranslations(
      openConfig(site.connector_config),
      items.map((i) => ({ id: i.id, sourceText: i.source_text, frenchText: i.final_text, kind: i.kind, pageUrl: i.first_seen_url }))
    );
    const ids = res.published.filter(isUuid);
    if (ids.length) {
      await query(`UPDATE translation_items SET status = 'published', updated_at = now() WHERE site_id = $1 AND id = ANY($2::uuid[])`, [
        siteId,
        ids,
      ]);
    }
    revalidatePath("/translations");
    return { ok: res.message };
  } catch (e) {
    if (e instanceof NotImplementedError) return { error: e.message };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
