# Session handoff — IndustriParts v4.1 work

**As of 10 May 2026.** This page captures the live state of the v4.1 upgrade
work so a new developer (or a fresh Claude Code session) can pick it up
without reading the full chat transcript.

For deep context read these in order:
1. **This file** — current state, decisions, what's next.
2. [`v4.1-implementation-plan.md`](v4.1-implementation-plan.md) — master plan, phase definitions, decisions register, risk register.
3. [`route-stub-registry.md`](route-stub-registry.md) — every route referenced from the new chrome that does not yet have a page.
4. [`industriparts-spec-v4.docx`](industriparts-spec-v4.docx) — system specification (v4.1).

## Where the code is

Current branch: `phase-0-7-condition-provenance-filters` (`f487372`, pushed to origin).

Branch stack (newest on top — each builds on the previous):

| Branch | Latest commit | Phase |
|--------|--------------|-------|
| `phase-0-7-condition-provenance-filters` | `f487372` | 0.7 |
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
| 0.7 Condition / provenance / filters / My Machines | ✅ Shipped | Schema additions, admin form fields, visible filter bar on listings, `/info/deletyper`, `/konto/mine-maskiner`, condition + provenance badges on PDP |
| 1 Foundations | ✅ Shipped (with caveat) | Vitest, Playwright, CI workflow. **Two Prisma migrations queued, NOT yet applied to DB** — see "Pending migrations" below |
| 2 Money correctness (Decimal) | ⏳ Awaiting user sign-off | Phase has legal/financial implications — see decisions section in plan |
| 3 Vipps capture-on-dispatch | ⏳ Awaiting user sign-off | Forbrukerkjøpsloven §38 implications |
| 4–9 | ⏳ Not started | |

## Verified locally as of last commit

- `npm run audit:links` — 41 pages, 18 APIs, **0 broken** (2 stub references tracked in registry)
- `npm test` — **23/23** passing (KID/Luhn, modulo-11 Brreg, slugify)
- `npm run typecheck` — clean against this work (only pre-existing stale `.next/types/validator.ts` stubs)

## Pending Prisma migrations (not applied)

Two migrations are committed in `prisma/migrations/` but **have not been
applied to the production Supabase database yet**:

1. `20260509000000_phase15_webhook_event` — adds `WebhookEvent` table
   for inbound webhook idempotency. Required before the Vipps webhook
   handler runs in production (it now references `prisma.webhookEvent`).
2. `20260510120000_phase07_condition_provenance_savedmachine` — adds
   `condition`, `conditionRating`, `conditionNotes`, `provenance`
   columns to `Product` plus the `SavedMachine` table. The Phase 0.7
   storefront filter and product detail page query these columns; the
   app will throw at runtime against an old DB.

**Both migrations are additive** (new columns with defaults, new
table). Safe to run on a live DB with existing rows.

To apply when ready to deploy:
```
npx prisma migrate deploy
```
Or, via the Supabase MCP: `mcp__supabase__apply_migration` for each
migration.

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

## Decisions still pending — need user sign-off before code

These are flagged in the plan and must not be implemented without explicit user approval:

1. **Phase 2 — Decimal correctness historical-data policy.** Default
   recommendation: snapshot-only on past sales, never recompute. User
   must confirm.
2. **Phase 3 — Vipps capture-on-dispatch grandfather behaviour.** What
   happens to in-flight `AUTHORIZED` orders when the new code deploys?
   Default: capture them the old way as a one-time grandfathering, new
   orders use the new flow.
3. **Phase 6 — MFA grace period for existing admins.** Default 7 days.

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

## What to start on next

Recommended order for the new developer:

1. **Apply the two pending Prisma migrations** to the production Supabase DB (or first to a separate dev DB if available):
   ```
   npx prisma migrate deploy
   ```
   The Phase 0.5 + 0.6 + 0.7 storefront code currently does not run against the live DB until both migrations are applied. The migrations are additive and safe.
2. **Verify Phase 0.5 + 0.6 + 0.7 in browser.** Reload localhost, walk through the new chrome, drawer, /admin/kategorier, /admin/produkter/ny (new condition + provenance fields), /produkter (filter bar), /info/deletyper, /konto/mine-maskiner.
3. **Address open follow-ups** if appetite (drag-to-reorder, edit-product editable form, brand chip-row tidy-up).
4. **Phase 2 / 3** — but stop and explicitly confirm the legal/financial decisions in the "Decisions still pending" section above before touching pricing or Vipps capture timing.
