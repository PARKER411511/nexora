import { WorkspaceHome } from "@/components/WorkspaceHome";
import { isDemoMode } from "@/lib/mode";
import { buildWorkspaceOverview } from "@/lib/workspace-overview";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  if (isDemoMode()) return <WorkspaceHome demoMode projects={[]} />;
  const { getProjectHistory, listProjects } = await import("@/lib/db");
  const projects = listProjects();
  const histories = Object.fromEntries(
    projects.map((project) => [project.id, getProjectHistory(project.id)]),
  );
  return (
    <WorkspaceHome
      overview={buildWorkspaceOverview(projects, histories)}
      projects={projects}
    />
  );
}
