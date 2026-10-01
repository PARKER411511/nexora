import { NextResponse } from "next/server";
import { analyzeBrief, analyzeWithOpenAI } from "@/lib/analyzer";
import { sameOriginError } from "@/lib/origin";
import { isDemoMode } from "@/lib/mode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    const body = (await request.json()) as {
      brief?: unknown;
      preferOpenAI?: unknown;
    };
    if (
      typeof body.brief !== "string" ||
      body.brief.trim().length < 24 ||
      body.brief.length > 20000
    )
      return NextResponse.json(
        { error: "Add a brief between 24 and 20,000 characters." },
        { status: 400 },
      );
    if (isDemoMode())
      return NextResponse.json({
        analysis: analyzeBrief(body.brief),
        notice: "Using Built-in analysis / local in the browser demo.",
      });
    if (
      body.preferOpenAI !== undefined &&
      typeof body.preferOpenAI !== "boolean"
    )
      return NextResponse.json(
        { error: "The optional analysis preference must be a boolean." },
        { status: 400 },
      );
    if (body.preferOpenAI === true && process.env.OPENAI_API_KEY) {
      try {
        return NextResponse.json({
          analysis: await analyzeWithOpenAI(body.brief),
        });
      } catch {
        /* transparent local fallback */
      }
    }
    return NextResponse.json({
      analysis: analyzeBrief(body.brief),
      notice: process.env.OPENAI_API_KEY
        ? "Optional analysis was unavailable; using Built-in analysis / local."
        : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not analyze brief",
      },
      { status: 400 },
    );
  }
}
