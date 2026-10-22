import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/access";
import { query } from "@/lib/db";
import { getConnector } from "@/lib/connectors";
import { translationProvider } from "@/lib/config";
import { approveAllDrafts, generateDraftsAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ReviewDeck } from "@/components/ReviewDeck";
import { TranslationRow, type TranslationRowData } from "@/components/TranslationRow";
import { plural } from "@/components/ui";

const PAGE_SIZE = 50;
const TABS = [
  ["open", "To review"],
  ["approved", "Approved"],
  ["rejected", "Not needed"],
  ["published", "Published"],
] as const;
const ITEM_COLUMNS = "id, source_text, kind, context, first_seen_url, occurrences, status, draft_text, final_text, provider, error";

export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; view?: string; status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const sites = await query<{ id: string; name: string; platform: string }>(
    `SELECT id, name, platform FROM sites WHERE user_id = $1 ORDER BY name`,
    [user.id]
  );
  if (!sites.length) {
    return (
      <div className="card celebrate">
        <h2>Nothing to translate yet</h2>
        <p className="muted">Add a site and check it. Any English we find on your French pages shows up here.</p>
        <Link className="btn btn-primary" href="/sites/new">Add a site</Link>
      </div>
    );
  }
  const site = sites.find((s) => s.id === sp.site && isUuid(sp.site)) ?? sites[0];
  const view = sp.view === "all" ? "all" : "review";
  const status = TABS.some(([k]) => k === sp.status) ? sp.status! : "open";
  const q = (sp.q ?? "").trim().slice(0, 200);
  const pageNo = Math.max(1, Number(sp.page) || 1);

  const counts = await query<{ status: string; n: string }>(
    `SELECT status, count(*) AS n FROM translation_items WHERE site_id = $1 GROUP BY status`,
    [site.id]
  );
  const c = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  const open = (c.pending ?? 0) + (c.draft ?? 0);
  const total = open + (c.approved ?? 0) + (c.published ?? 0) + (c.rejected ?? 0);
  const done = total - open;
  const exportable = (c.approved ?? 0) + (c.published ?? 0);
  const provider = translationProvider();
  const connector = getConnector(site.platform);
  const exportHref = (format: string) => `/api/translations/export?site=${site.id}&format=${format}`;
  const link = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { site: site.id, view, status: status === "open" ? undefined : status, q: q || undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "view" && v === "review")) p.set(k, String(v));
    return `/translations?${p}`;
  };

  let deckItems: TranslationRowData[] = [];
  let listItems: TranslationRowData[] = [];
  let hasMore = false;
  if (view === "review" && open) {
    deckItems = await query<TranslationRowData>(
      `SELECT ${ITEM_COLUMNS} FROM translation_items WHERE site_id = $1 AND status IN ('pending','draft')
       ORDER BY occurrences DESC, length(source_text) ASC, created_at LIMIT 500`,
      [site.id]
    );
  } else if (view === "all") {
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
    listItems = await query<TranslationRowData>(
      `SELECT ${ITEM_COLUMNS} FROM translation_items WHERE ${where.join(" AND ")}
       ORDER BY occurrences DESC, length(source_text) ASC, created_at
       LIMIT ${PAGE_SIZE + 1} OFFSET ${(pageNo - 1) * PAGE_SIZE}`,
      args
    );
    hasMore = listItems.length > PAGE_SIZE;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Translations</h1>
          <p>Text from {site.name} that still needs French. Check each French version and approve it.</p>
        </div>
        <div className="row">
          {sites.length > 1 && (
            <form className="row" action="/translations">
              <select name="site" defaultValue={site.id} aria-label="Site" style={{ width: "auto" }}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn btn-sm" type="submit">Switch</button>
            </form>
          )}
          {total > 0 && (
            <nav className="view-switch" aria-label="View">
              <Link href={link({ view: "review", status: undefined, q: undefined, page: undefined })} className={view === "review" ? "active" : ""}>One at a time</Link>
              <Link href={link({ view: "all" })} className={view === "all" ? "active" : ""}>All strings</Link>
            </nav>
          )}
        </div>
      </div>

      {provider === "none" && (c.pending ?? 0) > 0 && (
        <div className="alert alert-info">
          Want French drafts written for you? Add an <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart the app. Until then, type the French yourself.
        </div>
      )}

      {total === 0 ? (
        <div className="card celebrate">
          <div className="big" aria-hidden>🔎</div>
          <h2>Nothing to translate yet</h2>
          <p className="muted" style={{ maxWidth: 520, margin: "0 auto 16px" }}>
            When a check finds text that needs French, each piece shows up here with a French draft for you to approve.
            If your last check only looked at English pages, check again: French versions are now included automatically.
          </p>
          <Link className="btn btn-primary" href={`/sites/${site.id}`}>Go to {site.name}</Link>
        </div>
      ) : view === "review" ? (
        open ? (
          <ReviewDeck
            key={site.id}
            items={deckItems}
            total={total}
            done={done}
            exportHref={exportHref("csv")}
            allHref={link({ view: "all", status: "approved" })}
          />
        ) : (
          <div className="card celebrate">
            <div className="big" aria-hidden>🎉</div>
            <h2>All caught up</h2>
            <p className="muted">{plural(exportable, "translation")} approved and ready to add to your store.</p>
            {exportable > 0 && <a className="btn btn-primary" href={exportHref("csv")}>Download approved (CSV)</a>}
          </div>
        )
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="tabs" style={{ margin: 0, flex: 1 }}>
              {TABS.filter(([k]) => k !== "published" || c.published).map(([k, label]) => (
                <Link key={k} href={link({ status: k === "open" ? undefined : k, page: undefined })} className={status === k ? "active" : ""}>
                  {label} ({k === "open" ? open : c[k] ?? 0})
                </Link>
              ))}
            </div>
            <form className="row" action="/translations">
              <input type="hidden" name="site" value={site.id} />
              <input type="hidden" name="view" value="all" />
              {status !== "open" && <input type="hidden" name="status" value={status} />}
              <input type="search" name="q" defaultValue={q} placeholder="Search…" aria-label="Search" style={{ width: 180 }} />
            </form>
          </div>
          {status === "open" && ((c.pending ?? 0) > 0 && provider !== "none" || (c.draft ?? 0) > 0) && (
            <div className="row" style={{ marginBottom: 12 }}>
              {(c.pending ?? 0) > 0 && provider !== "none" && (
                <ActionForm action={generateDraftsAction.bind(null, site.id)}>
                  <SubmitButton className="btn btn-sm" pendingText="Drafting… (can take a minute)">Draft French for {c.pending} with AI</SubmitButton>
                </ActionForm>
              )}
              {(c.draft ?? 0) > 0 && (
                <ActionForm action={approveAllDrafts.bind(null, site.id)}>
                  <SubmitButton className="btn btn-sm" pendingText="Approving…">Approve all {c.draft} drafts without reviewing</SubmitButton>
                </ActionForm>
              )}
            </div>
          )}
          <div className="card">
            {listItems.length === 0 ? (
              <p className="empty">Nothing here.</p>
            ) : (
              listItems.slice(0, PAGE_SIZE).map((it) => <TranslationRow key={`${it.id}-${it.status}-${it.draft_text ?? ""}`} item={it} />)
            )}
          </div>
          <div className="row">
            {pageNo > 1 && <Link className="btn" href={link({ page: pageNo - 1 })}>← Previous</Link>}
            <span className="spacer" />
            {hasMore && <Link className="btn" href={link({ page: pageNo + 1 })}>Next →</Link>}
          </div>
        </>
      )}

      {exportable > 0 && (
        <div className="card row" style={{ marginTop: 20 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ marginBottom: 4 }}>Add them to your store</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Download your {plural(exportable, "approved translation")} and copy each French text into your store&apos;s translation tool
              {site.platform === "shopify" ? " (in Shopify: the Translate & Adapt app)" : ""}.
              {site.platform !== "generic" && ` Sending them straight to ${connector.label} is coming soon.`}
            </p>
          </div>
          <a className="btn btn-primary" href={exportHref("csv")}>Download CSV</a>
          <a className="btn btn-ghost" href={exportHref("json")}>JSON</a>
        </div>
      )}
    </>
  );
}
