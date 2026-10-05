import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { validateChangeProposalInput } from "@/lib/validation";
import {
  cloudCreateChangeProposal,
  cloudGetHistory,
} from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireServerUser();
    return NextResponse.json({ history: await cloudGetHistory(id) });
  } catch (error) {
    return cloudErrorResponse(error, "Could not load change history");
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
    await requireServerUser();
    const input = validateChangeProposalInput(await request.json());
    return NextResponse.json(
      { history: await cloudCreateChangeProposal(id, input) },
      { status: 201 },
    );
  } catch (error) {
    return cloudErrorResponse(error, "Could not save proposal");
  }
}
