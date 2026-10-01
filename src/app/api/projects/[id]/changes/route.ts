import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { validateChangeProposalInput } from "@/lib/validation";
import { isDemoMode } from "@/lib/mode";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode())
    return NextResponse.json(
      { error: "The browser demo reads history from this browser." },
      { status: 409 },
    );
  try {
    const { id } = await params;
    const { getProjectHistory } = await import("@/lib/db");
    return NextResponse.json({ history: getProjectHistory(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load change history",
      },
      { status: 404 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    if (isDemoMode())
      return NextResponse.json(
        { error: "The browser demo saves proposals in this browser." },
        { status: 409 },
      );
    const { id } = await params;
    const { createChangeProposal } = await import("@/lib/db");
    const input = validateChangeProposalInput(await request.json());
    return NextResponse.json(
      { history: createChangeProposal(id, input) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save proposal",
      },
      { status: 400 },
    );
  }
}
