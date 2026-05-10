# Session handoff — IndustriParts v4.1 work

**As of 10 May 2026 (end of session — Phases 0–5 + 4.5 all live in production; three Phase 4/5 follow-ups also landed).**
This page captures the live state of the v4.1 upgrade work so a new
developer (or a fresh Claude Code session) can pick it up without
reading the full chat transcript.

For deep context read these in order:
1. **This file** — current state, decisions, what's next.
2. [`v4.1-implementation-plan.md`](v4.1-implementation-plan.md) — master plan, phase definitions, decisions register, risk register.
3. [`route-stub-registry.md`](route-stub-registry.md) — every route referenced from the new chrome that does not yet have a page.
4. [`restore-runbook.md`](restore-runbook.md) — how to decrypt + restore an age-encrypted backup.
5. [`industriparts-spec-v4.docx`](industriparts-spec-v4.docx) — system specification (v4.1).

## Where the code is

`main` HEAD: `d468bf1 feat(phase-4.5): local-disk backup MVP — age-encrypted SQL dump`.
Production Railway tracks `main` and is live with everything below.

Branch stack on origin (newest on top — each branched off its predecessor):

| Branch | Tip commit | Phase |
|--------|-----------|-------|
| `phase-4.5-backup-mvp` | `d468bf1` | 4.5 |
| `phase-5-search` | `1412867` | 5 + proxy fix |
| `phase-4-job-queue` | `0877fe2` | 4 |
| `phase-3-vipps-capture-stock-reservations` | `fe6447b` | 3 |
| `phase-2-money-correctness` | `5af16ff` | 2 |
| `phase-0-7-condition-provenance-filters` | `8ea6009` | 0.7 |
| `phase-0-6-dynamic-categories` | `4874c88` | 0.6 |
| `phase-0-5-storefront-chrome` | `beec854` | 0.5 |
| `phase-1-foundations` | `f9bb613` | 1 |
| `phase-0-triage` | `af44e3d` | 0 |
| `main` | `d468bf1` | (head of the train) |

GitHub Flow: each new phase branches off the previous WIP branch, not
`main`. The full chain has been merged into `main` via fast-forward; the
phase branches remain on origin as historical references.

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
| 4 Job queue (BullMQ) v1 | ✅ Live | Co-host model. `notifications` queue (5 job types) + `enrichment` queue. Workers boot via `src/instrumentation.ts`. **Requires `REDIS_URL`** — set on Railway + local `.env`. |
| 4.5 Local-disk backup MVP | ✅ Live | SUPER_ADMIN-only. age-encrypted SQL dump streaming through `/api/admin/backup/download`; setup at `/admin/backup/setup` generates keypair in-browser. `BackupWidget` on `/admin`. Restore runbook at `docs/restore-runbook.md`. |
| 5 Search (pg_trgm + FTS) | ✅ Live | `Product.searchKey` + `Product.searchVector` columns + trigger; three-stage cascade (exact → trigram → FTS) in `src/services/catalog/search.ts`; `/api/search` autocomplete. |
| 6 Hardening (CSP / MFA / RLS) | ⏳ Not started | One open decision (MFA grace period) — default 7 days |
| 7 Returns + Quotes + A11y + SAF-T | ⏳ Not started | |
| 8 B2B richness | ⏳ Not started | |
| 9 GDPR | ⏳ Not started | |

## Verified locally as of last commit

