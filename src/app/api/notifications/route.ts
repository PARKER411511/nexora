import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudListNotifications, cloudMarkNotificationRead, cloudUnreadNotificationCount } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireServerUser();
    const [notifications, unread] = await Promise.all([cloudListNotifications(50), cloudUnreadNotificationCount()]);
    return NextResponse.json({ notifications, unread });
  } catch (error) {
    return cloudErrorResponse(error, "Could not load notifications");
  }
}

export async function PATCH(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "number" ? body.id : Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    return NextResponse.json({ ok: await cloudMarkNotificationRead(id) });
  } catch (error) {
    return cloudErrorResponse(error, "Could not update notification");
  }
}
