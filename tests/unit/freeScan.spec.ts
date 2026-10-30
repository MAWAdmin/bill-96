import { test, expect } from "@playwright/test";
import { DOMAIN_WINDOW_MS, domainKey, domainQuota, RateLimiter, toHomepage } from "../../src/lib/freeScan/limits";
import { contactProperties, pushFreeScanLead } from "../../src/lib/freeScan/hubspot";
import { ISSUE_COPY, pickLang, STRINGS } from "../../src/lib/freeScan/i18n";
import { ISSUE_LABELS } from "../../src/lib/issueLabels";

test.describe("per-domain free scan limit", () => {
  test("www, case, paths and trailing dots count as one domain", () => {
    for (const u of ["https://www.Shop.com/", "https://shop.com/products/x?y=1", "http://SHOP.com./fr", "https://www.shop.com/#top"]) {
      expect(domainKey(u), u).toBe("shop.com");
    }
    expect(domainKey("https://fr.shop.com/")).toBe("fr.shop.com");
    expect(domainKey("http://127.0.0.1:4100/")).toBe("127.0.0.1:4100");
    expect(domainKey("https://shop.com:443/")).toBe("shop.com");
  });

  test("one scan per domain per 24 hours", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    expect(domainQuota(null, now)).toEqual({ allowed: true });
    expect(domainQuota(new Date(now - 60_000), now)).toEqual({ allowed: false, retryAfterSec: 24 * 3600 - 60 });
    expect(domainQuota(new Date(now - DOMAIN_WINDOW_MS + 1000), now)).toEqual({ allowed: false, retryAfterSec: 1 });
    expect(domainQuota(new Date(now - DOMAIN_WINDOW_MS), now)).toEqual({ allowed: true });
    // Postgres timestamps can arrive as strings.
    expect(domainQuota("2026-10-29T13:00:00Z", now).allowed).toBe(false);
    expect(domainQuota("2026-10-29T11:59:59Z", now).allowed).toBe(true);
  });

  test("visitor input becomes the site's homepage", () => {
    expect(toHomepage("mystore.com")).toBe("https://mystore.com/");
    expect(toHomepage("  https://www.mystore.com/products/maple?x=1 ")).toBe("https://www.mystore.com/");
    expect(toHomepage("http://127.0.0.1:4100/fr/good.html")).toBe("http://127.0.0.1:4100/");
    expect(() => toHomepage("")).toThrow();
    expect(() => toHomepage("https://")).toThrow();
  });
});

test("IP rate limiter uses a sliding window", () => {
  const rl = new RateLimiter(2, 1000);
  expect(rl.take("a", 0)).toBe(true);
  expect(rl.take("a", 100)).toBe(true);
  expect(rl.take("a", 200)).toBe(false);
  expect(rl.take("b", 200)).toBe(true);
  expect(rl.retryAfterSec("a", 200)).toBe(1);
  expect(rl.take("a", 1000)).toBe(true); // the hit at 0 has expired
  expect(rl.take("a", 1050)).toBe(false);
});

test.describe("HubSpot lead push", () => {
  const lead = { email: "marie@boutique.ca", websiteUrl: "https://boutique.ca/", siteScore: 62, name: "Marie Tremblay" };

  test("contact properties", () => {
    expect(contactProperties(lead)).toEqual({
      email: "marie@boutique.ca",
      website: "https://boutique.ca/",
      bill96_free_scan: "true",
      bill96_site_score: "62",
      firstname: "Marie",
      lastname: "Tremblay",
    });
    expect(contactProperties({ ...lead, name: null, siteScore: null })).toEqual({
      email: "marie@boutique.ca",
      website: "https://boutique.ca/",
      bill96_free_scan: "true",
    });
  });

  test("no API key: no request", async () => {
    let calls = 0;
    const fetch = (async () => (calls++, new Response())) as typeof globalThis.fetch;
    expect(await pushFreeScanLead(lead, { apiKey: "", fetch })).toEqual({ status: "skipped" });
    expect(calls).toBe(0);
  });

  test("creates, or updates an existing contact by email", async () => {
    const calls: { method: string; url: string; body: any; auth: string }[] = [];
    const fake = (statuses: number[]) =>
      (async (url: string, init: RequestInit) => {
        calls.push({ method: init.method!, url, body: JSON.parse(String(init.body)), auth: (init.headers as any).authorization });
        return new Response("{}", { status: statuses[calls.length - 1] });
      }) as unknown as typeof globalThis.fetch;

    expect(await pushFreeScanLead(lead, { apiKey: "tok", baseUrl: "https://hs.test", fetch: fake([201]) })).toEqual({ status: "created" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://hs.test/crm/v3/objects/contacts", auth: "Bearer tok" });
    expect(calls[0].body.properties.bill96_free_scan).toBe("true");

    calls.length = 0;
    expect(await pushFreeScanLead(lead, { apiKey: "tok", baseUrl: "https://hs.test", fetch: fake([409, 200]) })).toEqual({ status: "updated" });
    expect(calls[1]).toMatchObject({ method: "PATCH", url: "https://hs.test/crm/v3/objects/contacts/marie%40boutique.ca?idProperty=email" });
  });

  test("missing custom properties: retries with standard fields only", async () => {
    const bodies: any[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)).properties);
      return bodies.length === 1
        ? new Response(JSON.stringify({ category: "VALIDATION_ERROR", message: 'Property "bill96_free_scan" does not exist', errors: [{ code: "PROPERTY_DOESNT_EXIST" }] }), { status: 400 })
        : new Response("{}", { status: 201 });
    }) as unknown as typeof globalThis.fetch;
    expect((await pushFreeScanLead(lead, { apiKey: "tok", fetch })).status).toBe("created");
    expect(Object.keys(bodies[1]).sort()).toEqual(["email", "firstname", "lastname", "website"]);
  });

  test("other errors are reported, not thrown", async () => {
    const fetch = (async () => new Response("nope", { status: 401 })) as typeof globalThis.fetch;
    const res = await pushFreeScanLead(lead, { apiKey: "bad", fetch });
    expect(res.status).toBe("failed");
    expect(res.message).toContain("401");
  });
});

test.describe("free scan copy", () => {
  const allText = (v: unknown): string[] =>
    typeof v === "string" ? [v] : typeof v === "function" ? [String(v(3, 7))] : v && typeof v === "object" ? Object.values(v).flatMap(allText) : [];

  test('never says "compliant" or "certified" (EN or FR)', () => {
    for (const s of [...allText(STRINGS), ...allText(ISSUE_COPY)]) {
      expect(s).not.toMatch(/complian|certif|conform/i);
    }
  });

  test("every issue code has plain-language EN and FR copy", () => {
    for (const code of Object.keys(ISSUE_LABELS)) {
      expect(ISSUE_COPY[code]?.en.title, code).toBeTruthy();
      expect(ISSUE_COPY[code]?.fr.fix, code).toBeTruthy();
    }
  });

  test("language comes from ?lang=, then Accept-Language", () => {
    expect(pickLang("fr", "en-US")).toBe("fr");
    expect(pickLang(null, "fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(pickLang(undefined, "en-CA,fr;q=0.5")).toBe("en");
    expect(pickLang("de", null)).toBe("en");
  });
});
