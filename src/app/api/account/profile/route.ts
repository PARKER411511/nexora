import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { validateProfileInput } from "@/lib/validation";
import {
  cloudGetProfile,
  cloudUpdateProfile,
} from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireServerUser();
    return NextResponse.json({ email: user.email ?? "", profile: await cloudGetProfile() });
  } catch (reason) {
    return cloudErrorResponse(reason, "Could not load profile");
  }
}

export async function PATCH(request: Request) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("Profile data is malformed.");
    const profile = validateProfileInput(input as Record<string, unknown>);
    return NextResponse.json({ profile: await cloudUpdateProfile(profile) });
  } catch (reason) {
    return cloudErrorResponse(reason, "Could not save profile");
  }
}
