# Session handoff — IndustriParts v4.1 work

**As of 11 May 2026 (end of session).**
Phases 0–9 all live in production, all v4.1 follow-ups closed, plus
three small follow-ons this session: customer-visible product
gallery + SEO-only tags + the audience toggle (`Privat | Bedrift`) in
the TopBar for guests, and the new gross-margin row on the admin
overview.

Next up — **v4.2 storefront redesign**. Three independent PRs queued
in `docs/v4.2-redesign-plan.md`. Nothing started yet; all design
decisions locked with the product owner.

## Quickstart for a new owner

1. **Read this file top to bottom.** Then:
2. [`v4.2-redesign-plan.md`](v4.2-redesign-plan.md) — the queued
   redesign work, decisions, file-by-file plan, time estimates.
3. [`v4.1-implementation-plan.md`](v4.1-implementation-plan.md) —
   the upstream master plan (phases 0-9).
4. [`route-stub-registry.md`](route-stub-registry.md) — known route
   stubs (`/kampanjer`, `/info/finn-lager`).

Codebase is on `main` at `292dd21` — production Railway tracks it and
is live. Deploy `ebe67970` (11 May 10:21 +02:00) = SUCCESS.

## This session's deltas (skim before starting work)

Five small follow-ons landed:

| Commit | What |
|---|---|
| `1255f75` | Customer-facing product gallery (hero + thumbnails) + tags exposed as `<meta keywords>` + JSON-LD Product schema on PDP. `mainImage` moved out of admin-only fieldset into a public "Bilder" group. |
| `ace9276` | `Privat | Bedrift` segmented toggle in the TopBar — only for anonymous guests. Pure cookie flip via existing `setCustomerTypeAction` (no BRREG lookup). Hidden for authenticated users. Reload after flip so server-rendered prices refresh. |
| `292dd21` | Admin overview: new `Bruttofortjeneste (estimat)` row beneath Omsetning showing margin in kr + % per period (I dag / Denne uka / Denne mnd). Footnote when not 100 % of items have `purchasePrice`. Existing Omsetning flipped from `totalPrice` (incl. MVA) to `subtotalExclMva` (ex-MVA) — the old label was technically misleading in Norwegian accounting terms. |
| `bc05e8f` | Lint cleanup. 11 in-app `<a href>` migrations to `next/link` (CookieConsentBanner, LoginForm, RegisterForm, ForgotPasswordForm, info/deletyper, produkter/[sku] breadcrumb, admin overview "Se alle" links, admin produktforslag back-link, _NyttProduktForm). One `/api/exports/low-stock` `<a>` kept with eslint-disable + explainer (file download, not page nav). Plus `eslint --fix` autofix pass. Lint problem count 273 → 155. |
| `a408c21` | **Chrome refresh.** Red Dyvikamaskin logo (321×98 PNG, displayed at 118×36 via `next/image` with `loading="eager"` + `fetchPriority="high"`) replaces the text wordmark in TopBar. VELG LAGER button dropped from PrimaryNav. Three logo files committed to `public/brand/`. Locked-in product decision: chrome stays two-row white, no dark utility bar. |
| `f1eb858` | **Manual backup trigger.** New "Kjør sikkerhetskopi nå" button on `/admin/backup/setup` enqueues a one-off `daily-backup` job to the maintenance queue — same code path as the 02:00 UTC cron. Polls every 2 s for the resulting `BackupRun` row and surfaces SUCCESS / SKIPPED / FAILED with size + duration + storage path. Verified end-to-end (68 KB, 2 s, real artifact in Supabase Storage). |

## Operational status (verified 11 May 2026)

