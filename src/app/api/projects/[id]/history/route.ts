import { NextResponse } from "next/server";
import { cloudGetHistory } from "@/lib/supabase/repository";
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
    return cloudErrorResponse(error, "Could not load project history");
  }
}
