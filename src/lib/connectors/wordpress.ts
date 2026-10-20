import { fetchText } from "../net";
import { NotImplementedError, type StoreConnector } from "./types";

function siteRoot(raw: string): string {
  const u = new URL(raw.trim());
  return u.origin + u.pathname.replace(/\/$/, "");
}

/**
 * WordPress / WooCommerce connector.
 *
 * Implemented: connection test via the REST API with an Application Password.
 * Planned (publishTranslations): detect the multilingual plugin (WPML,
 * Polylang, TranslatePress) and write French strings through its API: for
 * Polylang, create/update the linked French post via /wp/v2 with `lang=fr`;
 * for WPML, its string-translation endpoints; or ship a small companion plugin
 * that accepts approved translations.
 */
export const wordpressConnector: StoreConnector = {
  platform: "wordpress",
  label: "WordPress / WooCommerce",
  description: "Connect with an Application Password to verify REST API access. Publishing French translations back to WordPress is coming next.",
  canPublish: false,
  configFields: [
    { key: "siteUrl", label: "WordPress site URL", type: "text", placeholder: "https://example.com" },
    { key: "username", label: "Username", type: "text" },
    {
      key: "appPassword",
      label: "Application password",
      type: "password",
      secret: true,
      help: "WordPress admin > Users > Profile > Application Passwords.",
    },
    { key: "plugin", label: "Multilingual plugin", type: "select", options: ["polylang", "wpml", "translatepress", "none"] },
  ],
  async testConnection(config) {
    try {
      if (!config.siteUrl || !config.username || !config.appPassword) {
        return { ok: false, message: "Site URL, username and application password are required." };
      }
      const auth = Buffer.from(`${config.username}:${config.appPassword.replace(/\s+/g, "")}`).toString("base64");
      const r = await fetchText(`${siteRoot(config.siteUrl)}/wp-json/wp/v2/users/me?context=edit`, {
        headers: { authorization: `Basic ${auth}`, accept: "application/json" },
      });
      if (r.status === 200) {
        const me = JSON.parse(r.text);
        return { ok: true, message: `Connected as ${me.name ?? config.username}.` };
      }
      if (r.status === 404) return { ok: false, message: "REST API not found at /wp-json. Is the URL right and the REST API enabled?" };
      return { ok: false, message: r.status === 401 ? "Credentials rejected (401)." : `WordPress returned HTTP ${r.status}.` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
  async discoverUrls() {
    return []; // wp-sitemap.xml (WP 5.5+) or Yoast/RankMath sitemaps are discovered automatically.
  },
  async publishTranslations() {
    throw new NotImplementedError("Publishing to WordPress is not implemented yet. Export approved translations as CSV/JSON and import them into your multilingual plugin.");
  },
};
