import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client — use in Client Components only.
 * For Server Components / Route Handlers / Actions, use createServerClient().
 */
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
