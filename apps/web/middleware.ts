import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_API_PATHS = [
  "/api/health",
  "/api/inngest",
  "/api/connectors/slack/auth/callback",
  "/api/connectors/slack/events",
  "/api/connectors/google/auth/callback",
  "/api/connectors/gmail/auth/callback",
  "/api/connectors/google-drive/auth/callback",
];

function getOrigin(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  if (pathname === "/callback") {
    return response;
  }

  const authHeader = request.headers.get("authorization");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    serviceRoleKey &&
    authHeader === `Bearer ${serviceRoleKey}` &&
    pathname.startsWith("/api/")
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected =
    (pathname.startsWith("/brains") ||
      pathname.startsWith("/onboarding") ||
      (pathname.startsWith("/api/") &&
        !PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))));

  if (!user && isProtected) {
    const origin = getOrigin(request);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/onboarding", getOrigin(request)));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
