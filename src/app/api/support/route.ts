import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudCreateSupportRequest } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as { subject?: unknown; body?: unknown };
    if (typeof body.subject !== "string" || typeof body.body !== "string" || !body.subject.trim() || !body.body.trim()) return NextResponse.json({ error: "Add a subject and message." }, { status: 400 });
    return NextResponse.json({ request: await cloudCreateSupportRequest(body.subject, body.body) }, { status: 201 });
  } catch (error) { return cloudErrorResponse(error, "Could not send support request"); }
}
