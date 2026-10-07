import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { cloudListWorkspaceMembers, cloudRemoveWorkspaceMember, cloudSetWorkspaceMemberRole, cloudTransferWorkspaceOwnership } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireServerUser(); return NextResponse.json({ members: await cloudListWorkspaceMembers((await params).id) }); }
  catch (error) { return cloudErrorResponse(error, "Could not load workspace members"); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as { userId?: unknown; role?: unknown; transferOwnership?: unknown };
    const workspaceId = (await params).id;
    if (typeof body.userId !== "string") return NextResponse.json({ error: "Member id is required." }, { status: 400 });
    if (body.transferOwnership === true) await cloudTransferWorkspaceOwnership(workspaceId, body.userId);
    else if (body.role === "admin" || body.role === "editor" || body.role === "viewer") await cloudSetWorkspaceMemberRole(workspaceId, body.userId, body.role);
    else return NextResponse.json({ error: "Choose a member role or transfer ownership." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) { return cloudErrorResponse(error, "Could not update workspace member"); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as { userId?: unknown };
    if (typeof body.userId !== "string") return NextResponse.json({ error: "Member id is required." }, { status: 400 });
    return NextResponse.json({ ok: await cloudRemoveWorkspaceMember((await params).id, body.userId) });
  } catch (error) { return cloudErrorResponse(error, "Could not remove workspace member"); }
}
