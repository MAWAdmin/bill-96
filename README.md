# Bill 96 Checker

A web app that scans storefronts (Shopify, WordPress/WooCommerce, or any website) for
**Quebec French-language gaps** (Bill 96 / Charter of the French language) and turns every
English string it finds into a **French (fr-CA) translation queue** you can review, approve
and export.

> Automated triage, not legal advice. It never calls anything "compliant" or "certified".
> AI translations are drafts that a person approves before they are used.

## What it does

| Area | Details |
|---|---|
| **Free scan** | Public `/scan` page, no account: paste a URL, get a severity-weighted site score and risk band, the top 5 gaps and French drafts for the first 10 English strings. An email unlocks the full results and a 30-day share link and sends the lead to HubSpot. Signing up with that email puts the scan's strings in a translation queue. See [Free scan](#free-scan). |
| **Accounts** | Multi-user sign up / log in (scrypt-hashed passwords, httpOnly DB-backed sessions, login throttling). Each user only sees their own sites. |
| **Sites** | Add a site, pick its platform, store connector credentials (encrypted at rest, AES-256-GCM), glossary, default page budget. |
| **Scans** | *Whole site*: discovers pages from robots.txt / sitemap.xml / Shopify sitemap index / `wp-sitemap.xml`, falling back to homepage links. *URL list*: scan exactly the URLs you paste. Runs in the background with a live progress view. |
| **Real-browser checks** | Each page loads in Google Chrome (Playwright). For every visible text block it records the rendered font size, weight, position (above the fold or not) and role (heading, button, nav, footer). Also image alt text, placeholders, button values, aria-labels, title and meta description. |
| **French vs English** | Classifies each block (fr / en / mixed / unclear) with a word-list detector that ignores words shared by both languages. That fixes the old bug where French "on" counted as English. |
| **Visual prominence** | Weights text by size² × weight × above-the-fold × role. It flags pages where English outweighs French, the biggest English text beats the biggest French text, or English dominates the first screen. |
| **Issues** | No French version, English text on French pages, English alt text/placeholders, English SEO title/description, `<html lang>` missing or mismatched, hreflang problems (missing, no self-reference, no x-default, invalid codes, no French alternate, conflicts, **broken and non-reciprocal alternates**, checked by fetching each alternate), HTTP errors, JS errors. Each issue has a severity and fix guidance; each page gets a 0–100 score. |
| **Translations** | Every English string becomes a queue item, deduplicated per site. Claude drafts Quebec French (glossary-aware, brand names preserved); you edit, approve, ignore. A translation memory reuses your approved translations across your sites. Export as CSV (Excel-safe UTF-8) or JSON. |
| **Connectors** | `generic`, `shopify`, `wordpress` behind one `StoreConnector` interface (`src/lib/connectors/`). "Test connection" works now (Shopify Admin API token; WordPress Application Password). **Publishing approved translations back to the store is not built yet**: the button says so, and the code documents the plan. |
| **Security** | SSRF guard: user-supplied URLs, redirects, and *every request the scanned page makes* are blocked from localhost/private/cloud-metadata IPs. Ownership checks on every query; secrets never sent back to the browser; CSV formula-injection guard. |

## Requirements

- Node.js 20+ (tested on 21.5)
- Google Chrome installed (the scanner uses your system Chrome, so it works on macOS 13)
- Optional: PostgreSQL. Without `DATABASE_URL` the app uses an embedded Postgres (PGlite) in `./data`, so nothing else needs installing.
- Optional: an Anthropic API key for AI translation drafts

## Run it

```bash
npm install
cp .env.example .env.local        # then edit as needed
npm run dev                       # http://localhost:3000
```

Open http://localhost:3000/scan to try the free scan without an account, or create an account, add a site and
start a scan.

Production:

```bash
# .env.local / environment:
#   DATABASE_URL=postgres://...      (recommended)
#   APP_SECRET=<32+ random chars>    (required in production)
#   ANTHROPIC_API_KEY=...            (optional)
#   HUBSPOT_API_KEY=...              (optional, free-scan leads → HubSpot)
#   ALLOW_SIGNUP=0                   (after creating your accounts, if it is internal)
npm run build && npm start
```

Scans run inside the web server process, one scan at a time (pages in parallel,
`SCAN_CONCURRENCY`). For several app instances, move `src/lib/jobs.ts` into a separate worker
that polls `scans WHERE status='queued'`.

## Free scan

The public front door. The landing page (`/`) and the logged-out top bar send visitors here; there is
no separate waitlist.

1. **`/scan`**: the visitor pastes one URL. `POST /api/public-scan` turns it into the site's homepage,
   runs the SSRF guard and queues a scan of the homepage plus up to 10 pages (existing `discover`
   module, same job queue and `SCAN_CONCURRENCY` as app scans). It answers `202 { id, position,
   resultsUrl }`. `GET /api/public-scan/:id` returns status, queue position and score for polling.
2. **`/scan/:id`** (no account): progress while queued/running, then the **site score** and **risk band**,
   the **top 5 gaps** in plain language with one fix line each, and the **first 10 English strings with
   their fr-CA draft** side by side. Drafts use `translate.ts`; with no `ANTHROPIC_API_KEY` they fall back
   to the mock provider and the page says so. Locked: the full list of gaps and the total number of
   English strings.
3. **Email unlock**: `POST /api/public-scan/:id/unlock { email, name? }` saves the email on the scan
   (the first email wins), returns a share link **`/scan/:token`** valid for 30 days that shows the full
   results, and pushes the contact to HubSpot.
