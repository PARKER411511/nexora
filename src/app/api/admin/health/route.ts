import { NextResponse } from "next/server";
import { cloudAdminHealthSummary } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try { await requireServerUser(); return NextResponse.json(await cloudAdminHealthSummary()); }
  catch (error) { return cloudErrorResponse(error, "Could not load service health"); }
}
