import { NextResponse } from "next/server";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { cloudAllowRequest, cloudExportProject, cloudGetProfile, cloudListProjects } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireServerUser();
    if (!(await cloudAllowRequest("export"))) return NextResponse.json({ error: "Account export is temporarily rate limited. Try again shortly." }, { status: 429 });
    const projects = await cloudListProjects();
    const exportedProjects = await Promise.all(projects.map((project) => cloudExportProject(project.id)));
    const payload = { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email ?? "" }, profile: await cloudGetProfile(), projects: exportedProjects };
    return new NextResponse(JSON.stringify(payload, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="nexora-account-export.json"' } });
  } catch (error) {
    return cloudErrorResponse(error, "Could not export account data");
  }
}
