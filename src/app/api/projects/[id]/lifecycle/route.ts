import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudArchiveProject, cloudDeleteProject, cloudDuplicateProject } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    const id = (await params).id;
    if (action === "archive" || action === "restore")
      return NextResponse.json({ project: await cloudArchiveProject(id, action === "archive") });
    if (action === "duplicate") {
      const title = typeof body.title === "string" ? body.title.trim() : undefined;
      return NextResponse.json({ project: await cloudDuplicateProject(id, title) }, { status: 201 });
    }
    if (action === "delete") {
      const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
      await cloudDeleteProject(id, confirmation);
      return NextResponse.json({ deleted: true });
    }
    return NextResponse.json({ error: "Unsupported lifecycle action." }, { status: 400 });
  } catch (error) {
    return cloudErrorResponse(error, "Could not update project lifecycle");
  }
}
