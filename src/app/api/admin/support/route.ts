import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { cloudAdminSetSupportStatus, cloudAdminSupportQueue } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export async function GET() { try { await requireServerUser(); return NextResponse.json({ requests: await cloudAdminSupportQueue() }); } catch (error) { return cloudErrorResponse(error, "Could not load support queue"); } }
export async function PATCH(request: Request) {
  const originError = sameOriginError(request); if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try { await requireServerUser(); const body = (await request.json()) as { id?: unknown; status?: unknown }; if (typeof body.id !== "string" || typeof body.status !== "string") return NextResponse.json({ error: "Support request and status are required." }, { status: 400 }); await cloudAdminSetSupportStatus(body.id, body.status); return NextResponse.json({ ok: true }); } catch (error) { return cloudErrorResponse(error, "Could not update support request"); }
}
