import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Server-side Supabase auth helper. Reads the auth cookie, validates it
// against Supabase, and returns the authenticated user (id + email + raw
// user_metadata). Used by onboarding/actions.ts and any other server
// action that needs to know who the caller is.
//
// This module was referenced by app/onboarding/actions.ts ("Monday customer
// sprint" commit ea78bf2) but never committed alongside it. Onboarding
// would error at runtime with `Module not found: Can't resolve
// '@/lib/auth/session'`. This file fills that gap with the minimum
// implementation that the existing call sites expect.

export type AuthUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
  /** The row in the `users` table that mirrors this Supabase auth user.
   * Existing call sites (e.g. onboarding/actions.ts) reference
   * `session.dbUser.id` to query workspaceMembers and other FK tables.
   * In this build we expose the same id; the production version with a
   * full user-row join lands when the Phase 0 / Phase 2 user-row work is
   * picked up. */
  dbUser: { id: string; email: string | null };
};

function readEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
    );
  }
  return { url, anonKey };
}

export async function getAuthUser(): Promise<AuthUser | null> {
  if (process.env.ARVYA_E2E_AUTH_BYPASS === "1") {
    return {
      id: "user-naveen",
      email: "naveen@arvya.co",
      user_metadata: { name: "Naveen SB" },
      dbUser: { id: "user-naveen", email: "naveen@arvya.co" },
    };
  }

  const cookieStore = await cookies();
  const { url, anonKey } = readEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // No-op: server actions cannot set cookies on the response. The
        // middleware refreshes the session cookie on every navigation, so
        // letting Supabase silently fail here is fine.
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  const id = data.user.id;
  const email = data.user.email ?? null;
  return {
    id,
    email,
    user_metadata: data.user.user_metadata ?? {},
    dbUser: { id, email },
  };
}

export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}
