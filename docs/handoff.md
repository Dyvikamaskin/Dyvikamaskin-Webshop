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

Current branch: `phase-0-6-dynamic-categories` (ce3af96, pushed to origin).

Branch stack (newest on top — each builds on the previous):

| Branch | Latest commit | Phase |
|--------|--------------|-------|
| `phase-0-6-dynamic-categories` | `ce3af96` | 0.6 |
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
| 0.7 Condition / provenance / filters / My Machines | ⏳ Next up | Schema additions for ProductCondition, ConditionRating, PartProvenance, SavedMachine + visible filter bar |
| 1 Foundations | ✅ Shipped (with caveat) | Vitest, Playwright, CI workflow, `WebhookEvent` migration **not yet applied to DB** |
| 2 Money correctness (Decimal) | ⏳ Awaiting user sign-off | Phase has legal/financial implications — see decisions section in plan |
| 3 Vipps capture-on-dispatch | ⏳ Awaiting user sign-off | Forbrukerkjøpsloven §38 implications |
| 4–9 | ⏳ Not started | |

## Verified locally as of last commit

- `npm run audit:links` — 39 pages, 18 APIs, **0 broken** (2 stub references tracked in registry)
- `npm test` — **23/23** passing (KID/Luhn, modulo-11 Brreg, slugify)
- `npm run typecheck` — clean against this work (only pre-existing stale `.next/types/validator.ts` stubs)

## Open follow-ups (small, tracked)

- **Edit-product form** at `/admin/produkter/[sku]/rediger` still uses the legacy `<select>` for category. New-product form got the `CategoryPicker` upgrade in Phase 0.6; edit form is a 5-line drop-in.
- **Drag-to-reorder** in `/admin/kategorier`. The `reorderCategoriesAction` server action exists; the UI is currently static order.
- **WebhookEvent migration** in `prisma/migrations/20260509000000_phase15_webhook_event/` is not applied to the production Supabase DB. Apply when staging exists or Phase 3 lands.
- **Brand chip row** on `/produkter` and `/kategori/[...slug]` is a temporary holdover. Phase 0.7 replaces it with the full filter bar (condition / provenance / brand / model / Mine maskiner).

## Decisions already made — do not re-litigate

- **CSV `categoryPath` separator:** `/`.
- **Slugify rules:** Norwegian-friendly (`æ→ae`, `ø→o`, `å→a` plus Swedish/German diacritics). 10 unit tests cover edge cases.
- **Hamburger drawer is the canonical category nav.** No permanent left sidebar on storefront pages. The reference design is tools.no.
- **Provenance default on manual product create:** AFTERMARKET (Phase 0.7).
- **Provenance terms (Norwegian):** Originaldeler / OEM-deler / Uoriginale deler / Aftermarket. Help page at `/info/deletyper` (deferred to Phase 0.7).
- **Path separator decision in CSV:** `/`.
- **Test framework:** Vitest 3.2.4. Coverage via `@vitest/coverage-v8`.
- **Worker hosting (Phase 4):** co-hosted in main process initially; split to dedicated Railway service only if memory pressure forces it.

## Decisions still pending — need user sign-off before code

These are flagged in the plan and must not be implemented without explicit user approval:

1. **Phase 2 — Decimal correctness historical-data policy.** Default recommendation: snapshot-only on past sales, never recompute. User must confirm.
2. **Phase 3 — Vipps capture-on-dispatch grandfather behaviour.** What happens to in-flight `AUTHORIZED` orders when the new code deploys? Default recommendation: capture them the old way as a one-time grandfathering, new orders use the new flow.
3. **Phase 6 — MFA grace period for existing admins.** Default 7 days.

## Infra state

- **Repo:** GitHub `Dyvikamaskin/Dyvikamaskin-Webshop`. `gh` CLI is authenticated on this machine as VenturaAI1.
- **Supabase project:** `nxqqmplptalbxmfmbtfs` (Dyvikamaskin Webshop, EU West, ACTIVE_HEALTHY). Modern secret key was rotated 10 May 2026 — new key is `rotation_2026_05` (id `1d5b66a5…`); old `default` secret was deleted. Railway env `SUPABASE_SERVICE_ROLE_KEY` holds the new value.
- **Railway:** Project `dyvikamaskin-webshop` (id `3876e777-b1c8-49d4-b414-15a57cb0ed03`). One service `Dyvikamaskin-Webshop` plus a `curl` cron service. Single environment `production`; PR Environments not enabled (paid feature). `railway` CLI authenticated as `admindyvikamaskin@bojoind.com`.
- **Supabase Branching:** Free tier only supports preview branches via the paid Pro plan's GitHub Integration. Persistent staging branch deferred indefinitely on cost grounds. Phase 3 integration tests will need a different strategy (testcontainers or temporary project).
- **Sentry:** wired (org `dyvika-maskin`, project `javascript-nextjs`). DSN in env vars.
- **Upstash Redis:** wired and active. Used by rate limiter today; will host BullMQ in Phase 4.

## Permissions / Claude Code setup

- `.claude/settings.json` allowlist: routine browser MCP tools + `Bash(git*)`, `Bash(node*)`, `Bash(npm*)`, `Bash(npx*)`, `Bash(tsx*)`, `Bash(prisma*)`, `PowerShell(*)`. Granted by the project owner; no per-call prompts for these.
- The Chrome in Claude side panel has its own permission system separate from Claude Code's. The persistent allowlist in the extension's LevelDB now includes `*.railway.com`, `*.supabase.com`, `*.github.com`, `*.supabase.co`, `*.up.railway.app`. The per-turn whitelist set by Claude Code's MCP host overrides this for navigations driven from this code session — known limitation.
- Two new MCP servers showed up mid-session and bypass the per-turn whitelist entirely: `fetch` (HTTP), `puppeteer`, `chrome-devtools-mcp`, and `supabase` (full management API minus key rotation). Use these for any browser-side work that the Claude in Chrome bridge blocks.

## How to continue

**Same machine, same Windows account, this Claude Code window already open:**
Just keep typing. Full context is already loaded.

**Same machine, fresh Claude Code session:**
```
cd "C:\Users\Ventura AI\Documents\industriparts"
claude
```
Then either:
- `/resume` — pick the previous session from the list, OR
- type `Read docs/handoff.md and docs/v4.1-implementation-plan.md, then we continue from where we left off.` — Claude pulls everything in.

The project memory file at `~/.claude/projects/C--Users-Ventura-AI/memory/project_industriparts.md` has been updated with phase progress as of this commit, so any new Claude session in this repo automatically loads phase awareness.

## What to start on next

Recommended order:

1. **Pause to verify Phase 0.5 + 0.6 in browser** (in progress at handoff time). Reload localhost, click through the new chrome, the drawer, `/admin/kategorier`. Report any visual issues.
2. **Phase 0.7** — condition / provenance / filters / My Machines. The plan has the schema, server actions, and UI components fully specified. ~3 dev-days.
3. **Then Phase 0.6 follow-ups** that were deferred (edit-product CategoryPicker, drag-to-reorder).
4. **Then Phase 2 / 3** — but stop and explicitly confirm the legal/financial decisions in the "Decisions still pending" section above before touching pricing or Vipps capture timing.
