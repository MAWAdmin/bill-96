import Link from "next/link";
import { createSite } from "@/app/actions";
import { CONNECTORS } from "@/lib/connectors";
import { ActionForm, SubmitButton } from "@/components/forms";

export default function NewSite() {
  return (
    <>
      <div className="crumbs"><Link href="/dashboard">Sites</Link> /</div>
      <h1>Add a site</h1>
      <div className="card" style={{ maxWidth: 620 }}>
        <ActionForm action={createSite}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" placeholder="My Store" required />
          </div>
          <div className="field">
            <label htmlFor="base_url">Website URL</label>
            <input id="base_url" name="base_url" type="url" placeholder="https://www.mystore.com" required />
            <div className="hint">The public storefront. If French lives on a separate path or domain (e.g. /fr), use the main one; hreflang links are followed.</div>
          </div>
          <div className="field">
            <label htmlFor="platform">Platform</label>
            <select id="platform" name="platform" defaultValue="generic">
              {Object.values(CONNECTORS).map((c) => (
                <option key={c.platform} value={c.platform}>{c.label}</option>
              ))}
            </select>
            <div className="hint">Store credentials can be added later in the site settings.</div>
          </div>
          <div className="field">
            <label htmlFor="max_pages">Default pages per scan</label>
            <input id="max_pages" name="max_pages" type="number" min={1} max={200} defaultValue={25} style={{ maxWidth: 140 }} />
          </div>
          <SubmitButton pendingText="Saving…">Add site</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
