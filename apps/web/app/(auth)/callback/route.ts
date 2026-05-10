import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getOrigin(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";
  const origin = getOrigin(request);

  if (!code) {
    const errorDesc = searchParams.get("error_description") || searchParams.get("error") || "no_code";
    console.error("[auth/callback] No code received:", errorDesc);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", errorDesc);
    return NextResponse.redirect(loginUrl);
  }

  const redirectUrl = new URL(next, origin);
  let response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
