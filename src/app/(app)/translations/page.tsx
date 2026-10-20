import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/access";
import { query } from "@/lib/db";
import { getConnector } from "@/lib/connectors";
import { translationProvider } from "@/lib/config";
import { approveAllDrafts, generateDraftsAction, publishApproved } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { TranslationRow, type TranslationRowData } from "@/components/TranslationRow";

const STATUSES = ["pending", "draft", "approved", "published", "rejected"] as const;
const PAGE_SIZE = 50;

export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const sites = await query<{ id: string; name: string; platform: string }>(
    `SELECT id, name, platform FROM sites WHERE user_id = $1 ORDER BY name`,
    [user.id]
  );
  if (!sites.length) {
    return (
      <div className="card empty">
        <p>Add a site and run a scan to fill the translation queue.</p>
        <Link className="btn btn-primary" href="/sites/new">Add site</Link>
      </div>
    );
  }
  const site = sites.find((s) => s.id === sp.site && isUuid(sp.site)) ?? sites[0];
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "open";
  const q = (sp.q ?? "").trim().slice(0, 200);
  const pageNo = Math.max(1, Number(sp.page) || 1);

  const counts = await query<{ status: string; n: string }>(
    `SELECT status, count(*) AS n FROM translation_items WHERE site_id = $1 GROUP BY status`,
    [site.id]
  );
  const c = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)])) as Record<string, number>;

  const where = [`site_id = $1`];
  const args: unknown[] = [site.id];
  if (status === "open") where.push(`status IN ('pending','draft')`);
  else {
    args.push(status);
    where.push(`status = $${args.length}`);
  }
  if (q) {
    args.push(`%${q}%`);
    where.push(`(source_text ILIKE $${args.length} OR coalesce(final_text, draft_text, '') ILIKE $${args.length})`);
  }
  const items = await query<TranslationRowData>(
    `SELECT id, source_text, kind, context, first_seen_url, occurrences, status, draft_text, final_text, provider, error
     FROM translation_items WHERE ${where.join(" AND ")}
     ORDER BY occurrences DESC, length(source_text) ASC, created_at
     LIMIT ${PAGE_SIZE + 1} OFFSET ${(pageNo - 1) * PAGE_SIZE}`,
    args
  );
  const hasMore = items.length > PAGE_SIZE;
  const provider = translationProvider();
  const connector = getConnector(site.platform);
  const link = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { site: site.id, status: status === "open" ? undefined : status, q: q || undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/translations?${p}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Translations</h1>
          <p>English strings found on your pages. Review the French drafts, edit, and approve.</p>
        </div>
        <form className="row" action="/translations">
          <select name="site" defaultValue={site.id} aria-label="Site">
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="text" name="q" defaultValue={q} placeholder="Search…" style={{ width: 180 }} />
          <button className="btn" type="submit">Go</button>
        </form>
      </div>

      {provider === "none" && (
        <div className="alert alert-info">
          AI drafts are off: set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> to have Claude draft Quebec French. You can still type translations yourself.
        </div>
      )}

      <div className="card">
        <div className="row" style={{ marginBottom: 6 }}>
          <ActionForm action={generateDraftsAction.bind(null, site.id)}>
            <SubmitButton className="btn btn-primary" pendingText="Drafting… (can take a minute)">
              Draft French for pending ({c.pending ?? 0})
            </SubmitButton>
          </ActionForm>
          <ActionForm action={approveAllDrafts.bind(null, site.id)}>
            <SubmitButton className="btn" pendingText="Approving…">Approve all drafts ({c.draft ?? 0})</SubmitButton>
          </ActionForm>
          <span className="spacer" />
          <a className="btn" href={`/api/translations/export?site=${site.id}&format=csv`}>Export CSV</a>
          <a className="btn" href={`/api/translations/export?site=${site.id}&format=json`}>Export JSON</a>
          <ActionForm action={publishApproved.bind(null, site.id)}>
            <SubmitButton className="btn" pendingText="Publishing…">Publish to {connector.label}</SubmitButton>
          </ActionForm>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          “Approve all drafts” skips review; only use it after reading the drafts. Exports include approved and published strings.
        </p>
      </div>

      <div className="tabs">
        <Link href={link({ status: undefined, page: undefined })} className={status === "open" ? "active" : ""}>
          To review ({(c.pending ?? 0) + (c.draft ?? 0)})
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={link({ status: s, page: undefined })} className={status === s ? "active" : ""}>
            {s[0].toUpperCase() + s.slice(1)} ({c[s] ?? 0})
          </Link>
        ))}
      </div>

      <div className="card">
        {items.length === 0 ? (
          <p className="empty">Nothing here.</p>
        ) : (
          items.slice(0, PAGE_SIZE).map((it) => <TranslationRow key={`${it.id}-${it.status}-${it.draft_text ?? ""}`} item={it} />)
        )}
      </div>
      <div className="row">
        {pageNo > 1 && <Link className="btn" href={link({ page: pageNo - 1 })}>← Previous</Link>}
        <span className="spacer" />
        {hasMore && <Link className="btn" href={link({ page: pageNo + 1 })}>Next →</Link>}
      </div>
    </>
  );
}
