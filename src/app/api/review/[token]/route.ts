import { NextResponse } from "next/server";
import { getReview, reviewComment } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) { const { token } = await params; const review = getReview(token); return review ? NextResponse.json({ review }) : NextResponse.json({ error: "Review link not found or no longer active" }, { status: 404 }); }

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params; const body = await request.json() as Record<string, unknown>; const name = typeof body.name === "string" ? body.name.trim() : ""; const comment = typeof body.comment === "string" ? body.comment.trim() : ""; const action = body.action === "approval" || body.action === "feedback" ? body.action : null;
    if (!action) return NextResponse.json({ error: "Choose feedback or approval." }, { status: 400 });
    if (!name || name.length > 120 || !comment || comment.length > 4000) return NextResponse.json({ error: "Add your name and a comment up to 4,000 characters." }, { status: 400 });
    return NextResponse.json({ review: reviewComment(token, { name, comment, action }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save review response" }, { status: 400 }); }
}
