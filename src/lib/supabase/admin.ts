/**
 * Service-role Supabase client — server-only.
 *
 * Use ONLY for trusted background work that needs Storage / Admin
 * access without a user session: scheduled backups, cleanup jobs,
 * cross-tenant admin scripts. Never import from a client component or
 * a route that can be reached without role-gating — the service role
 * bypasses RLS.
 *
 * Lazy-created so importing this module from a context without the
 * env var (vitest, edge runtime) doesn't throw at module load.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client unavailable: " +
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
