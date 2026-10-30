# Free scan funnel: build brief

Public front door for Bill 96 Checker: a store owner pastes a URL, sees a site score and
French drafts without an account, unlocks the full results with an email (lead goes to
HubSpot), signs up, and finds the scan's English strings already in their translation queue.

> Assembled on 2026-10-30 from the Claude Code build prompt for this repo and the Labs idea
> brief "Compliance Monitor — Brief" (Monkeys at Work Labs Drive,
> https://docs.google.com/document/d/1kXzA2Fs82jPsZ02rkqVAGBCifSnp8dZHsuA0AJmq0wA). No separate
> free-scan brief was found in the Labs Drive. If one exists, replace this file with it.

## Why

From the Labs brief:

- A free tool (Conformètre) already offers a one-time scan with a score and a PDF report, so
  "we check your site" has no standalone value. The free scan is our **top of funnel**.
- What nobody combines is checking **plus fixing**: French drafts in a review queue, French
  prominence (not just presence), and hreflang checks. The free scan should show that
  difference in under a minute: a score, the biggest gaps, and real French drafts.
- Go-to-market starts with Quebec Shopify merchants (roughly 8,000 to 12,000 active stores).
  Every free scan is a lead.

## Reuse, don't rebuild

The scanner, per-page 0–100 score, `discover` module, job queue (`src/lib/jobs.ts`), SSRF
guard and `translate.ts` drafting already exist. New work is the public front door only.

## What to build, in order

1. **Public scan endpoint, no account.**
   - `/scan` page plus `/api/public-scan`. Input: one URL.
   - Discover the homepage plus up to 10 pages with the existing `discover` module.
   - Limits: one free scan per domain per 24 hours, an IP rate limit, the existing SSRF guard.
   - Reuse the `src/lib/jobs.ts` queue; return a scan id and queue position. Cap concurrency
     at `SCAN_CONCURRENCY`.
   - Public scans are stored with `owner_id = null` and a nullable `email` column so they can
     be claimed later.
2. **Site-level score.**
   - Roll the existing per-page 0–100 scores up into one severity-weighted site score.
   - Risk bands: low / medium / high / critical.
3. **Public results page.**
   - Shows the site score and band, the top 5 issues in plain language with one fix line each,
     and the first 5–10 English strings with their fr-CA draft side by side (existing drafting;
     mock provider when there is no `ANTHROPIC_API_KEY`).
   - Locked until email: the full issue list and the total English-string count.
   - Copy rule: never "compliant" or "certified". Use "gaps found" and "French drafts".
   - Bilingual EN/FR UI strings.
4. **Email unlock + HubSpot.**
   - An email field unlocks the full results and a shareable link (`/scan/:token`, 30-day
     expiry).
   - Push to the HubSpot contacts API: email, website URL, site score, optional name, and
     property `bill96_free_scan = true`. Use the `HUBSPOT_API_KEY` env var; no-op with a log
     line when it is unset.
   - Save the email on the scan row.
5. **Signup inherits the scan.**
   - When someone signs up with an email that has public scans, attach those scans to a new
     site and upsert their English strings into that site's translation queue.
   - `ALLOW_SIGNUP` stays on.
6. **Tests.**
   - Extend `tests/e2e`: paste the fixture-store URL on the public page → results without an
     account → email unlock → signup → strings present in the queue.
   - Unit tests for the site-score rollup and the per-domain rate limit.

## Constraints

- Don't touch the authenticated app flows except the signup hook in step 5.
- Keep schema changes in `schema.sql`, with a migration note in the README.
- Add new env vars to `.env.example`.
- Update the README: a new "Free scan" section, and point "landing page / waitlist"
  references at this flow.
- `npm run typecheck`, `npm test` and `npm run test:e2e` must pass.

## Not in scope

PDF reports, badges, Shopify publish-back (next task), team workspaces, password reset,
scheduled rescans.

## Done when

A store owner can paste a URL at `/scan`, see a score and French drafts with no account,
unlock with an email (the contact appears in HubSpot), sign up, and find the scan's strings
in their queue. Open a PR titled "Free scan funnel" with a short summary of what changed and
how to test it.
