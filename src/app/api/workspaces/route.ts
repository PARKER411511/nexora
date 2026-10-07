import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudCreateWorkspace, cloudListWorkspaces } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireServerUser();
    return NextResponse.json({ workspaces: await cloudListWorkspaces() });
  } catch (error) {
    return cloudErrorResponse(error, "Could not load workspaces");
  }
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120)
      return NextResponse.json({ error: "Add a workspace name up to 120 characters." }, { status: 400 });
    return NextResponse.json({ workspace: await cloudCreateWorkspace(name) }, { status: 201 });
  } catch (error) {
    return cloudErrorResponse(error, "Could not create workspace");
  }
}
