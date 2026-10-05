import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/supabase/auth";

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  if (
    (pathname.startsWith("/workspace") ||
      pathname.startsWith("/review/") ||
      pathname.startsWith("/admin")) &&
    !data?.claims?.sub
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set(
      "next",
      safeNextPath(`${pathname}${request.nextUrl.search}`),
    );
    const redirect = NextResponse.redirect(url);
    response.cookies
      .getAll()
      .forEach((cookie) => redirect.cookies.set(cookie.name, cookie.value));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: [
    "/workspace/:path*",
    "/review/:path*",
    "/admin/:path*",
    "/auth/callback",
    "/auth/sign-out",
  ],
};
