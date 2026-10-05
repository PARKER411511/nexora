import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudShareProject } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = sameOriginError(request);
  if (originError)
    return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const shared = await cloudShareProject((await params).id);
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      project: shared,
      url: `${origin}/review/${shared.reviewToken}`,
    });
  } catch (error) {
    return cloudErrorResponse(error, "Could not share project");
  }
}
