# Session handoff — IndustriParts v4.1 work

**As of 10 May 2026 (late session).** This page captures the live state of
the v4.1 upgrade work so a new developer (or a fresh Claude Code session)
can pick it up without reading the full chat transcript.

For deep context read these in order:
1. **This file** — current state, decisions, what's next.
2. [`v4.1-implementation-plan.md`](v4.1-implementation-plan.md) — master plan, phase definitions, decisions register, risk register.
3. [`route-stub-registry.md`](route-stub-registry.md) — every route referenced from the new chrome that does not yet have a page.
4. [`industriparts-spec-v4.docx`](industriparts-spec-v4.docx) — system specification (v4.1).

## Where the code is

Current branch: `phase-4-job-queue` (local-only at time of writing, push when ready).

Branch stack (newest on top — each builds on the previous):

| Branch | Latest commit | Phase |
|--------|--------------|-------|
| `phase-4-job-queue` | (local — pending push) | 4 |
| `phase-3-vipps-capture-stock-reservations` | `fe6447b` | 3 + docs refresh |
| `phase-2-money-correctness` | `5af16ff` | 2 |
| `phase-0-7-condition-provenance-filters` | `8ea6009` | 0.7 + docs refresh |
| `phase-0-6-dynamic-categories` | `4874c88` | 0.6 + handoff doc |
| `phase-0-5-storefront-chrome` | `beec854` | 0.5 |
| `phase-1-foundations` | `f9bb613` | 1 |
| `phase-0-triage` | `af44e3d` | 0 |
| `main` | `487869a` | docs only |

GitHub Flow: each new phase branches off the previous WIP branch, not `main`.
When ready to merge, the chain merges into `main` in order.

## Phase status

| Phase | State | Notes |
|---|---|---|
| 0 Triage | ✅ Shipped | Logout via Server Action; `/konto` page; static link-audit script |
| 0.5 Storefront chrome | ✅ Shipped | TopBar, PrimaryNav, CategoryDrawer (multi-pane drilldown), InfoCardsRow |
| 0.6 Dynamic categories | ✅ Shipped | `findOrCreateCategoryByPath`, CategoryPicker combobox, `/admin/kategorier`, static sidebar removed |
| 0.7 Condition / provenance / filters / My Machines | ✅ Shipped | Schema additions, admin form fields, visible filter bar on listings, `/info/deletyper`, `/konto/mine-maskiner`, condition + provenance badges on PDP. Migrations applied to prod. |
| 1 Foundations | ✅ Shipped | Vitest, Playwright, CI workflow. WebhookEvent migration applied to prod. |
| 2 Money correctness (Decimal) | ✅ Shipped | `Money` brand on Prisma.Decimal; pricing.ts rejects raw `number`; cart pipeline strings across the wire; Vipps webhook + MVA tax CSV use Decimal sums. 16 new edge-case tests. No schema change. |
| 3 Vipps capture-on-dispatch + Stock reservations | ✅ Shipped | §38 compliance gap closed: capture-on-dispatch only. New `StockReservation` table; race fence at checkout. Webhook split (handleAuthorized/handleCaptured/handleVoided). `captureSaleOnDispatch` is the single dispatch entry point, wired into both admin "Mark shipped" and the MyBring label route. Migration applied to prod 2026-05-10. |
| 4 Job queue (BullMQ) | ✅ Shipped (v1) | Co-host model (option A). 2 queue domains: `notifications` (5 job types) + `enrichment`. Workers boot via `src/instrumentation.ts` Next 16 hook. **Requires `REDIS_URL`** — see "Env vars" below. PDF queue, BullMQ-cron migration, and invoice 202+polling deferred as Phase 4 follow-ups. |
| 5–9 | ⏳ Not started | |

## Verified locally as of last commit

- `npm run audit:links` — 41 pages, 18 APIs, **0 broken** (2 stub references tracked in registry)
- `npm test` — **59/59** passing across 7 test files (KID/Luhn, modulo-11 Brreg, slugify, pricing edge cases, stock reservations, queue dispatch ×2)
- `npm run typecheck` — clean (only pre-existing stale `.next/types/validator.ts` stubs)

## Env vars added in Phase 4

```
# BullMQ — raw Redis protocol, NOT the same as the Upstash REST creds.
# Grab the TCP URL from the Upstash dashboard "Connect" tab; format is
# rediss://default:<password>@<host>:6379
REDIS_URL=
```

