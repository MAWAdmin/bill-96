import Link from "next/link";
import { createSite } from "@/app/actions";
import { CONNECTORS } from "@/lib/connectors";
import { ActionForm, SubmitButton } from "@/components/forms";

export default function NewSite() {
  return (
    <>
      <div className="crumbs"><Link href="/dashboard">Sites</Link> /</div>
      <h1>Add a site</h1>
      <p className="muted">Three quick details, then we&apos;ll check how French-ready it is.</p>
      <div className="card" style={{ maxWidth: 620 }}>
        <ActionForm action={createSite}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" placeholder="My Store" required autoFocus />
            <div className="hint">Your business name. We don&apos;t count it as English text, but if it is in English we&apos;ll remind you of the rules for names (Charter s. 58.1, 63, 68).</div>
          </div>
          <div className="field">
            <label htmlFor="base_url">Website URL</label>
            <input id="base_url" name="base_url" type="url" placeholder="https://www.mystore.com" required />
            <div className="hint">Your main store address. We find the French version of each page automatically.</div>
          </div>
          <div className="field">
            <label htmlFor="platform">Platform</label>
            <select id="platform" name="platform" defaultValue="generic">
              {Object.values(CONNECTORS).map((c) => (
                <option key={c.platform} value={c.platform}>{c.label}</option>
              ))}
            </select>
            <div className="hint">You can connect your store account later in the site settings.</div>
          </div>
          <SubmitButton pendingText="Saving…">Add site</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