- **Daily backup pipeline: fully alive.** SUPER_ADMIN
  `dyvikamaskin@bojoind.com` enrolled an age key pair on 11 May 08:24
  UTC. A manual verification run at 12:27 UTC produced a 68 KB
  `SUCCESS` artifact at `2026/05/11/industriparts-…sql.age` in
  Supabase Storage in ~2 seconds. Next scheduled run tomorrow at
  02:00 UTC should land green automatically. (The 02:00 UTC run this
  morning returned SKIPPED because the key wasn't enrolled yet —
  that's the BackupRun row sitting below the SUCCESS one.)

  Manual trigger lives at `/admin/backup/setup` →
  "Verifiser sikkerhetskopi" → "Kjør sikkerhetskopi nå". Same code
  path as the cron — useful whenever a key is rotated or the pipeline
  needs a sanity check.

- **Railway curl cron retirement: hold for now.** The `maintenance`
  BullMQ queue worker boots cleanly on every deploy (we see
  `[queue] workers started: notifications, enrichment, maintenance` in
  startup logs), but the Railway CLI scopes `railway logs --since 24h`
  to the current deployment only — we can't yet confirm 24 hours of
  `[maintenance] expired reservations` ticks across deployments from a
  terminal. Check the **Railway dashboard logs** (which span
  deployments) for that line before deleting the curl service. The
  `curl-cron` service is harmless to keep running in the meantime.

- **Vipps redirect URLs** are constructed dynamically — there is no
  `VIPPS_REDIRECT_URI` env var on Railway. The route-group rename in
  PR 1 of the v4.2 queue cannot break the Vipps flow because of this.
  (Recorded in `v4.2-redesign-plan.md` §PR 1 Risks.)

- **Logo dimensions for PR 1** of the v4.2 queue: `dyvika-logo-red.png`
  is 321 × 98 px. At display height 36 px → width 118 px. Recorded in
  `v4.2-redesign-plan.md` §PR 1 step 1.

## Outstanding work queue

| Order | Branch | Scope | Reference |
|---|---|---|---|
| 1 | `phase-globalize-topbar` | Route group `(store)` → `(customer)`, 6 folder moves into it, EntryModal mount shift, cached drawer fetchers. **No chrome work — already shipped (`a408c21`).** | `v4.2-redesign-plan.md` §PR 1 |
| 2 | `phase-desktop-drawer` | Cascading multi-pane drawer on `≥md`, mobile keeps stack/push | `v4.2-redesign-plan.md` §PR 2 |
| 3 | `phase-design-homepage` | Tokens, marketing components for homepage **body only** (chrome unchanged), Kampanjer + Outlet placeholders | `v4.2-redesign-plan.md` §PR 3 |

Total estimated time: ~6 h 45 min (down from ~7 h 30 min after the
chrome refresh shipped early as `a408c21`). Each PR is independent —
you can stop after any of them and ship.

## Earlier session's deltas (for context)

Five focused follow-ups landed on top of the Phases 0–5+4.5 base
during the previous session (10 May 2026):

| Commit | What |
|---|---|
| `c9e6b9c` | `VIPPS_DISABLE_CAPTURE` kill-switch · Sentry pipe for terminal job failures · search autocomplete dropdown |
| `0ac27b0` | New `maintenance` BullMQ queue; `expire-reservations` runs every minute via `upsertJobScheduler`. Retires the Railway curl cron once verified. |
| `2a04cf1` | Daily backup at 02:00 UTC → Supabase Storage. New `BackupRun` model. `BackupWidget` rewritten to read from BackupRun (not Profile.lastBackupAt). |

There are now **two backup paths** running in parallel — see the
"Backup architecture" section below.

For deep context read these in order:
1. **This file** — current state, decisions, what's next.
2. [`v4.1-implementation-plan.md`](v4.1-implementation-plan.md) — master plan, phase definitions, decisions register, risk register.
3. [`route-stub-registry.md`](route-stub-registry.md) — every route referenced from the new chrome that does not yet have a page.
4. [`restore-runbook.md`](restore-runbook.md) — how to decrypt + restore an age-encrypted backup.
5. [`industriparts-spec-v4.docx`](industriparts-spec-v4.docx) — system specification (v4.1).

## Where the code is

`main` HEAD: `f1eb858 feat(backup): "Kjør sikkerhetskopi nå" trigger on /admin/backup/setup`.
Production Railway tracks `main` and is live with everything below.
Last deploy: `31c31068` SUCCESS at 11 May 14:21 +02:00.

Recent commits on `main` (newest first):

```
f1eb858 feat(backup): "Kjør sikkerhetskopi nå" trigger on /admin/backup/setup
36be766 docs: shrink v4.2 plan after early chrome refresh (a408c21)
a408c21 feat(chrome): red logo in TopBar + drop VELG LAGER from PrimaryNav
6d3d3c7 docs: pin logo dims, record VIPPS verification, backup + cron status
bc05e8f chore(lint): a-href → Link migration + autofix sweep
70e10b1 docs: refresh handoff + add v4.2 storefront redesign plan
292dd21 feat(admin-overview): gross margin tiles + flip Omsetning to ex-MVA
ace9276 feat(customer-type): Privat | Bedrift toggle in TopBar for guests
1255f75 feat(product-visibility): customer gallery + SEO-only tags
db5beb6 feat(follow-ups): finish open phase 7/8/9 items
e9b236f feat(phase-9): GDPR -- cookie banner + privacy + data rights + consent gate
a0c06ae feat(phase-8): B2B richness -- per-customer pricing + backorder + supplier + marketing consent
5e73bea feat(phase-7): returns + quotes + SAF-T 1.10 + a11y scaffolding
a187a1a feat(admin-metadata): purchasePrice + tags + hiddenDescription + image upload
19010d6 feat(phase-6): hardening -- RLS + rate limits + CSP + opt-in MFA
2a04cf1 feat(daily-backup): automatic age-encrypted backup at 02:00 UTC to Supabase Storage
0ac27b0 feat(maintenance-queue): BullMQ-cron migration -- expire-reservations every minute
c9e6b9c chore(follow-ups): VIPPS_DISABLE_CAPTURE + Sentry job alerts + search autocomplete
d468bf1 feat(phase-4.5): local-disk backup MVP -- age-encrypted SQL dump
1412867 fix(proxy): exclude /api from next-intl matcher
b84a79e feat(phase-5): pg_trgm + FTS search -- three-stage relevance cascade
```

Phase branches remain on origin as historical references. Phases 6-9
plus the recent follow-ons landed directly on `main` since each was a
self-contained PR rather than a multi-week phase.

GitHub Flow: feature branches off `main`, fast-forward merge back.
Standard gates per PR: `npm run typecheck && npm test && npm run build && npm run audit:links`.

## Phase status

| Phase | State | Notes |
|---|---|---|
| 0 Triage | ✅ Live | Logout via Server Action; `/konto` page; static link-audit script |
| 0.5 Storefront chrome | ✅ Live | TopBar, PrimaryNav, CategoryDrawer (multi-pane drilldown), InfoCardsRow |
| 0.6 Dynamic categories | ✅ Live | `findOrCreateCategoryByPath`, CategoryPicker combobox, `/admin/kategorier` |
| 0.7 Condition / provenance / filters / My Machines | ✅ Live | Schema + admin form + filter bar + `/info/deletyper` + `/konto/mine-maskiner` + PDP badges |
| 1 Foundations | ✅ Live | Vitest, Playwright, CI workflow, WebhookEvent |
| 2 Money correctness (Decimal) | ✅ Live | `Money` brand on `decimal.js`; pricing rejects raw `number`; cart strings across the wire; Vipps webhook + MVA tax CSV use Decimal sums. **Note:** `decimal.js` imported direct, not via `Prisma.Decimal` — see "Build gotcha" below. |
| 3 Vipps capture-on-dispatch + Stock reservations | ✅ Live | §38 compliance gap closed. `StockReservation` table; race fence at checkout. Webhook split (handleAuthorized/handleCaptured/handleVoided). `captureSaleOnDispatch` is the dispatch entry point, wired into both admin "Mark shipped" and the MyBring label route. |
| 4 Job queue (BullMQ) v1 | ✅ Live | Co-host model. `notifications` + `enrichment` + `maintenance` queues. Workers boot via `src/instrumentation.ts`. Sentry pipe wires terminal failures to alerts (`reportJobFailure`). **Requires `REDIS_URL`** — set on Railway + local `.env`. |
| 4.5 Backup (local + automatic) | ✅ Live | Two paths in parallel — see "Backup architecture" below. Manual MVP streams to browser; automatic daily job uploads age-encrypted artifact to Supabase Storage. `BackupRun` audit table tracks every run. |
| 5 Search (pg_trgm + FTS) | ✅ Live | `Product.searchKey` + `Product.searchVector` columns + trigger; three-stage cascade (exact → trigram → FTS) in `src/services/catalog/search.ts`. Storefront autocomplete dropdown wired to `/api/search`. |
| 6 Hardening (CSP / MFA / RLS) | ✅ Live | Two-phase opt-in MFA (env-gated). RLS on customer-data tables. Login + checkout rate limits via Upstash. CSP Report-Only first, then enforce. |
| 7 Returns + Quotes + A11y + SAF-T | ✅ Live | Forbrukerkjøpsloven returns flow with Vipps refund; B2B RFQ → convertToOrder; SAF-T 1.10 XML export; a11y scaffolding (axe-core in CI). |
| 8 B2B richness | ✅ Live | Per-customer `CustomerPriceList`; backorder workflow on SaleItem; Supplier model + admin UI; marketing consent gate on email service. |
| 9 GDPR | ✅ Live | Cookie banner (3 categories, granular); /personvern + /vilkar pages; Art. 20 export (`gdpr.ts`); Art. 17 anonymise; marketing consent. |
| **Follow-ons** | ✅ Live | admin-metadata (purchasePrice + tags + hiddenDescription + image upload); product-visibility (gallery + SEO tags + JSON-LD); customer-type toggle in TopBar; gross-margin tiles on /admin. |
| v4.2 Storefront redesign | ⏳ Queued | Three PRs in `v4.2-redesign-plan.md`. ~7h30. |

## Verified locally as of last commit

- `npm test` — **80/80** passing across 10 test files (kid, brreg, slugify, pricing, reservations, notifications-dispatch, enrichment-dispatch, maintenance-dispatch (incl. daily-backup), search, age round-trip)
- `npm run typecheck` — clean (zero errors)
- `npm run audit:links` — **42 pages, 21 APIs, 0 broken**, 2 known stub references (`/kampanjer`, `/info/finn-lager`)
- Production smoke tests (HTTP):
  - `/`, `/produkter`, `/info/deletyper` → 200
  - `/api/search?q=ab` → 200 with JSON
  - `/admin/backup/setup` → 307 redirect to `/login?next=…`
  - `/api/admin/backup/download` → 401 `{"error":"Unauthorized"}`

## Production DB state

All migrations through Phase 5 + 4.5 are applied. Sequence:

```
20260507154237_phase8_invoice_counter
…
20260509000000_phase15_webhook_event              (Phase 1)
20260510120000_phase07_condition_provenance_savedmachine  (Phase 0.7)
20260510140000_phase3_vipps_capture_stock_reservations    (Phase 3)
20260510200000_phase5_search_pgtrgm_fts                  (Phase 5)
20260510210000_phase45_backup_mvp                        (Phase 4.5)
20260510220000_phase45_backup_run                        (Phase 4.5 follow-up — daily backup)
```

Verify any time:

```sql
SELECT migration_name, finished_at FROM _prisma_migrations
ORDER BY started_at DESC LIMIT 5;
```

Catalog scaffolding present (17 categories, 15 makes, 265 models, 1
profile, 1 store) but **0 products, 0 sales, 0 sale items.** Production
is fully wired and ready for first product import.

## Env vars added across the v4.1 work

```
# Phase 4 — BullMQ requires raw Redis protocol (TCP+TLS), separate from
# the existing Upstash REST creds. The token is the same secret; only
# the URL form differs (rediss://default:<token>@host:6379).
REDIS_URL=rediss://default:gQAAAAAAAamjAAIgcDI2ZDE4ZjUxZmFjY...@driven-gull-108963.upstash.io:6379

# Phase 4 — Cron sweep auth for /api/jobs/expire-reservations.
# Now used only for the manual escape hatch (the BullMQ-cron migration
# made the curl-cron service redundant for scheduling — see operational
# follow-up below).
CRON_SECRET=<set on Railway>

# Daily-backup follow-up: existing service-role key, used by the new
# src/lib/supabase/admin.ts to upload encrypted artifacts to the
# Storage bucket. Was already set for other reasons; no change needed.
SUPABASE_SERVICE_ROLE_KEY=<set on Railway>

# Phase 4 follow-up — kill-switch for the Vipps capture-on-dispatch
# path. Set to "1" or "true" to skip Vipps capture during an outage.
# Default (unset / "0") is normal capture-on-dispatch behavior.
# NOT currently set anywhere — flip on Railway only during a Vipps
# outage. Read at call time; no redeploy required.
VIPPS_DISABLE_CAPTURE=
```

All set on Railway production env (except `VIPPS_DISABLE_CAPTURE`,
which exists only as a code path; flip it on when needed). Local
`.env` mirrors them for dev. **Note:** when `REDIS_URL` is missing the
queue subsystem warns loudly at boot and `enqueueNotification` /
`enqueueEnrichment` calls throw — that loud failure is intentional,
not a bug.

## Build gotcha — decimal.js, not Prisma.Decimal, in shared modules

**Anything imported by a `"use client"` component (or transitively from
one) MUST NOT import `@/app/generated/prisma/client`.** The Prisma 7
client export pulls server-only Node modules (`node:module`,
`node:path`, `node:url`) that Turbopack rejects in client bundles. The
dev server's looser chunking misses it; production builds fail.

Discovered while merging Phase 0–4 into main: the deploy failed because
`formatters.ts` and `CartContent.tsx` had `import { Prisma } from
"@/app/generated/prisma/client"`. Fix: use `import Decimal from
"decimal.js"` directly. Prisma.Decimal IS decimal.js (Prisma vendors it
inside its runtime), so behavior is identical — just packaged through a
path that doesn't drag Node modules into client bundles.

Server-only modules (`pricing.ts`, `cart.ts`, server actions, API
routes) can keep using `Prisma.Decimal` — Prisma's runtime never reaches
the client bundle from those.

## Backup architecture — two paths in parallel

Both paths produce the same `.sql.age` artifact (age-encrypted Postgres
INSERT dump). Decrypt procedure is identical (`docs/restore-runbook.md`):
both need the offline private key that was downloaded once during
`/admin/backup/setup`.

| Path | Trigger | Destination | Source of truth |
|---|---|---|---|
| **Manual** (`/api/admin/backup/download`) | SUPER_ADMIN clicks "Last ned" on `/admin` | Browser download → admin's laptop | Bumps `Profile.lastBackupAt` |
| **Automatic** (`maintenance` queue `daily-backup` job) | `0 2 * * *` cron via `upsertJobScheduler` | Supabase Storage bucket `backups` at `YYYY/MM/DD/industriparts-{ISO}.sql.age` | New `BackupRun` row per attempt |

The two are independent — disabling one doesn't break the other. The
manual path is recommended weekly for "offsite" copies (Supabase = same
vendor as the live DB, so Supabase-wide outage takes both copies down
simultaneously).

**Recipient selection (automatic):** the oldest SUPER_ADMIN with a
`backupPublicKey` is the deterministic recipient. If none, the job
records `BackupRunStatus.SKIPPED` and emits a warning — no exception.
Multi-recipient encryption (so any admin can decrypt) stays an open
follow-up; today's `lib/backup/age.ts` already supports it via
`addRecipient`, but the scheduled job uses a single recipient.

**Retention:** 30 days. After each successful run, `BackupRun` rows older
than 30 days are pruned and the matching Storage artifacts deleted.
Prune failures are non-fatal.

**Bucket setup:** `backups` is auto-created on first run (idempotent
`createBucket` call swallows the "already exists" error). No manual
Supabase config required.

**BackupWidget on `/admin`** reads from the latest `BackupRun(status=SUCCESS)`,
not `Profile.lastBackupAt`. The latter ticks on *both* manual downloads
and automatic runs, so it can lie about automatic backups working when
only manual downloads have happened recently. Staleness threshold is
2 days (was 7) since automatic backups should run daily.

## Latent bug also fixed mid-session — proxy.ts /api/* 404

`src/proxy.ts` matcher was `/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)` —
applied next-intl middleware to **every** non-asset path including
`/api/*`. next-intl can't route API paths and silently 404s them.
Fixed by prepending `api|` to the lookahead. **The Vipps webhook was
silently broken** since the very first deploy; never surfaced because
no real Vipps traffic landed.

## Decisions resolved this session — do not re-litigate

- **B2B payment paths:** Vipps **or** invoice today. Bank transfer + credit card are future expansion. Phase 3 doesn't special-case them.
- **Phase 2 historical-data policy:** moot — 0 sales when refactor landed. Pure pre-launch refactor.
- **Phase 3 grandfathering:** skipped — 0 in-flight AUTHORIZED orders to migrate. Capture-on-dispatch is the only behavior from day one.
- **Phase 3 feature flag:** plan's `VIPPS_CAPTURE_ON_DISPATCH` soak-window flag dropped (no live traffic to soak against). Replaced by the `VIPPS_DISABLE_CAPTURE` kill-switch — shipped this session. When set to `"1"` or `"true"`, `captureSaleOnDispatch` skips the Vipps capture API call but still decrements stock and releases reservations. Sale stays AUTHORIZED; admin reconciles capture via the Vipps portal post-outage. Env var is read at call time, so toggling on Railway takes effect on the next dispatch without redeploy.
- **Decimal library:** use Prisma 7's bundled `decimal.js` directly instead of the plan's `decimal.js-light` (avoids dual-library bundle, matches what Prisma uses internally). On the client side, install `decimal.js` directly per the build-gotcha note above.
- **Phase 4 worker hosting:** option A (co-host in main process) per the cost/operational tradeoff for current load. Migrate to a separate Railway service (option B) only on memory pressure or HTTP-latency regression — same codebase, just a different launcher.
- **CSV `categoryPath` separator:** `/`.
- **CSV `provenance` column:** required on every row, no default (Forbrukerkjøpsloven / Markedsføringsloven safety).
- **Manual new-product `provenance` default:** AFTERMARKET (lowest claim).
- **Provenance terms (Norwegian):** Originaldeler / OEM-deler / Uoriginale deler / Aftermarket. Help page at `/info/deletyper`. Wording uses "fabrikken" not "maskinprodusenten".
- **Condition rating labels:** descriptive (Som ny / Utmerket / God / Akseptabel / Slitt), 5-dot scale on PDP.
- **Saved machine cap per profile:** 20.
- **Filter persistence:** URL only (saved machines are the persistent equivalent).
- **Slugify rules:** Norwegian-friendly (`æ→ae`, `ø→o`, `å→a` plus Swedish/German diacritics). 10 unit tests cover edge cases.
- **Hamburger drawer is the canonical category nav.** No permanent left sidebar on storefront pages. Reference design: tools.no.
- **Test framework:** Vitest 3.2.4. Coverage via `@vitest/coverage-v8`.
- **Search trigram threshold:** 0.4. Three-stage cascade priority is exact > trigram > FTS.

## Decisions still pending — need user sign-off before code

1. **Phase 6 — MFA grace period for existing admins.** Default 7 days. Default also applies the day Phase 6 ships, not retroactively from account creation.

(Most other plan decisions are now resolved as Phases 2/3/4/4.5/5 shipped. The MFA grace period is the only outstanding one.)

## Open follow-ups

Real work items that didn't make it into the phase that introduced
them. Loose-coupled — pick any in any order. Shipped follow-ups are
listed in the next section for posterity.

### Phase 4 follow-ups (open)

- **PDF queue split.** Invoice PDF rendering currently runs inside the `notifications:invoice-issued` job handler. Splitting it out lets us cap concurrency separately and add a polling endpoint for "is the invoice PDF ready yet?" UX. ~half day.
- **Invoice 202 + polling.** Plan calls for the invoice route to return 202 immediately and expose a status-poll endpoint. Today it's synchronous; deferred until the PDF queue above is in place.

### Phase 4.5 follow-ups (open)

- **`/admin/sikkerhetskopier`** admin page listing past `BackupRun` rows. Schema exists; UI not built yet. Read `BackupRun` ordered by `startedAt DESC` and render status + size + storagePath as a download link (need a signed-URL endpoint for that — Storage bucket is private). ~half day.
- **Multi-recipient age encryption** when there are multiple SUPER_ADMINs (so any of them can decrypt). Today's scheduled backup encrypts to one recipient — the oldest SUPER_ADMIN with a key. `encryptStream` in `lib/backup/age.ts` already supports `addRecipient`; the call site change is small once needed. ~1 hour.
- **Email alert on stale or failed backups.** `BackupWidget` shows the dashboard banner already, but a Resend email would page someone who isn't watching the dashboard. Hook it into the `daily-backup` handler when it records SKIPPED/FAILED, plus a separate "no SUCCESS in N days" check. ~half day.
- **Offsite backup destination** (optional, defence in depth). Today the automatic copy lands in Supabase Storage — same vendor as the live DB. A weekly push to S3 / Backblaze in a different account would survive a Supabase-wide incident. Same `runScheduledBackup` pipeline, just an additional upload target. ~1 day if scope creeps; ~half day if pragmatic.

### Phase 5 follow-ups (open)

- **Search-result highlighting.** Bold matched tokens in the autocomplete dropdown + on the results page. ~1 hour.
- **Trigram threshold tuning.** 0.4 is the current default; observe real query patterns once products land and adjust.

### Phase 3 follow-ups (open)

- **Refund flow.** Vipps `REFUNDED` webhook is currently logged-only; no Sale lifecycle update, no admin "Refund" UI. When refunds become operationally relevant, add `handleRefund` in the webhook + an admin action that calls `refundVippsPayment` and marks `Sale.status = REFUNDED`. ~half day.
- **Parallel-checkout integration test.** Plan calls for "50 parallel checkouts on the last unit, zero overcommits." Needs real-DB infra (testcontainers or a Supabase preview branch). Deferred until that infra exists.

### Phase 2 polish (open)

- **9 remaining display-side `.toNumber()` sites** in admin pages (`/admin/page.tsx`, `/admin/regnskap/page.tsx`, `/admin/mva-rapport/page.tsx`), `/betaling/bekreftelse`, `invoice-pdf.tsx`, `notification-service.ts`. None affect money correctness — formatters now accept Decimal so the redundant `.toNumber()` calls can be dropped. ~1 hour.

### Pre-Phase-5 small items (open)

- **Edit-product editable form** at `/admin/produkter/[sku]/rediger` — read-only display today; CategoryPicker + condition/provenance + provenance fields need wiring.
- **Drag-to-reorder** in `/admin/kategorier`. Server action `reorderCategoriesAction` exists; UI is static order.
- **Brand chip-row tidy-up** on `/produkter` — text `brand` field still rendered separately from the Phase 0.7 `MachineMake` filter chips.

### Operational items (manual, no code)

- **Retire the Railway `curl` cron service.** The BullMQ `maintenance` queue now schedules `expire-reservations` every minute (verified in CI; pending verification in production logs). Once Railway logs show `[maintenance] expired reservations` ticks consistently for ~24 hours, delete the `curl` cron service from the Railway project. `/api/jobs/expire-reservations` stays as a manual escape hatch; `CRON_SECRET` stays needed for it.
- **Verify the daily backup runs at 02:00 UTC.** First run will be the morning after deploy. Expected outcomes: `SUCCESS` row in `BackupRun` if a SUPER_ADMIN has registered an age public key via `/admin/backup/setup`; otherwise `SKIPPED`. Check `/admin` dashboard — `BackupWidget` should reflect "Siste automatiske kjøring: for 0 dager siden (X KB)".
- **Pull a manual backup every now and then.** Click "Last ned sikkerhetskopi" on `/admin` weekly and stash the resulting `.sql.age` file somewhere durable (external drive, cloud sync, etc.). The Supabase Storage copy is automatic but co-located with the live DB; a manual local copy is your true offsite backup.

## Shipped follow-ups (for posterity)

For context on what's already been done if you're re-reading old plan
sections that referenced "todo: …":

- ✅ **BullMQ-cron migration** — `maintenance` queue + `expire-reservations-cron`. (`0ac27b0`)
- ✅ **Sentry alert wiring for failed BullMQ jobs** — `src/lib/sentry.ts` + worker `failed` handlers. (`c9e6b9c`)
- ✅ **`VIPPS_DISABLE_CAPTURE` kill-switch** — env var inside `captureSaleOnDispatch`. (`c9e6b9c`)
- ✅ **Daily-backup at 02:00 UTC → Supabase Storage** — `runScheduledBackup` + `BackupRun` model + retention. (`2a04cf1`)
- ✅ **`BackupRun` model** — audit trail for every scheduled and manual backup. (`2a04cf1`)
- ✅ **BackupWidget rewritten** to read latest `BackupRun(SUCCESS)` instead of `Profile.lastBackupAt`. (`2a04cf1`)
- ✅ **Storefront autocomplete dropdown** — `SearchBar` debounced fetch to `/api/search` + keyboard nav. (`c9e6b9c`)

## Infra state

- **Repo:** GitHub `Dyvikamaskin/Dyvikamaskin-Webshop`. `gh` CLI authenticated as VenturaAI1.
- **Supabase project:** `nxqqmplptalbxmfmbtfs` (Dyvikamaskin Webshop, EU West, ACTIVE_HEALTHY). Modern secret key was rotated 10 May 2026 — `rotation_2026_05` (id `1d5b66a5…`); old `default` deleted. Railway env `SUPABASE_SERVICE_ROLE_KEY` holds the new value.
- **Supabase Storage:** bucket `backups` is auto-created on the first daily-backup run (private, idempotent `createBucket`). Currently empty until the first 02:00 UTC tick executes successfully.
- **Railway:** Project `dyvikamaskin-webshop` (id `3876e777-…`). One service `Dyvikamaskin-Webshop` plus a `curl` cron service (the curl-cron is now **redundant** — BullMQ schedules expire-reservations directly; delete after verifying production logs show the BullMQ ticks; see operational follow-ups). Single environment `production`. PR Environments not enabled (paid feature). `railway` CLI authenticated as `admindyvikamaskin@bojoind.com`.
- **Supabase Branching:** Persistent staging branches require Pro plan ($25/mo). Free tier offers per-PR preview branches only via the paid GitHub Integration. Decision: defer Supabase staging until Phase 6 needs it for safe RLS testing.
- **Sentry:** wired (org `dyvika-maskin`, project `javascript-nextjs`). DSN in env vars.
- **Upstash Redis:** wired and active. Used by rate limiter via REST creds; BullMQ uses TCP via `REDIS_URL`. Same database, different protocol.

## Permissions / Claude Code setup

- `.claude/settings.json` allowlist: routine browser MCP tools + `Bash(git*)`, `Bash(node*)`, `Bash(npm*)`, `Bash(npx*)`, `Bash(tsx*)`, `Bash(prisma*)`, `PowerShell(*)`. No per-call prompts for these.
- The Chrome in Claude side panel has its own permission system separate from Claude Code's. Persistent allowlist in the extension's LevelDB includes `*.railway.com`, `*.supabase.com`, `*.github.com`, `*.supabase.co`, `*.up.railway.app`. Per-turn whitelist set by Claude Code's MCP host overrides this for navigations driven from this code session — known limitation.
- MCP servers available mid-session that bypass the per-turn whitelist: `fetch` (HTTP), `puppeteer`, `chrome-devtools-mcp`, `supabase` (full management API minus key rotation). Use these for any browser-side work that the Chrome bridge blocks.

## How to continue

**Option A — same machine, same Anthropic account, this Claude Code window already open:**
Just keep typing. Full context is already loaded.

**Option B — fresh Claude session (new Anthropic account, or new chat):**
```
cd "C:\Users\Ventura AI\Documents\industriparts"
```
Then either continue in Claude Desktop, or open a fresh Claude Code session and tell it:
> Read docs/handoff.md and docs/v4.1-implementation-plan.md, then we continue from where we left off.

The project memory file at `~/.claude/projects/C--Users-Ventura-AI/memory/project_industriparts.md` has been updated with current phase progress, so any new Claude Code session in this repo automatically loads phase awareness. (Note: project memory is per-Anthropic-account; a different account starts fresh and must read the docs directly.)

## What to start on next

In recommended order:

1. **Verify the new automatic backup actually ran.** First 02:00 UTC tick after the latest deploy is the moment of truth. Check `/admin` — `BackupWidget` should say "Siste automatiske kjøring: for 0 dager siden (X KB)". If it still says `SKIPPED`, the operator hasn't completed `/admin/backup/setup`; do that.
2. **Retire the Railway curl cron service.** Wait until production logs show `[maintenance] expired reservations` ticks for ~24 hours, then delete the curl service from Railway. Operational hygiene; no code work.
3. **Add a real product** (manual create or CSV import) and walk a full money flow end-to-end: cart → checkout → reserve → AUTHORIZED → mark shipped → CAPTURED → invoice. With 0 sales today, none of the new payment-path code has been exercised against live data; the unit tests cover the math but a real-product walkthrough is the missing acceptance gate.
4. **Phase 6 — Hardening** (CSP / admin MFA / RLS as defence-in-depth). One open decision: MFA grace period (default 7 days). 3–4 dev-days. The most operationally valuable phase remaining.
5. **Phase 7 — Returns + Quotes + A11y + SAF-T** (compliance bundle). 4–5 dev-days.

Or, if you want to push features rather than infra: **content + product import.** The catalog scaffolding (categories, machine fitments) is in place; loading actual products is what unlocks the storefront for real customers.

**Smaller items if you have an hour:** any of the open follow-ups
above. The Phase 2 `.toNumber()` cleanup is ~1 hour and purely
cosmetic. The `/admin/sikkerhetskopier` admin page is ~half day and
becomes useful as `BackupRun` rows accumulate.
