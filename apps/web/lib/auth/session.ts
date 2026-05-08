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
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    user_metadata: data.user.user_metadata ?? {},
  };
}

export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}
