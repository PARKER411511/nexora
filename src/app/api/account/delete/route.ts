import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { cloudRequestAccountDeletion } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";
import { completeAccountDeletion } from "@/lib/account-deletion";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    const body = (await request.json()) as { confirmation?: unknown; reason?: unknown };
    if (body.confirmation !== "DELETE MY ACCOUNT") return NextResponse.json({ error: "Type DELETE MY ACCOUNT to confirm account deletion." }, { status: 400 });
    const user = await requireServerUser();
    const record = await cloudRequestAccountDeletion("DELETE MY ACCOUNT", typeof body.reason === "string" ? body.reason : undefined);
    const completion = await completeAccountDeletion(user.id);
    return NextResponse.json({ request: record, status: completion.status, message: completion.message }, { status: completion.status === "completed" ? 200 : 202 });
  } catch (error) {
    return cloudErrorResponse(error, "Could not request account deletion");
  }
}
