import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { isDemoMode } from "@/lib/mode";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    if (isDemoMode())
      return NextResponse.json(
        { error: "The browser demo creates same-browser review links." },
        { status: 409 },
      );
    const { getProject, shareProject } = await import("@/lib/db");
    const { id } = await params;
    const project = getProject(id);
    if (!project)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const shared = shareProject(id);
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      project: shared,
      url: `${origin}/review/${shared.reviewToken}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not share project",
      },
      { status: 400 },
    );
  }
}
