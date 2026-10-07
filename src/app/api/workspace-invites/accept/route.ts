import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudAcceptWorkspaceInvite } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) return NextResponse.json({ error: "Invite token is required." }, { status: 400 });
    return NextResponse.json({ membership: await cloudAcceptWorkspaceInvite(token) });
  } catch (error) {
    return cloudErrorResponse(error, "Could not accept workspace invite");
  }
}
