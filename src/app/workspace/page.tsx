import { WorkspaceHome } from "@/components/WorkspaceHome";
import { buildWorkspaceOverview } from "@/lib/workspace-overview";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { cloudGetHistory, cloudListProjects, isCloudSetupError } from "@/lib/supabase/repository";
import { CloudUnavailable } from "@/components/CloudUnavailable";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  if (!hasSupabaseConfig()) return <CloudUnavailable />;
  let projects;
  try { projects = await cloudListProjects(); } catch (error) { if (isCloudSetupError(error)) return <CloudUnavailable />; throw error; }
  let histories;
  try { histories = Object.fromEntries(await Promise.all(projects.map(async (project) => [project.id, await cloudGetHistory(project.id)] as const))); } catch (error) { if (isCloudSetupError(error)) return <CloudUnavailable />; throw error; }
  return (
    <WorkspaceHome
      overview={buildWorkspaceOverview(projects, histories)}
      projects={projects}
    />
  );
}
