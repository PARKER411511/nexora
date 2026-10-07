import { NextResponse } from "next/server";
import { cloudErrorResponse, } from "@/lib/supabase/api";
import { cloudGetAdminOverview } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireServerUser();
    const overview = await cloudGetAdminOverview();
    const query = new URL(request.url).searchParams;
    const search = (query.get("search") ?? "").trim().toLowerCase();
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 25) || 25));
    const sort = query.get("sort") ?? "joined";
    const customers = overview.customers.filter((customer) => !search || [customer.name, customer.email, customer.company].some((value) => value.toLowerCase().includes(search))).toSorted((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "projects" ? b.projectCount - a.projectCount : b.joinedAt.localeCompare(a.joinedAt));
    return NextResponse.json({ customers: customers.slice((page - 1) * pageSize, page * pageSize), total: customers.length, page, pageSize, projects: overview.projects });
  } catch (error) { return cloudErrorResponse(error, "Could not load admin customers"); }
}