4. **Signup inherits the scan**: when someone signs up with an email that has unlocked free scans,
   each scanned domain becomes a new site, the scans move to it (`site_id`, `owner_id` set), and their
   English strings are upserted into its translation queue. Drafts are then generated as after a normal
   scan. Mock placeholder drafts are not carried into a real queue.

**Site score.** `src/lib/siteScore.ts` rolls the per-page 0–100 scores into one number, weighting each
page by its worst issue (critical ×4, high ×3, medium ×2, otherwise ×1). Pages that failed to load are
left out. Bands: 85+ low, 60–84 medium, 35–59 high, under 35 critical, raised to at least *high* when any
page has a critical gap and at least *medium* for a high one. Free scans store this score in
`scans.score`; app scans keep the plain page average.

**Limits.** One free scan per domain per 24 hours (`www.`, case and paths count as the same domain;
a repeat returns `429` with the existing scan, and the page shows those results). Per-IP limits:
`PUBLIC_SCAN_IP_LIMIT` scans per hour (default 5) and 20 unlocks per hour. At most 20 public scans can
wait or run at once (`503` beyond that). Public scans skip screenshots. The IP limits are in memory, per
process, like the login throttle.

**Copy.** The free-scan UI is in English and French (`?lang=fr`, otherwise the browser's language);
strings live in `src/lib/freeScan/i18n.ts`. It never says "compliant" or "certified" (or *conforme* /
*certifié*); a unit test enforces this. Use "gaps found" and "French drafts".

**HubSpot.** Set `HUBSPOT_API_KEY` to a private-app access token with `crm.objects.contacts.write`.
Each unlock creates the contact or updates it by email with `email`, `website`, `firstname`/`lastname`
(when a name is given), `bill96_free_scan = true` and `bill96_site_score`. Create the two custom contact
properties in HubSpot first (Settings → Properties → Contact): `bill96_free_scan` (single checkbox) and
`bill96_site_score` (number). Until they exist, HubSpot rejects them, so the app retries with the standard
fields and logs a warning. Without a key nothing is sent and the server logs a line. HubSpot errors never
block the unlock.

## Database migrations

`src/lib/schema.sql` runs on every start and is idempotent, so existing databases (PGlite or Postgres)
upgrade themselves on the next start. The free scan added:

- `scans.site_id` is now nullable (unclaimed public scans have no site);
- new `scans` columns: `source` (`'app'` | `'public'`, default `'app'`), `owner_id`, `domain`, `email`,
  `share_token` (unique), `share_expires_at`, plus indexes;
- new table `public_scan_strings` (a public scan's English strings and drafts until it is claimed).

To apply them by hand instead, run the statements under "Free scan funnel" at the end of `schema.sql`.

## French translation drafts

- With `ANTHROPIC_API_KEY` set, drafts use `claude-sonnet-5-5` (override with `CLAUDE_MODEL`).
  Requests use structured JSON output, batches of 40 strings, a Quebec-French style guide, your
  site glossary, and server-side refusal fallback.
- Without a key the queue still works. You type translations yourself.
- `TRANSLATION_PROVIDER=mock` produces `[FR] …` placeholders (used by the automated tests).

Glossary format (Site → Settings), one entry per line:

```
Add to cart => Ajouter au panier
GlowRadiance          ← bare term = brand, keep untranslated
```

## Command line

The old `check.js` is replaced by a CLI that uses the same scanner (no database):

```bash
npm run check -- https://store.com/products/x https://store.com/fr/products/x
npm run check -- --site https://store.com --max 10
npm run check -- https://store.com/fr --translate   # also print French drafts
npm run check -- https://store.com --json
```

## Tests

```bash
npm test            # unit + real-Chrome scanner tests against the fixture storefront (54 tests)
npm run test:e2e    # full browser journeys through the web app (10 tests)
npm run typecheck
```

The e2e suite starts the fixture storefront (`tests/fixtures/`) and a throwaway app instance on
port 3100 with its own database. It then signs up, adds a Shopify site, scans 7 pages, checks
issues, the screenshot and measured font sizes, edits/approves/ignores translations, exports CSV,
tries to publish, saves an encrypted connector token (checks it never comes back to the
browser), confirms a second user gets 404s on the first user's data, and logs out. The free-scan
journey pastes the fixture URL on `/scan`, checks the locked results (score, band, top 5 gaps, French
drafts) in English and French, hits the per-domain limit, unlocks with an email, checks the contact
reached the fake HubSpot API in the fixture server, opens the share link in a fresh browser, signs up
with the same email and finds the strings in the new site's queue.

## Project layout

```
src/app/                 Next.js pages, server actions (actions.ts), API routes
src/lib/scanner/         extract (in-browser), language, analyze, hreflang, discover, scanPage
src/lib/jobs.ts          background scan queue, translation-item upserts, draft generation
src/lib/siteScore.ts     severity-weighted site score and risk bands
src/lib/freeScan/        free scan: limits, EN/FR copy, HubSpot client, public scan store
src/lib/translate.ts     Claude fr-CA drafting
src/lib/connectors/      generic / shopify / wordpress connectors
src/lib/db.ts, schema.sql  Postgres or embedded PGlite
scripts/check.ts         CLI
tests/                   unit, e2e, fixture storefront (+ fake HubSpot API)
docs/free-scan-brief.md  build brief for the free scan funnel
```

## Next steps

1. **Shopify publish**: `translatableResources` + `translationsRegister` (Admin GraphQL) to push approved strings to the French locale.
2. **WordPress publish**: Polylang/WPML/TranslatePress write-back, or a small companion plugin.
3. **Shopify app / WP plugin packaging**: OAuth install flow instead of pasted tokens.
4. **Scheduled re-scans and drift alerts** (webhook/cron), plus a cart/checkout flow check.
5. Team workspaces (shared sites between users) and email verification / password reset.
