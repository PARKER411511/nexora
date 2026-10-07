import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { cloudGetReview, cloudReviewAction, cloudReviewReply } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await requireServerUser();
    const review = await cloudGetReview((await params).token);
    return review
      ? NextResponse.json({ review })
      : NextResponse.json(
          { error: "Review link not found or no longer active" },
          { status: 404 },
        );
  } catch (e) {
    return cloudErrorResponse(e, "Could not load review");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as Record<string, unknown>;
    if (
      !["approval", "feedback", "change_request", "proposal_decision", "reply"].includes(
        String(body.action),
      )
    )
      return NextResponse.json(
        { error: "Choose a valid review action." },
        { status: 400 },
      );
    if (body.action === "reply") {
      const comment = typeof body.comment === "string" ? body.comment : "";
      const parentId = typeof body.parentId === "number" ? body.parentId : null;
      const mentions = Array.isArray(body.mentions) ? body.mentions.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
      return NextResponse.json({ review: await cloudReviewReply((await params).token, comment, parentId, mentions) });
    }
    return NextResponse.json({ review: await cloudReviewAction((await params).token, body) });
  } catch (error) {
    return cloudErrorResponse(error, "Could not save review response");
  }
}
