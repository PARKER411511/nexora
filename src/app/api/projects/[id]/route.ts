import { NextResponse } from "next/server";
import { validateProjectInput } from "@/lib/validation";
import { sameOriginError } from "@/lib/origin";
import { isDemoMode } from "@/lib/mode";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode())
    return NextResponse.json(
      { error: "The browser demo reads projects from this browser." },
      { status: 409 },
    );
  const { getProject } = await import("@/lib/db");
  const { id } = await params;
  const project = getProject(id);
  return project
    ? NextResponse.json({ project })
    : NextResponse.json({ error: "Project not found" }, { status: 404 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    if (isDemoMode())
      return NextResponse.json(
        { error: "The browser demo saves projects in this browser." },
        { status: 409 },
      );
    const { getProject, updateProject } = await import("@/lib/db");
    const { id } = await params;
    const input = validateProjectInput(await request.json());
    return NextResponse.json({ project: updateProject(id, input) });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "Project not found"
        ? 404
        : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update project",
      },
      { status },
    );
  }
}