- `npm test` — **74/74** passing across 9 test files (kid, brreg, slugify, pricing, reservations, notifications-dispatch, enrichment-dispatch, search, age round-trip)
- `npm run typecheck` — clean (zero errors)
- `npm run audit:links` — 41 pages, 18 APIs, **0 broken**, 2 known stub references (`/kampanjer`, `/info/finn-lager`)
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
# Until BullMQ-cron migration retires the curl cron service.
CRON_SECRET=<set on Railway>
```

Both set on Railway production env. Local `.env` mirrors them for dev.
**Note:** when `REDIS_URL` is missing the queue subsystem warns loudly
at boot and `enqueueNotification` / `enqueueEnrichment` calls throw —
that loud failure is intentional, not a bug.

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
- **Phase 3 feature flag:** plan's `VIPPS_CAPTURE_ON_DISPATCH` soak-window flag dropped (no live traffic to soak against). A simpler `VIPPS_DISABLE_CAPTURE` kill-switch is the recommended replacement — not yet implemented.
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

## Open follow-ups not in any phase commit

These are real work items that didn't make it into the phase that
introduced them. Loose-coupled — pick any in any order.

### Phase 4 follow-ups
- **PDF queue split.** Invoice PDF rendering currently runs inside the `notifications:invoice-issued` job handler. Splitting it out lets us cap concurrency separately and add a polling endpoint for "is the invoice PDF ready yet?" UX.
- **BullMQ-cron migration.** `/api/jobs/expire-reservations` is still a REST endpoint hit by the Railway `curl` cron service. BullMQ repeating jobs should replace this; once verified, retire the Railway curl service.
- **Invoice 202 + polling.** The plan calls for the invoice route to return 202 immediately and expose a status-poll endpoint. Today the route is synchronous; deferred until the PDF queue above is in place.
- ~~**Sentry alert wiring** for failed jobs.~~ ✅ Shipped — `src/lib/sentry.ts` `reportJobFailure(queueName, job, err)` called from both queue workers' `failed` handlers. Only terminal failures (attempts exhausted) report so retries don't flood. Sentry is initialized lazily in `src/instrumentation.ts` when `SENTRY_DSN` is set.
- ~~**`VIPPS_DISABLE_CAPTURE` kill-switch.**~~ ✅ Shipped — env var read at call time inside `captureSaleOnDispatch`. When `"1"` or `"true"`, skips the Vipps capture API call but still decrements stock and releases reservations. Sale stays AUTHORIZED — admin reconciles capture via the Vipps portal post-outage. `DispatchResult` gains an optional `captureSuppressed: true` flag.

### Phase 4.5 follow-ups
- **BullMQ repeating job at 02:00 UTC** for automatic daily backups (was deferred per the plan; depends on BullMQ-cron migration above).
- **`BackupRun` model + `/admin/sikkerhetskopier`** admin page listing past runs.
- **Multi-recipient age encryption** when there are multiple SUPER_ADMINs (so any of them can decrypt).
- **Email + dashboard banner** when `lastBackupAt` is >7 days stale.

### Phase 5 follow-ups
- ~~**Storefront autocomplete dropdown.**~~ ✅ Shipped — `SearchBar` converted to a client component with 200 ms debounced fetch against `/api/search`. Keyboard navigation (↑/↓/Enter/Esc), mouse hover, outside-click close, route-change close. Form submit still GETs `/sok?q=…` as the no-JS / pre-hydration fallback.
- **Search-result highlighting.** Currently just relevance-sorted; bolding matched tokens in the result name would be a UX polish.
- **Trigram threshold tuning.** 0.4 is a reasonable default; observe real query patterns once products land and adjust as needed.

### Phase 3 follow-ups
- **Refund flow.** Vipps `REFUNDED` webhook is currently logged-only; no Sale lifecycle update, no admin "Refund" UI. When refunds become operationally relevant, add `handleRefund` in the webhook + an admin action that calls `refundVippsPayment` and marks `Sale.status = REFUNDED`.
- **Parallel-checkout integration test.** Plan calls for "50 parallel checkouts on the last unit, zero overcommits." Needs real-DB infra (testcontainers or a Supabase preview branch). Deferred until that infra exists.

### Phase 2 polish
- **9 remaining display-side `.toNumber()` sites** in admin pages (`/admin/page.tsx`, `/admin/regnskap/page.tsx`, `/admin/mva-rapport/page.tsx`), `/betaling/bekreftelse`, `invoice-pdf.tsx`, `notification-service.ts`. None affect money correctness — formatters now accept Decimal so the redundant `.toNumber()` calls can be dropped.

### Pre-Phase-5 small items
- **Edit-product editable form** at `/admin/produkter/[sku]/rediger` — read-only display today; CategoryPicker + condition/provenance + provenance fields need wiring.
- **Drag-to-reorder** in `/admin/kategorier`. Server action `reorderCategoriesAction` exists; UI is static order.
- **Brand chip-row tidy-up** on `/produkter` — text `brand` field still rendered separately from the Phase 0.7 `MachineMake` filter chips.

## Infra state

- **Repo:** GitHub `Dyvikamaskin/Dyvikamaskin-Webshop`. `gh` CLI authenticated as VenturaAI1.
- **Supabase project:** `nxqqmplptalbxmfmbtfs` (Dyvikamaskin Webshop, EU West, ACTIVE_HEALTHY). Modern secret key was rotated 10 May 2026 — `rotation_2026_05` (id `1d5b66a5…`); old `default` deleted. Railway env `SUPABASE_SERVICE_ROLE_KEY` holds the new value.
- **Railway:** Project `dyvikamaskin-webshop` (id `3876e777-…`). One service `Dyvikamaskin-Webshop` plus a `curl` cron service. Single environment `production`. PR Environments not enabled (paid feature). `railway` CLI authenticated as `admindyvikamaskin@bojoind.com`.
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

1. **Add a real product** (manual create or CSV import) and verify the full money flow end-to-end: cart → checkout → reserve → AUTHORIZED → mark shipped → CAPTURED → invoice. With 0 sales today, none of the new payment-path code has been exercised against live data; the unit tests cover the math but a real-product walkthrough is the missing acceptance gate.
2. **Phase 6 — Hardening** (CSP / admin MFA / RLS as defence-in-depth). Confirms the MFA grace period (default 7 days), then ships. 3–4 dev-days. The most operationally valuable phase remaining.
3. **Phase 7 — Returns + Quotes + A11y + SAF-T** (compliance bundle). 4–5 days.
4. **Pick off the open follow-ups** as appetite allows. The Phase 4 follow-ups (BullMQ-cron + PDF queue split + Sentry alert wiring) are smallest and operationally useful.

Or, if you want to push features rather than infra: **content + product import.** The catalog scaffolding (categories, machine fitments) is in place; loading actual products is what unlocks the storefront for real customers.
