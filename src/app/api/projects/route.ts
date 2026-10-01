import { NextResponse } from "next/server";
import { analyzeBrief, makeDefaultScope } from "@/lib/analyzer";
import { createProject, listProjects } from "@/lib/db";
import { validateProjectInput } from "@/lib/validation";
import type { BriefAnalysis } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() { return NextResponse.json({ projects: listProjects() }); }

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const brief = typeof body.brief === "string" ? body.brief : "";
    const analysis = body.analysis ? body.analysis as BriefAnalysis : analyzeBrief(brief);
    const input = validateProjectInput({ ...body, analysis, scope: makeDefaultScope(analysis) });
    return NextResponse.json({ project: createProject(input) }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create project" }, { status: 400 }); }
}
