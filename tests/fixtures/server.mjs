// Tiny static server for the fixture storefront used by tests.
// Usage: node tests/fixtures/server.mjs   (PORT env, default 4100)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "site");
const port = Number(process.env.FIXTURE_PORT || 4100);

const PAGES = ["/", "/en/product.html", "/fr/product.html", "/fr/good.html", "/bilingual.html", "/english-only.html", "/broken-hreflang.html"];

// Stand-in for HubSpot's CRM v3 contacts API so the e2e tests can check that
// free-scan leads arrive. GET /hubspot/__contacts lists what was received.
const HUBSPOT_TOKEN = "test-hubspot-token";
const contacts = new Map();

function fakeHubspot(req, res, url) {
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/hubspot/__contacts") return send(200, [...contacts.values()]);
  if (req.headers.authorization !== `Bearer ${HUBSPOT_TOKEN}`) return send(401, { message: "Authentication credentials not found." });
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const props = JSON.parse(raw || "{}").properties ?? {};
    const one = url.pathname.match(/^\/hubspot\/crm\/v3\/objects\/contacts\/([^/]+)$/);
    if (req.method === "POST" && url.pathname === "/hubspot/crm/v3/objects/contacts") {
      const email = String(props.email ?? "").toLowerCase();
      if (contacts.has(email)) return send(409, { category: "CONFLICT", message: "Contact already exists." });
      contacts.set(email, { ...props });
      return send(201, { id: String(contacts.size), properties: props });
    }
    if (req.method === "PATCH" && one && url.searchParams.get("idProperty") === "email") {
      const contact = contacts.get(decodeURIComponent(one[1]).toLowerCase());
      if (!contact) return send(404, { message: "Contact not found." });
      Object.assign(contact, props);
      return send(200, { properties: contact });
    }
    send(404, { message: "Not found" });
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/hubspot/")) return fakeHubspot(req, res, url);
    if (url.pathname === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
          PAGES.map((p) => `<url><loc>${url.origin}${p}</loc></url>`).join("") +
          `</urlset>`
      );
      return;
    }
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(root, path.normalize(rel));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<h1>Not found</h1>");
      return;
    }
    // Pages reference the origin as {{ORIGIN}} so hreflang URLs are absolute.
    const body = fs.readFileSync(file, "utf8").replaceAll("{{ORIGIN}}", url.origin);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  })
  .listen(port, "127.0.0.1", () => console.log(`fixtures on http://127.0.0.1:${port}`));
