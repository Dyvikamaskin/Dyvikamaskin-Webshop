"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign the current user out and send them to the home page.
 *
 * Triggered from a <form action={logoutAction}> in the header. Form POST is
 * the right transport for logout because it is a state-changing action and
 * GET-based logout is vulnerable to prefetch and CSRF. See Phase 0 D0.2 in
 * docs/v4.1-implementation-plan.md.
 */
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Belt-and-braces: explicitly expire any sb-* cookies the SDK may have left
  // behind. supabase.auth.signOut() should handle this, but the explicit
  // delete makes the post-condition independent of SDK internals.
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-")) {
      cookieStore.delete(name);
    }
  }

  redirect("/");
}
