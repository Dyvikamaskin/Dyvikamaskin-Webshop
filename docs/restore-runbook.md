# Restore runbook — encrypted backup recovery

This runbook describes how to decrypt and restore a backup produced by
the Phase 4.5 backup MVP (`/admin/backup/download`). It assumes the
backup is in the format `industriparts-backup-YYYY-MM-DD.sql.age` and
that the matching age private key (saved at setup time) is available.

## Prerequisites

- The encrypted backup file (`*.sql.age`).
- The matching age private key string (`AGE-SECRET-KEY-1…`), as saved
  during `/admin/backup/setup`.
- A Postgres client (`psql`) and `age` (CLI) on a workstation with
  access to the target database.
- The `prisma/migrations/` folder from the same git commit that
  produced the backup (the dump contains data only — schema lives in
  migrations).

Install `age` if missing:

```bash
# macOS
brew install age

# Linux (Debian/Ubuntu)
sudo apt-get install age

# Or via Go
go install filippo.io/age/cmd/...@latest
```

## Decrypt

```bash
# Put the private key into a file (NOT in shell history).
# Either re-download from your offline storage or save the contents:
echo 'AGE-SECRET-KEY-1...your...key...' > /tmp/backup-key.txt
chmod 600 /tmp/backup-key.txt

age --decrypt -i /tmp/backup-key.txt \
    -o industriparts-backup.sql \
    industriparts-backup-2026-05-10.sql.age

# Verify the file is plain SQL:
head -5 industriparts-backup.sql
# Expected: starts with `-- IndustriParts backup`

# Once verified, securely delete the key file:
shred -u /tmp/backup-key.txt    # or `rm -P` on macOS
```

## Restore

The dump contains data only. The target database must already have the
schema migrated to a state matching the dump.

### 1. Provision the target database

For a clean rebuild on Supabase:

1. Pause the existing project or provision a fresh Postgres instance.
2. Make sure `DATABASE_URL` points at the target.
3. Run `npx prisma migrate deploy` from the project root — applies the
   schema including extensions (`pg_trgm`) and triggers
   (`product_search_refresh_trigger`).

### 2. Load the data

```bash
psql -f industriparts-backup.sql "$DATABASE_URL"
```

The dump opens with:

```sql
BEGIN;
SET session_replication_role = replica;
```

…which disables foreign-key enforcement during the load (so insertion
order doesn't matter). It commits at the end with
`SET session_replication_role = origin; COMMIT;`. If anything fails,
the transaction rolls back and the database is left untouched.

### 3. Verify

```bash
psql "$DATABASE_URL" -c '
  SELECT
    (SELECT COUNT(*) FROM "Profile") AS profiles,
    (SELECT COUNT(*) FROM "Product") AS products,
    (SELECT COUNT(*) FROM "Sale") AS sales,
    (SELECT MAX("createdAt") FROM "AuditLog") AS last_audit;
'
```

Cross-check those counts against the dashboard the dump was taken from.

## Rotating the private key

If the private key is compromised:

1. Visit `/admin/backup/setup` while logged in as SUPER_ADMIN.
2. Click "Generer ny nøkkel (rotering)" — generates a new keypair.
3. Save the new private key offline.
4. The old key still decrypts older backups; you can keep them for
   record-keeping or destroy them. New backups encrypt to the new key
   only.

## What the backup includes / excludes

| Included | Excluded |
|---|---|
| All rows in every table listed in `BACKED_UP_TABLES` (see `src/lib/backup/dump.ts`) | Schema (DDL) — lives in `prisma/migrations/` |
| The `_prisma_migrations` table — pins the dump to a specific schema state | Authentication state in Supabase Auth (`auth.*` schema) |
| Reference data (categories, machines, customers, products) | Storage objects (Supabase Storage buckets) |
| Transactional data (sales, audit logs, reservations) | Anything outside the `public` schema |

For a complete disaster-recovery story (Auth + Storage), use Supabase's
own backup tooling in addition to this dump. Phase 4.5 covers the
relational data only.
