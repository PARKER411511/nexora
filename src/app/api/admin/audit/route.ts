import { NextResponse } from "next/server";
import { cloudAdminAuditFeed } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";
export async function GET() { try { await requireServerUser(); return NextResponse.json({ events: await cloudAdminAuditFeed() }); } catch (error) { return cloudErrorResponse(error, "Could not load audit activity"); } }
