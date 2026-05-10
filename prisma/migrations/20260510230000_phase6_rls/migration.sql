-- Phase 6 — Row Level Security as defence-in-depth
--
-- Enables RLS on every public-schema table and attaches a single
-- permissive policy that grants ALL operations to `service_role`. App
-- queries via Prisma run as service_role (Supabase's standard backend
-- role) so behavior is identical to today.
--
-- Why this is defence-in-depth: service_role has the BYPASSRLS
-- attribute, so even without policies queries would still work. But:
--   * If BYPASSRLS were ever revoked (Supabase platform change, role
--     re-creation), the explicit policy keeps the app running.
--   * Other roles (`authenticated`, `anon` — used briefly by the
--     SSR Supabase client for getUser()) get NO policy attached, which
--     means they see zero rows. The Supabase Auth client cannot
--     accidentally read app data even if a JWT is compromised.
--
-- Prisma's `_prisma_migrations` table is excluded — it's managed by
-- Prisma migrate itself and enabling RLS on it has caused issues with
-- migration-state lookups in other projects.

DO $$
DECLARE
    r RECORD;
    policy_name TEXT;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
        ORDER BY tablename
    LOOP
        -- Enable RLS (idempotent — no-op if already enabled)
        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
            r.tablename
        );

        -- Drop any prior policy with our naming convention so the
        -- migration is rerunnable. Real schema changes never alter the
        -- policy shape; this is for safety during dev iteration.
        policy_name := r.tablename || '_service_role_all';
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            policy_name, r.tablename
        );

        -- Permissive policy: service_role can do anything. Other roles
        -- get no policy attached, so they see nothing.
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
            policy_name, r.tablename
        );
    END LOOP;
END $$;
