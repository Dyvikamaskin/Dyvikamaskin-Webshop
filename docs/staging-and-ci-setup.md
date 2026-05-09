# Staging and CI setup

Phase 1 (Sprint 0) of [v4.1-implementation-plan.md](v4.1-implementation-plan.md)
calls for a real staging environment plus CI that blocks merge on red.
The repo work is committed; the steps below are the **manual one-time
setup** that requires authenticating against external services.

## Prerequisites

You will need owner/admin access to:
- The GitHub repository `Dyvikamaskin/Dyvikamaskin-Webshop`
- The Supabase project "Dyvikamaskin Webshop"
- The Railway project hosting the production deploy

## 1. GitHub repository secrets

Go to the repo → Settings → Secrets and variables → Actions → New
repository secret. Add the following five secrets so the
`e2e-link-integrity` job can boot a build of the app against a staging DB.

| Secret name | Value | Source |
|---|---|---|
| `DATABASE_URL_STAGING` | Pooled Postgres connection string | Supabase staging branch → Project Settings → Database → Connection pooling |
| `DIRECT_URL_STAGING` | Direct Postgres connection string | Supabase staging branch → Project Settings → Database → Connection string |
| `SUPABASE_URL_STAGING` | `https://<staging-ref>.supabase.co` | Supabase staging branch → Project Settings → API |
| `SUPABASE_ANON_KEY_STAGING` | `sb_publishable_…` | Supabase staging branch → Project Settings → API |

If these are missing, the `e2e-link-integrity` job is skipped (the
condition in `ci.yml` checks `secrets.DATABASE_URL_STAGING` indirectly via
the build step). The `typecheck-and-unit` job runs unconditionally and is
sufficient as a merge gate until staging is up.

## 2. Supabase branching

Supabase free tier includes branching. Each pull request can get its own
copy of the database for safe schema testing.

**One-time setup:**

1. Install the Supabase CLI on your machine:
   ```powershell
   npm install -g supabase
   supabase login
   ```
2. Link the local repo to the Supabase project:
   ```powershell
   supabase link --project-ref <your-project-ref>
   ```
3. Enable Git integration in the Supabase Dashboard:
   - Project → Settings → Branching → Connect to GitHub
   - Pick the `Dyvikamaskin/Dyvikamaskin-Webshop` repo
   - Choose `main` as the production branch
   - Confirm the migrations directory: `prisma/migrations`
4. Create a long-lived `staging` branch in the dashboard (Branches →
   Create branch → from `main`). This branch's connection details fill
   the GitHub secrets in §1.

**Per-PR behaviour after setup:**
- Opening a PR against `main` automatically creates a Supabase preview
  branch with the migrations from that PR applied.
- The preview branch is destroyed when the PR is closed.
- Migrations on `main` are applied to the production database
  automatically by Supabase's GitHub integration.

## 3. Railway preview environments

Railway can spin up a per-PR deploy of the Next.js app, pointing at the
matching Supabase preview branch.

**One-time setup:**

1. In the Railway dashboard for the project, open Settings → Environments.
2. Enable "PR Environments" — Railway will create a deploy per PR.
3. For the PR environment template, override these variables to use the
   preview Supabase branch credentials. The Supabase GitHub integration
   exposes them as `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_DB_URL_POOLED`, and `SUPABASE_DB_URL`. Map them in Railway:
   - `DATABASE_URL` ← `SUPABASE_DB_URL_POOLED`
   - `DIRECT_URL` ← `SUPABASE_DB_URL`
   - `NEXT_PUBLIC_SUPABASE_URL` ← `SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← `SUPABASE_ANON_KEY`
4. Confirm that `NEXT_PUBLIC_APP_URL` resolves to the Railway preview URL
   (Railway sets `RAILWAY_PUBLIC_DOMAIN` automatically — point
   `NEXT_PUBLIC_APP_URL` at `https://${RAILWAY_PUBLIC_DOMAIN}`).

After this, every PR gets a unique URL on Railway, backed by its own
Supabase branch DB. Vipps/MyBring/etc. stay in test mode for these
previews — copy the test credentials from the production Railway env.

## 4. Verification

When the above is complete:

1. Open a small PR (e.g. README typo fix).
2. Check the Actions tab — `typecheck-and-unit` runs and passes; once
   secrets exist, `e2e-link-integrity` runs against a build of the PR.
3. Check the Supabase dashboard — a preview branch named after the PR
   appears.
4. Check Railway — a PR environment URL is posted as a check on the PR.
5. Click the Railway URL — the app loads, /admin works, /konto loads
   when signed in.

## 5. What still requires manual approval

Even after this setup, the following still requires a human in the loop:

- **Merging a PR to `main`.** Auto-deploy is on, so a merge ships to
  production. Branch protection should require:
  - At least one approving review.
  - All status checks (`typecheck-and-unit`, `e2e-link-integrity`)
    passing.
  - Conversations resolved.
- **Schema migrations to production.** Supabase applies them when the
  PR merges; preview the SQL diff in the Supabase dashboard first.
- **Vipps production credentials and DNS cutover.** Out of scope for
  v4.1; tracked under §29 of the spec.
