import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { cloudAdminCustomerDetail } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireServerUser(); return NextResponse.json({ customer: await cloudAdminCustomerDetail((await params).id) }); }
  catch (error) { return cloudErrorResponse(error, "Could not load customer detail"); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as { suspended?: unknown; reason?: unknown };
    if (typeof body.suspended !== "boolean") return NextResponse.json({ error: "Suspended must be true or false." }, { status: 400 });
    const { cloudAdminSetSuspended } = await import("@/lib/supabase/repository");
    await cloudAdminSetSuspended((await params).id, body.suspended, typeof body.reason === "string" ? body.reason : undefined);
    return NextResponse.json({ ok: true });
  } catch (error) { return cloudErrorResponse(error, "Could not update customer access"); }
}
