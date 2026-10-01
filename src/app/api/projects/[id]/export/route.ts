import { NextResponse } from "next/server";
import { getProject } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const project = getProject(id); if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const lines = [`# ${project.title}`, `\nClient: ${project.client}`, `Status: ${project.status}`, `\n## Brief\n${project.brief}`, `\n## Analysis\n\n**Audience:** ${project.analysis.audience}`, `\n### Goals\n${project.analysis.goals.map((item) => `- ${item}`).join("\n")}`, `\n### Pages\n${project.analysis.pages.map((item) => `- ${item}`).join("\n")}`, `\n## Scope\n\n### Deliverables\n${project.scope.deliverables.map((item) => `- ${item}`).join("\n")}`, `\n### Included\n${project.scope.included.map((item) => `- ${item}`).join("\n")}`, `\n### Excluded\n${project.scope.excluded.map((item) => `- ${item}`).join("\n")}`, `\n### Milestones\n${project.scope.milestones.map((item) => `- **${item.name}** (${item.timing}) — ${item.detail}`).join("\n")}`, `\nRevision rounds: ${project.scope.revisions}`];
  return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md"` } });
}
