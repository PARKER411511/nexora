import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (!code)
    return NextResponse.redirect(
      new URL(
        `/auth/sign-in?error=missing_code&next=${encodeURIComponent(next)}`,
        url,
      ),
    );
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return NextResponse.redirect(new URL(next, url));
  } catch {
    return NextResponse.redirect(
      new URL(
        `/auth/sign-in?error=confirmation_failed&next=${encodeURIComponent(next)}`,
        url,
      ),
    );
  }
}
