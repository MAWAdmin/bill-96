import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadSite } from "@/lib/access";
import { CONNECTORS, getConnector, openConfig } from "@/lib/connectors";
import { deleteSite, saveConnector, testConnector, updateSite } from "@/app/actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";

export default async function SiteSettings({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ platform?: string }>;
}) {
  const { siteId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const site = await loadSite(user.id, siteId);
  // Let the user preview another platform's fields via ?platform= before saving.
  const platform = sp.platform && sp.platform in CONNECTORS ? sp.platform : site.platform;
  const connector = getConnector(platform);
  const config = platform === site.platform ? openConfig(site.connector_config) : {};

  return (
    <>
      <div className="crumbs">
        <Link href="/dashboard">Sites</Link> / <Link href={`/sites/${site.id}`}>{site.name}</Link> /
      </div>
      <h1>Settings</h1>

      <div className="grid grid-2">
        <div className="card">
          <h2>General</h2>
          <ActionForm action={updateSite.bind(null, site.id)}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" defaultValue={site.name} required />
            </div>
            <div className="field">
              <label htmlFor="base_url">Website URL</label>
              <input id="base_url" name="base_url" type="url" defaultValue={site.base_url} required />
            </div>
            <div className="field">
              <label htmlFor="max_pages">Default pages per scan</label>
              <input id="max_pages" name="max_pages" type="number" min={1} max={200} defaultValue={site.max_pages} style={{ maxWidth: 140 }} />
            </div>
            <div className="field">
              <label className="check">
                <input type="checkbox" name="auto_translate" defaultChecked={site.auto_translate} /> Draft French translations automatically after each scan
              </label>
            </div>
            <div className="field">
              <label htmlFor="glossary">Translation glossary</label>
              <textarea
                id="glossary"
                name="glossary"
                rows={6}
                defaultValue={site.glossary}
                placeholder={"Add to cart => Ajouter au panier\nGlowRadiance (brand: keep as is)\nFree shipping => Livraison gratuite"}
              />
              <div className="hint">One per line: <code>English =&gt; French</code>, or a bare term to keep untranslated (brand and product names).</div>
            </div>
            <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
          </ActionForm>
        </div>

        <div className="card">
          <h2>Store connection</h2>
          <div className="tabs">
            {Object.values(CONNECTORS).map((c) => (
              <Link key={c.platform} href={`?platform=${c.platform}`} className={c.platform === platform ? "active" : ""}>
                {c.label}
              </Link>
            ))}
          </div>
          <p className="muted">{connector.description}</p>
          <ActionForm action={saveConnector.bind(null, site.id)}>
            <input type="hidden" name="platform" value={platform} />
            {connector.configFields.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={`cfg_${f.key}`}>{f.label}</label>
                {f.type === "select" ? (
                  <select id={`cfg_${f.key}`} name={`cfg_${f.key}`} defaultValue={config[f.key] ?? f.options?.[0]}>
                    {f.options!.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`cfg_${f.key}`}
                    name={`cfg_${f.key}`}
                    type={f.type}
                    placeholder={f.secret && config[f.key] ? "•••••••• (saved, leave blank to keep)" : f.placeholder}
                    defaultValue={f.secret ? "" : config[f.key] ?? ""}
                    autoComplete="off"
                  />
                )}
                {f.help && <div className="hint">{f.help}</div>}
              </div>
            ))}
            <SubmitButton pendingText="Saving…">{platform === site.platform ? "Save connection" : `Switch to ${connector.label}`}</SubmitButton>
          </ActionForm>
          {platform === site.platform && connector.configFields.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <ActionForm action={testConnector.bind(null, site.id)}>
                <SubmitButton className="btn" pendingText="Testing…">Test connection</SubmitButton>
              </ActionForm>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Danger zone</h2>
        <p className="muted">Deletes the site, all scans and its translation queue.</p>
        <form action={deleteSite.bind(null, site.id)}>
          <ConfirmButton label="Delete site" confirmLabel="Yes, delete permanently" />
        </form>
      </div>
    </>
  );
}
