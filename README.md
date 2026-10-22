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
| **Accounts** | Multi-user sign up / log in (scrypt-hashed passwords, httpOnly DB-backed sessions, login throttling). Each user only sees their own sites. |
| **Sites** | Add a site, pick its platform, store connector credentials (encrypted at rest, AES-256-GCM), glossary, default page budget. |
| **Checks** | One click (*Check now*): discovers pages from robots.txt / sitemap.xml / Shopify sitemap index / `wp-sitemap.xml`, falling back to homepage links. Or pick *specific URLs*. When an English page links a French version (hreflang), that French page is checked right after it, so every page is judged on its French side. Runs in the background with a live progress view. |
| **Real-browser checks** | Each page loads in Google Chrome (Playwright). For every visible text block it records the rendered font size, weight, position (above the fold or not) and role (heading, button, nav, footer). Also image alt text, placeholders, button values, aria-labels, title and meta description. |
| **French vs English** | Classifies each block (fr / en / mixed / unclear) with a word-list detector that ignores words shared by both languages. That fixes the old bug where French "on" counted as English. |
| **Visual prominence** | Weights text by size² × weight × above-the-fold × role. It flags pages where English outweighs French, the biggest English text beats the biggest French text, or English dominates the first screen. |
| **Readiness** | Each English page and its French version are one row. A row is *French-ready*, has *English left*, has *no French version*, or its French wasn't checked. The headline is the share of pages that are French-ready, with the change since the previous check and a short *What to do next* list (`src/lib/readiness.ts`). |
| **Issues** | Owner-facing: no French version, English text on French pages, English alt text/placeholders, English SEO title/description, English more prominent. For a developer (folded away): `<html lang>` missing or mismatched, hreflang problems (missing, no self-reference, no x-default, invalid codes, no French alternate, conflicts, **broken and non-reciprocal alternates**, checked by fetching each alternate; alternates the store refuses to serve to the checker with 401/403/429 are skipped, not reported as broken), JS errors (requests the scanner itself blocks are ignored). |
| **Translations** | Every English string becomes a queue item, deduplicated per site. Claude drafts Quebec French (glossary-aware, brand names preserved). Review them one card at a time (approve with ⌘/Ctrl+Enter, skip, or mark *not needed*) or as a searchable list. A translation memory reuses your approved translations across your sites. Export as CSV (Excel-safe UTF-8) or JSON. |
| **Connectors** | `generic`, `shopify`, `wordpress` behind one `StoreConnector` interface (`src/lib/connectors/`). "Test connection" works now (Shopify Admin API token; WordPress Application Password). **Publishing approved translations back to the store is not built yet**: the Translations page explains how to add the exported CSV by hand, and the code documents the plan. |
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

Open http://localhost:3000, create an account, add a site, and click **Check now**.

To try it without a real store, run the sample storefront with `npm run fixtures` and add these
two lines to `.env.local`, then add `http://127.0.0.1:4100` as a site:

```
ALLOW_PRIVATE_URLS=1
TRANSLATION_PROVIDER=mock
```

Production:

```bash
# .env.local / environment:
#   DATABASE_URL=postgres://...      (recommended)
#   APP_SECRET=<32+ random chars>    (required in production)
#   ANTHROPIC_API_KEY=...            (optional)
#   ALLOW_SIGNUP=0                   (after creating your accounts, if it is internal)
npm run build && npm start
```

Scans run inside the web server process, one scan at a time (pages in parallel,
`SCAN_CONCURRENCY`). For several app instances, move `src/lib/jobs.ts` into a separate worker
that polls `scans WHERE status='queued'`.

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
npm test            # unit + real-Chrome scanner tests against the fixture storefront (41 tests)
npm run test:e2e    # full browser journey through the web app (8 tests)
npm run typecheck
```

The e2e suite starts the fixture storefront (`tests/fixtures/`) and a throwaway app instance on
port 3100 with its own database. It then signs up, adds a Shopify site, checks 7 pages, checks
the readiness headline, to-do list and English/French page pairs, the side-by-side screenshots
and measured font sizes, approves translations in the list and one at a time, exports CSV,
checks that a single English URL also gets its French version checked, saves an encrypted
connector token (checks it never comes back to the browser), confirms a second user gets 404s
on the first user's data, and logs out.

## Project layout

```
src/app/                 Next.js pages, server actions (actions.ts), API routes
src/lib/scanner/         extract (in-browser), language, analyze, hreflang, discover, scanPage
src/lib/jobs.ts          background scan queue (adds French twins), translation-item upserts, draft generation
src/lib/readiness.ts     pairs English/French pages and computes French readiness
src/lib/translate.ts     Claude fr-CA drafting
src/lib/connectors/      generic / shopify / wordpress connectors
src/lib/db.ts, schema.sql  Postgres or embedded PGlite
scripts/check.ts         CLI
tests/                   unit, e2e, fixture storefront
```

## Next steps

1. **Shopify publish**: `translatableResources` + `translationsRegister` (Admin GraphQL) to push approved strings to the French locale.
2. **WordPress publish**: Polylang/WPML/TranslatePress write-back, or a small companion plugin.
3. **Shopify app / WP plugin packaging**: OAuth install flow instead of pasted tokens.
4. **Scheduled re-scans and drift alerts** (webhook/cron), plus a cart/checkout flow check.
5. Team workspaces (shared sites between users) and email verification / password reset.
