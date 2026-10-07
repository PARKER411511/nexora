import { NextResponse } from "next/server";
import { cloudCompareProjectVersions, cloudListProjectVersions } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireServerUser();
    const id = (await params).id;
    const url = new URL(request.url);
    const left = Number(url.searchParams.get("left"));
    const right = Number(url.searchParams.get("right"));
    if (Number.isInteger(left) && Number.isInteger(right))
      return NextResponse.json({ comparison: await cloudCompareProjectVersions(id, left, right) });
    return NextResponse.json({ versions: await cloudListProjectVersions(id) });
  } catch (error) {
    return cloudErrorResponse(error, "Could not load project versions");
  }
}
