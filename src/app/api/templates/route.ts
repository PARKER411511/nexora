import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { cloudCreateTemplate, cloudListTemplates } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";
import { validateScope } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireServerUser();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ templates: [] });
    return NextResponse.json({ templates: await cloudListTemplates(workspaceId) });
  } catch (error) { return cloudErrorResponse(error, "Could not load brief templates"); }
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as { workspaceId?: unknown; name?: unknown; brief?: unknown; tags?: unknown; scope?: unknown };
    if (typeof body.workspaceId !== "string" || typeof body.name !== "string" || typeof body.brief !== "string") return NextResponse.json({ error: "Workspace, template name, and brief are required." }, { status: 400 });
    const tags = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20) : [];
    const scope = body.scope == null ? undefined : validateScope(body.scope) ? body.scope : null;
    if (body.scope != null && !scope) return NextResponse.json({ error: "Scope template data is malformed." }, { status: 400 });
    return NextResponse.json({ template: await cloudCreateTemplate(body.workspaceId, body.name.trim(), body.brief, tags, scope) }, { status: 201 });
  } catch (error) { return cloudErrorResponse(error, "Could not save brief template"); }
}
