import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudAllowRequest, cloudInviteWorkspaceMember } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    if (!(await cloudAllowRequest("account_action")))
      return NextResponse.json({ error: "Invitations are temporarily rate limited. Try again shortly." }, { status: 429 });
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const role = body.role === "admin" || body.role === "editor" || body.role === "viewer" ? body.role : "viewer";
    const invite = await cloudInviteWorkspaceMember((await params).id, email, role);
    const url = new URL(request.url);
    const token = invite.token;
    return NextResponse.json({
      invite: { ...invite, token: undefined },
      url: token ? `${url.origin}/workspace-invites/accept?token=${encodeURIComponent(token)}` : undefined,
      emailDelivery: "undelivered",
      message: "Email delivery is disabled. Copy this link and send it through your own channel.",
    }, { status: 201 });
  } catch (error) {
    return cloudErrorResponse(error, "Could not create workspace invite");
  }
}
