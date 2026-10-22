// Tiny static server for the fixture storefront used by tests.
// Usage: node tests/fixtures/server.mjs   (PORT env, default 4100)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "site");
const port = Number(process.env.FIXTURE_PORT || 4100);

const PAGES = ["/", "/en/product.html", "/fr/product.html", "/fr/good.html", "/bilingual.html", "/english-only.html", "/broken-hreflang.html"];

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
          PAGES.map((p) => `<url><loc>${url.origin}${p}</loc></url>`).join("") +
          `</urlset>`
      );
      return;
    }
    // Mimics storefront bot protection refusing a plain (non-browser) request.
    if (url.pathname === "/blocked.html") {
      res.writeHead(429, { "content-type": "text/plain" });
      res.end("Too many requests");
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
