@AGENTS.md

# Database architecture

This project has **two separate Supabase accounts and three database targets**. Never confuse them.

## 1 — Main app DB (Dyvikamaskin Webshop)
- **Supabase org:** Dyvikamaskin (`bqkwprurxexiayvxrnyy`)
- **Project:** `nxqqmplptalbxmfmbtfs` — eu-west-1
- **Prisma schema:** `prisma/schema.prisma`
- **Prisma config:** `prisma.config.ts` (root)
- **Generated client:** `src/app/generated/prisma/client`
- **App singleton:** `src/lib/prisma.ts`
- **Env vars:** `DATABASE_URL`, `DIRECT_URL`
- **CLI commands:** `npm run db:generate` / `db:push` / `db:migrate` / `db:studio`
- **MCP:** `supabase` plugin (OAuth, Dyvikamaskin account)

## 2 — OEM catalog DB
- **Supabase org:** BojoIndAI1 (`jjtdehrjbvjbmjizfbbx`) — separate account/login
- **Project:** `rtzcrngduscrhgozrojv` — eu-west-3 — "OEM Parts Project"
- **Prisma schema:** `prisma/oem/schema.prisma`
- **Prisma config:** `prisma/oem/prisma.config.ts`
- **Generated client:** `src/app/generated/oem-prisma/client`
- **App singleton:** `src/lib/oem-db.ts`
- **Env vars:** `OEM_DATABASE_URL`, `OEM_DIRECT_URL`
- **CLI commands:** `npm run oem:generate` / `oem:push` / `oem:migrate` / `oem:studio`
- **MCP:** `supabase-oem` (stdio, PAT from BojoIndAI1 account) — use `mcp__supabase-oem__execute_sql`

## 3 — Local PostgreSQL 18 (dev/BOM walk)
- **Host:** `localhost:5432`, database `oem_catalog`
- **Credentials:** `postgres` / `postgres`
- **Purpose:** BOM walk ingest + local exploration before pushing to OEM Supabase
- **Active when:** `.env.local` has `OEM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oem_catalog`
- **Switch to Supabase:** remove or comment out the two OEM lines in `.env.local`

## Env loading for scripts
Scripts use dotenv with two-step load — `.env` first, `.env.local` overrides:
```ts
import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
```
Next.js does this automatically. All `npx tsx scripts/...` must include these two lines.

---

# Working with this user

**Keep the prompt responsive.** For any command/script expected to take longer than ~30 seconds (multi-page scrapes, DB seeds, PDF extractions, sitemap walks, etc.), default to background execution (`run_in_background: true` on Bash, or a subagent for self-contained research). Don't block the conversation waiting for output the user could be redirecting in the meantime. Acknowledge the kick-off in 1-2 lines, then yield back. The user can ask "status?" when they want progress.

**Don't fragment the backlog.** Task chips and subagents are for genuine async hand-offs and parallelisable independent work — not for items already on the active plan that the user is driving continuously. The plan doc is the canonical backlog.
