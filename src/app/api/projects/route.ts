import { NextResponse } from "next/server";
import { analyzeBrief, makeDefaultScope } from "@/lib/analyzer";
import { createProject, listProjects } from "@/lib/db";
import { isValidBriefAnalysis, validateProjectInput } from "@/lib/validation";
import type { BriefAnalysis } from "@/lib/types";
import { sameOriginError } from "@/lib/origin";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const brief = typeof body.brief === "string" ? body.brief : "";
    const analysisCandidate: unknown = body.analysis ?? analyzeBrief(brief);
    if (!isValidBriefAnalysis(analysisCandidate))
      throw new Error("Your analysis is malformed. Analyze the brief again.");
    const analysis = analysisCandidate as BriefAnalysis;
    const input = validateProjectInput({
      ...body,
      analysis,
      scope: body.scope ?? makeDefaultScope(analysis),
    });
    return NextResponse.json(
      { project: createProject(input) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create project",
      },
      { status: 400 },
    );
  }
}
