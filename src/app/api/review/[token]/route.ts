import { NextResponse } from "next/server";
import { validateChangeRequestInput } from "@/lib/validation";
import { sameOriginError } from "@/lib/origin";
import { isDemoMode } from "@/lib/mode";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (isDemoMode())
    return NextResponse.json(
      { error: "This browser demo keeps review data in browser storage." },
      { status: 409 },
    );
  const { getReview } = await import("@/lib/db");
  const review = getReview(token);
  return review
    ? NextResponse.json({ review })
    : NextResponse.json(
        { error: "Review link not found or no longer active" },
        { status: 404 },
      );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    if (isDemoMode())
      return NextResponse.json(
        { error: "This browser demo saves review responses in this browser." },
        { status: 409 },
      );
    const { createChangeRequest, decideChangeProposal, reviewComment } =
      await import("@/lib/db");
    const { token } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    if (action === "change_request")
      return NextResponse.json({
        review: createChangeRequest(
          token,
          validateChangeRequestInput({
            requesterName: body.name,
            title: body.title,
            details: body.details,
          }),
        ),
      });
    if (action === "proposal_decision") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const proposalId =
        typeof body.proposalId === "string" ? body.proposalId : "";
      const decision =
        body.decision === "accepted" || body.decision === "declined"
          ? body.decision
          : null;
      const comment =
        typeof body.comment === "string" ? body.comment.trim() : "";
      if (
        !name ||
        name.length > 120 ||
        !proposalId ||
        !decision ||
        comment.length > 4000
      )
        return NextResponse.json(
          { error: "Add your name and choose an accept or decline decision." },
          { status: 400 },
        );
      return NextResponse.json({
        review: decideChangeProposal(token, {
          proposalId,
          decision,
          name,
          comment,
        }),
      });
    }
    if (action !== "approval" && action !== "feedback")
      return NextResponse.json(
        { error: "Choose feedback, approval, or a change request." },
        { status: 400 },
      );
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    if (!name || name.length > 120 || !comment || comment.length > 4000)
      return NextResponse.json(
        { error: "Add your name and a comment up to 4,000 characters." },
        { status: 400 },
      );
    return NextResponse.json({
      review: reviewComment(token, { name, comment, action }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save review response",
      },
      { status: 400 },
    );
  }
}
