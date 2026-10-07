import { NextResponse } from "next/server";
import { cloudAllowRequest, cloudExportProject } from "@/lib/supabase/repository";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { requireServerUser } from "@/lib/supabase/server";
import { buildProjectPdf } from "@/lib/project-pdf";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireServerUser();
    if (!(await cloudAllowRequest("export"))) return NextResponse.json({ error: "Export is temporarily rate limited. Try again shortly." }, { status: 429 });
    const { id } = await params;
    const { project, history } = await cloudExportProject(id);
    const format = new URL(request.url).searchParams.get("format");
    const filename = project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "nexora-project";
    if (format === "json") {
      return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), project, history }, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.json"`,
        },
      });
    }
    if (format === "pdf") {
      return new NextResponse(buildProjectPdf(project, history) as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        },
      });
    }
    const responseLines = history.responses.length
      ? history.responses
          .map(
            (item) =>
              `- **${item.name}** (${item.action}, ${item.snapshotStatus}, ${new Date(item.createdAt).toLocaleString()}): ${item.comment}`,
          )
          .join("\n")
      : "- No client responses yet.";
    const changeLines = history.changeRequests.length
      ? history.changeRequests
          .map((request) =>
            [
              `### ${request.title} — ${request.status}`,
              `Requested by ${request.requesterName}: ${request.details}`,
              ...request.proposals.map(
                (proposal) =>
                  `- Proposal v${proposal.version}: **${proposal.title}** — ${proposal.status}; ${proposal.currency} ${proposal.priceAdjustment.toFixed(2)}; ${proposal.timelineImpact}. ${proposal.rationale}${proposal.decidedBy ? ` Decision by ${proposal.decidedBy}: ${proposal.decisionComment || "No comment"}.` : ""}`,
              ),
            ].join("\n"),
          )
          .join("\n\n")
      : "No change requests yet.";
    const lines = [
      `# ${project.title}`,
      `\nClient: ${project.client}`,
      `Status: ${project.status}`,
      `\n## Brief\n${project.brief}`,
      `\n## Analysis\n\n**Audience:** ${project.analysis.audience}`,
      `\n### Goals\n${project.analysis.goals.map((item) => `- ${item}`).join("\n")}`,
      `\n### Pages\n${project.analysis.pages.map((item) => `- ${item}`).join("\n")}`,
      `\n## Scope\n\n### Deliverables\n${project.scope.deliverables.map((item) => `- ${item}`).join("\n")}`,
      `\n### Included\n${project.scope.included.map((item) => `- ${item}`).join("\n")}`,
      `\n### Excluded\n${project.scope.excluded.map((item) => `- ${item}`).join("\n")}`,
      `\n### Milestones\n${project.scope.milestones.map((item) => `- **${item.name}** (${item.timing}) — ${item.detail}`).join("\n")}`,
      `\nRevision rounds: ${project.scope.revisions}`,
      `\n## Response history\n${responseLines}`,
      `\n## Change requests and proposals\n${changeLines}`,
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.md"`,
      },
    });
  } catch (error) {
    return cloudErrorResponse(error, "Could not export project");
  }
}
