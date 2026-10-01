import { NextResponse } from "next/server";
import { createChangeProposal, getProjectHistory } from "@/lib/db";
import { sameOriginError } from "@/lib/origin";
import { validateChangeProposalInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
    const { id } = await params;
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
