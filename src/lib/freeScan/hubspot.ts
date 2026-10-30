/**
 * Sends free-scan leads to HubSpot (CRM v3 contacts API). HUBSPOT_API_KEY is
 * a private-app access token with the crm.objects.contacts.write scope.
 * Without it this is a no-op with a log line, so dev and tests never call
 * HubSpot. A failure here never blocks the visitor's unlock.
 *
 * `bill96_free_scan` (single checkbox) and `bill96_site_score` (number) are
 * custom contact properties that must exist in the portal. If they don't,
 * HubSpot rejects the whole request, so we retry with the standard fields.
 */

export interface FreeScanLead {
  email: string;
  websiteUrl: string;
  siteScore: number | null;
  name?: string | null;
}

export interface PushResult {
  status: "skipped" | "created" | "updated" | "failed";
  message?: string;
}

interface PushOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

const CUSTOM_PROPERTIES = ["bill96_free_scan", "bill96_site_score"];

export function contactProperties(lead: FreeScanLead): Record<string, string> {
  const props: Record<string, string> = {
    email: lead.email,
    website: lead.websiteUrl,
    bill96_free_scan: "true",
  };
  if (lead.siteScore !== null) props.bill96_site_score = String(lead.siteScore);
  const name = lead.name?.trim();
  if (name) {
    const [first, ...rest] = name.split(/\s+/);
    props.firstname = first;
    if (rest.length) props.lastname = rest.join(" ");
  }
  return props;
}

export async function pushFreeScanLead(lead: FreeScanLead, opts: PushOptions = {}): Promise<PushResult> {
  const apiKey = opts.apiKey ?? process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    console.info("[hubspot] HUBSPOT_API_KEY not set; free-scan lead not pushed.");
    return { status: "skipped" };
  }
  const base = (opts.baseUrl ?? process.env.HUBSPOT_API_BASE ?? "https://api.hubapi.com").replace(/\/$/, "");
  const doFetch = opts.fetch ?? fetch;
  const send = (method: "POST" | "PATCH", path: string, properties: Record<string, string>) =>
    doFetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ properties }),
      signal: AbortSignal.timeout(8_000),
    });
  // Create the contact; if the email already exists, update it instead.
  const upsert = async (properties: Record<string, string>) => {
    const created = await send("POST", "/crm/v3/objects/contacts", properties);
    if (created.status !== 409) return { res: created, status: "created" as const };
    const path = `/crm/v3/objects/contacts/${encodeURIComponent(lead.email)}?idProperty=email`;
    return { res: await send("PATCH", path, properties), status: "updated" as const };
  };

  try {
    const properties = contactProperties(lead);
    let { res, status } = await upsert(properties);
    if (res.status === 400) {
      const body = await res.text();
      if (!body.includes("PROPERTY_DOESNT_EXIST")) return fail(res.status, body);
      console.warn(`[hubspot] Contact properties ${CUSTOM_PROPERTIES.join(", ")} are missing in HubSpot; pushed standard fields only.`);
      const standard = Object.fromEntries(Object.entries(properties).filter(([k]) => !CUSTOM_PROPERTIES.includes(k)));
      ({ res, status } = await upsert(standard));
    }
    if (!res.ok) return fail(res.status, await res.text());
    return { status };
  } catch (e) {
    return fail(0, e instanceof Error ? e.message : String(e));
  }
}

function fail(httpStatus: number, detail: string): PushResult {
  const message = `HubSpot contact push failed${httpStatus ? ` (HTTP ${httpStatus})` : ""}: ${detail.slice(0, 300)}`;
  console.error(`[hubspot] ${message}`);
  return { status: "failed", message };
}
