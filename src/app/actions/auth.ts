"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { consumeLoginAttempt } from "@/lib/ratelimit";

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

// ─── Login server action (Phase 6) ───────────────────────────────────────────

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Sign in with email + password. Wraps `supabase.auth.signInWithPassword`
 * on the server so we can apply a per-email rate limit (5 / 15 min) BEFORE
 * the credentials hit Supabase Auth. Returns a discriminated-union result
 * so the client form can show a Norwegian error without a round-trip
 * through Supabase's English messages.
 *
 * On success the Supabase SSR client writes session cookies via the
 * cookies() API; the caller then hard-navigates so the next request
 * arrives with the cookie set.
 */
export async function loginAction(
  rawEmail: string,
  password: string,
): Promise<LoginResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, error: "E-post og passord er påkrevd." };
  }

  const gate = await consumeLoginAttempt(email);
  if (!gate.ok) {
    return {
      ok: false,
      error: `For mange forsøk. Vent ${Math.ceil(gate.retryAfterSeconds / 60)} minutt(er) og prøv igjen.`,
      retryAfterSeconds: gate.retryAfterSeconds,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
      return { ok: false, error: "Feil e-post eller passord." };
    }
    if (msg.includes("email not confirmed")) {
      return { ok: false, error: "Du må bekrefte e-postadressen din. Sjekk innboksen din." };
    }
    if (msg.includes("too many requests")) {
      return { ok: false, error: "For mange forsøk. Vent litt og prøv igjen." };
    }
    return { ok: false, error: "Innlogging feilet. Prøv igjen." };
  }

  return { ok: true };
}
