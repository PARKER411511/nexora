import { NextResponse } from "next/server";
import { validateProjectInput } from "@/lib/validation";
import { sameOriginError } from "@/lib/origin";
import { cloudGetProject, cloudUpdateProject } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireServerUser();
    const project = await cloudGetProject((await params).id);
    return project
      ? NextResponse.json({ project })
      : NextResponse.json({ error: "Project not found" }, { status: 404 });
  } catch (e) {
    return cloudErrorResponse(e, "Could not load project");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const input = validateProjectInput(await request.json());
    return NextResponse.json({
      project: await cloudUpdateProject((await params).id, input),
    });
  } catch (error) {
    return cloudErrorResponse(error, "Could not update project");
  }
}
