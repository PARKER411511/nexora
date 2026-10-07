import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { cloudCreateReviewInvitation, cloudListReviewInvitations, cloudRevokeReviewInvitation, cloudRevokeReviewSnapshot, cloudSetReviewAccess } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireServerUser(); return NextResponse.json({ invitations: await cloudListReviewInvitations((await params).id) }); }
  catch (error) { return cloudErrorResponse(error, "Could not load review invitations"); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as { action?: unknown; snapshotToken?: unknown; email?: unknown; dueAt?: unknown; invitedOnly?: unknown; inviteId?: unknown };
    const projectId = (await params).id;
    if (body.action === "access") {
      if (typeof body.invitedOnly !== "boolean") return NextResponse.json({ error: "Choose an access mode." }, { status: 400 });
      await cloudSetReviewAccess(projectId, body.invitedOnly);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "revoke") {
      if (typeof body.inviteId !== "string") return NextResponse.json({ error: "Invitation id is required." }, { status: 400 });
      return NextResponse.json({ ok: await cloudRevokeReviewInvitation(body.inviteId) });
    }
    if (body.action === "revokeSnapshot") {
      if (typeof body.snapshotToken !== "string" || !body.snapshotToken.trim()) return NextResponse.json({ error: "Snapshot token is required." }, { status: 400 });
      return NextResponse.json({ ok: await cloudRevokeReviewSnapshot(body.snapshotToken) });
    }
    if (typeof body.snapshotToken !== "string" || typeof body.email !== "string") return NextResponse.json({ error: "Snapshot and reviewer email are required." }, { status: 400 });
    const invite = await cloudCreateReviewInvitation(projectId, body.snapshotToken, body.email, typeof body.dueAt === "string" ? body.dueAt : null);
    return NextResponse.json({ invite, message: "Invitation saved. Email delivery is disabled; copy the review link and send it through your own channel." }, { status: 201 });
  } catch (error) { return cloudErrorResponse(error, "Could not update review access"); }
}