The `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env vars stay
for `@upstash/ratelimit` (which uses REST). Both Upstash creds point at
the same Redis database; BullMQ just needs the protocol-level handle.

If `REDIS_URL` is missing at boot the queue subsystem logs a clear
warning and skips starting workers. Server actions that try to enqueue
will throw at the call site — that's intentional, so missing config
fails loud rather than silently dropping jobs.

## Production DB state

All migrations through Phase 3 are applied. Last applied:
`20260510140000_phase3_vipps_capture_stock_reservations` (2026-05-10 16:52 UTC).

The schema is **ahead of `main`** — `main` is still at `487869a` (docs only).
Railway tracks `main`, so production traffic is on pre-Phase-0.5 code while
the DB has the Phase 3 schema. All Phase 2/3 schema additions are nullable or
default-valued, so the running pre-Phase-0.5 code reads the new shape without
issue. Ship the merge train when the next phase milestone lands.

## Open follow-ups (small, tracked)

- **Edit-product page** at `/admin/produkter/[sku]/rediger` is currently
  read-only display, not an editable form. Adding inline category /
  condition / provenance editing requires a new server action and edit
  toggle. Not a 5-line change. Tracked as a future deliverable.
- **Drag-to-reorder** in `/admin/kategorier`. The `reorderCategoriesAction`
  server action exists; the UI uses static order (createdAt).
- **Brand chip row** on `/produkter` is the product's text `brand`
  field, distinct from the `MachineMake` brand filter in the Phase 0.7
  filter bar. Both currently render. Tidy-up follow-up: fold the text
  brand into the filter bar.

## Decisions already made — do not re-litigate

- **CSV `categoryPath` separator:** `/`.
- **CSV `provenance` column:** required on every row, no default
  (Forbrukerkjøpsloven / Markedsføringsloven safety: never overclaim
  by accident).
- **Manual new-product `provenance` default:** AFTERMARKET (lowest
  claim; understating is harmless, overstating is actionable).
- **Provenance terms (Norwegian):** Originaldeler / OEM-deler /
  Uoriginale deler / Aftermarket. Help page at `/info/deletyper`.
  Final wording uses "fabrikken", not "maskinprodusenten".
- **Condition rating labels:** descriptive (Som ny / Utmerket / God /
  Akseptabel / Slitt), shown with a 5-dot scale on the PDP.
- **Saved machine cap per profile:** 20.
- **Filter persistence:** URL only (no per-user persistence beyond
  saved machines).
- **Slugify rules:** Norwegian-friendly (`æ→ae`, `ø→o`, `å→a` plus
  Swedish/German diacritics). 10 unit tests cover edge cases.
- **Hamburger drawer is the canonical category nav.** No permanent
  left sidebar on storefront pages. Reference design: tools.no.
- **Test framework:** Vitest 3.2.4. Coverage via `@vitest/coverage-v8`.
- **Worker hosting (Phase 4):** co-hosted in main process initially;
  split to dedicated Railway service only if memory pressure forces it.

## Decisions made in Phase 2 + 3 + 4 conversations

- **B2B payment paths:** Vipps **or** invoice today. Bank transfer + credit
  card are future expansion (no Phase 3 special-casing required).
- **Phase 2 historical-data policy:** moot — 0 sales in DB at the time of
  refactor, so the snapshot-vs-recompute question evaporated. Deployed as a
  pure pre-launch refactor.
- **Phase 3 grandfathering:** skipped entirely. 0 in-flight AUTHORIZED
  orders to migrate. Capture-on-dispatch is the only behaviour from day one.
- **Phase 3 feature flag:** the plan's `VIPPS_CAPTURE_ON_DISPATCH=true`
  soak-window flag was dropped (no live traffic to soak against). A simpler
  emergency kill-switch (`VIPPS_DISABLE_CAPTURE`) is the recommended
  shape — not yet implemented; add when post-launch operations need it.
- **Decimal library:** plan's `decimal.js-light` was replaced with Prisma 7's
  bundled `decimal.js` directly to avoid a dual-decimal-library bundle.
- **Phase 4 worker hosting (option A — co-host):** workers run inside the
  main Next.js process via `src/instrumentation.ts`. Migrate to a separate
  Railway service (option B) only on memory pressure or HTTP-latency
  regression. See [docs/handoff.md] notes on the swap path — same
  codebase, just a different launcher.

## Decisions still pending — need user sign-off before code

1. **Phase 6 — MFA grace period for existing admins.** Default 7 days.

## Infra state

- **Repo:** GitHub `Dyvikamaskin/Dyvikamaskin-Webshop`. `gh` CLI authenticated as VenturaAI1.
- **Supabase project:** `nxqqmplptalbxmfmbtfs` (Dyvikamaskin Webshop, EU West, ACTIVE_HEALTHY). Modern secret key was rotated 10 May 2026 — new key is `rotation_2026_05` (id `1d5b66a5…`); old `default` secret deleted. Railway env `SUPABASE_SERVICE_ROLE_KEY` holds the new value.
- **Railway:** Project `dyvikamaskin-webshop` (id `3876e777-b1c8-49d4-b414-15a57cb0ed03`). One service `Dyvikamaskin-Webshop` plus a `curl` cron service. Single environment `production`; PR Environments not enabled (paid feature). `railway` CLI authenticated as `admindyvikamaskin@bojoind.com`.
- **Supabase Branching:** Persistent staging branch requires Pro plan ($25/mo). Free tier offers per-PR preview branches only via the paid GitHub Integration. Decision: defer all Supabase staging until Phase 3 integration tests need it; that phase will use testcontainers or a temporary project instead.
- **Sentry:** wired (org `dyvika-maskin`, project `javascript-nextjs`). DSN in env vars.
- **Upstash Redis:** wired and active. Used by rate limiter today; will host BullMQ in Phase 4.

## Permissions / Claude Code setup

- `.claude/settings.json` allowlist: routine browser MCP tools + `Bash(git*)`, `Bash(node*)`, `Bash(npm*)`, `Bash(npx*)`, `Bash(tsx*)`, `Bash(prisma*)`, `PowerShell(*)`. No per-call prompts for these.
- The Chrome in Claude side panel has its own permission system separate from Claude Code's. The persistent allowlist in the extension's LevelDB now includes `*.railway.com`, `*.supabase.com`, `*.github.com`, `*.supabase.co`, `*.up.railway.app`. The per-turn whitelist set by Claude Code's MCP host overrides this for navigations driven from this code session — known limitation.
- Mid-session, several MCP servers showed up that bypass the per-turn whitelist entirely: `fetch` (HTTP), `puppeteer`, `chrome-devtools-mcp`, and `supabase` (full management API minus key rotation). Use these for any browser-side work that the Claude in Chrome bridge blocks.

## How to continue

**Option A — same machine, same Windows account, this Claude Code window already open in Claude Desktop:**
Just keep typing. Full context is already loaded.

**Option B — fresh Claude session (new Anthropic account, or new chat):**
```
cd "C:\Users\Ventura AI\Documents\industriparts"
```
Then either continue this conversation in Claude Desktop, or open a fresh Claude Code session and tell it:
> Read docs/handoff.md and docs/v4.1-implementation-plan.md, then we continue from where we left off.

The project memory file at `~/.claude/projects/C--Users-Ventura-AI/memory/project_industriparts.md` has been updated with phase progress, so any new Claude Code session in this repo automatically loads phase awareness. (Note: project memory is per-Anthropic-account; a different account starts fresh and must read the docs directly.)

## Open follow-ups not in any phase commit

- **Phase 4 follow-ups:**
  - **PDF queue.** Invoice PDF rendering currently runs inside the
    `notifications:invoice-issued` job handler. Splitting it out to
    its own queue lets us cap concurrency separately and add a
    polling endpoint for "is the invoice PDF ready yet?" UX.
  - **Cron migration.** `/api/jobs/expire-reservations` is still a
    REST endpoint hit by Railway's `curl` cron service. BullMQ
    repeating jobs should replace this; once verified, retire the
    Railway curl service.
  - **Invoice 202 + polling.** The plan calls for the invoice route
    to return 202 immediately and expose a status-poll endpoint.
    Today the route is synchronous; deferred until the PDF queue
    above is in place.
  - **Sentry alert wiring** for failed jobs. BullMQ's `failed` event
    logs to console; pipe to Sentry so terminal failures page on-call.
- **Refund flow** (Phase 3 follow-up). The Vipps `REFUNDED` webhook is
  currently logged-only; no Sale lifecycle update, no admin "Refund" UI.
  When refunds become operationally relevant, add `handleRefund` in the
  webhook + an admin action that calls `refundVippsPayment` and marks
  `Sale.status = REFUNDED`.
- **Phase 2 polish** — 9 remaining display-side `.toNumber()` sites in
  admin pages (`/admin/page.tsx`, `/admin/regnskap/page.tsx`,
  `/admin/mva-rapport/page.tsx`), `/betaling/bekreftelse`,
  `invoice-pdf.tsx`, `notification-service.ts`. None affect money
  correctness — formatters now accept Decimal so the redundant
  `.toNumber()` calls can be dropped.
- **Phase 3 integration test** — the plan's "50 parallel checkouts on
  the last unit, zero overcommits" test needs real-DB infra
  (testcontainers or a Supabase preview branch). Deferred until that
  infrastructure exists.
- **Edit-product editable form** at `/admin/produkter/[sku]/rediger`.
- **Drag-to-reorder** in `/admin/kategorier`. Server action exists.
- **Brand chip-row tidy-up** on `/produkter`.

## What to start on next

1. **Phase 4 follow-ups** (small, parallelisable):
   - Add `REDIS_URL` to Railway env (Upstash dashboard → Connect tab)
     so workers actually boot in production. Without it, the warning
     in `[queue]` logs is the loudest signal you'll get.
   - Migrate `expire-reservations` to a BullMQ repeating job, then
     retire the Railway `curl` cron service.
   - Wire `failed` events to Sentry.
2. **Phase 5 — Search (pg_trgm + FTS).** Pure additive on `Product`
   plus a trigger; no decision-making needed before starting.
3. **Open follow-ups** as appetite allows (PDF queue, refund flow,
   Phase 2 polish, edit-product form, drag-to-reorder).

Or, if you want to ship what's already on the stack: merge the Phase
0–4 chain into `main` so Railway picks it up. The schema is already
prod-ready and the code is gated by typecheck + 59 unit tests. Set
`REDIS_URL` on Railway before that deploy or workers won't start.
