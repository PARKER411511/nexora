import { NextResponse } from "next/server";
import { cloudAdminProjectDetail } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { await requireServerUser(); return NextResponse.json({ project: await cloudAdminProjectDetail((await params).id) }); } catch (error) { return cloudErrorResponse(error, "Could not load project detail"); } }
