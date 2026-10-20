import { fetchText } from "../net";
import { NotImplementedError, type ConnectorConfig, type StoreConnector } from "./types";

const API_VERSION = "2025-07";

function shopHost(config: ConnectorConfig): string {
  const d = (config.shopDomain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(d)) throw new Error('Shop domain must look like "your-store.myshopify.com".');
  return d;
}

/**
 * Shopify connector.
 *
 * Implemented: connection test via the Admin REST API.
 * Planned (publishTranslations): the Admin GraphQL `translatableResources`
 * query to map scanned strings to resources (products, collections, pages,
 * theme/online-store content), then `translationsRegister` for the French
 * locale. Requires an Admin API access token with read/write_translations,
 * read_products and read_content scopes, and the French locale enabled in
 * Settings > Languages.
 */
export const shopifyConnector: StoreConnector = {
  platform: "shopify",
  label: "Shopify",
  description: "Connect with a custom-app Admin API token to verify access. Publishing French translations back to Shopify is coming next.",
  canPublish: false,
  configFields: [
    { key: "shopDomain", label: "Shop domain", type: "text", placeholder: "your-store.myshopify.com" },
    {
      key: "accessToken",
      label: "Admin API access token",
      type: "password",
      secret: true,
      help: "Shopify admin > Settings > Apps > Develop apps > create app. Scopes: read_products, read_content, read_translations, write_translations.",
    },
    { key: "frenchLocale", label: "French locale", type: "select", options: ["fr", "fr-CA"] },
  ],
  async testConnection(config) {
    try {
      const host = shopHost(config);
      if (!config.accessToken) return { ok: false, message: "Access token is required." };
      const r = await fetchText(`https://${host}/admin/api/${API_VERSION}/shop.json`, {
        headers: { "X-Shopify-Access-Token": config.accessToken, accept: "application/json" },
      });
      if (r.status === 200) {
        const shop = JSON.parse(r.text).shop;
        return { ok: true, message: `Connected to ${shop?.name ?? host} (primary locale: ${shop?.primary_locale ?? "?"}).` };
      }
      return { ok: false, message: r.status === 401 ? "Token rejected (401)." : `Shopify returned HTTP ${r.status}.` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
  async discoverUrls() {
    return []; // Shopify's public sitemap index covers products/collections/pages/blogs.
  },
  async publishTranslations() {
    throw new NotImplementedError("Publishing to Shopify is not implemented yet. Export approved translations as CSV and import them with Shopify's Translate & Adapt app.");
  },
};
