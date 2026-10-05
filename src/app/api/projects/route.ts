import { NextResponse } from "next/server";
import { analyzeBrief, makeDefaultScope } from "@/lib/analyzer";
import { isValidBriefAnalysis, validateProjectInput } from "@/lib/validation";
import type { BriefAnalysis } from "@/lib/types";
import { sameOriginError } from "@/lib/origin";
import {
  cloudCreateProject,
  cloudListProjects,
} from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireServerUser();
    return NextResponse.json({ projects: await cloudListProjects() });
  } catch (e) {
    return cloudErrorResponse(e, "Could not load projects");
  }
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
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
      { project: await cloudCreateProject(input) },
      { status: 201 },
    );
  } catch (error) {
    return cloudErrorResponse(error, "Could not create project");
  }
}
