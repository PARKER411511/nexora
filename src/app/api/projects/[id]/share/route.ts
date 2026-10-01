import { NextResponse } from "next/server";
import { getProject, shareProject } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const project = getProject(id); if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const shared = shareProject(id); const origin = new URL(request.url).origin;
    return NextResponse.json({ project: shared, url: `${origin}/review/${shared.reviewToken}` });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not share project" }, { status: 400 }); }
}
