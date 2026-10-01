import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";
import { validateProjectInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const project = getProject(id); return project ? NextResponse.json({ project }) : NextResponse.json({ error: "Project not found" }, { status: 404 }); }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const input = validateProjectInput(await request.json()); return NextResponse.json({ project: updateProject(id, input) }); }
  catch (error) { const status = error instanceof Error && error.message === "Project not found" ? 404 : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update project" }, { status }); }
}
