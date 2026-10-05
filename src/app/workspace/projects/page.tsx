import { WorkspaceHome } from "@/components/WorkspaceHome";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { cloudListProjects, isCloudSetupError } from "@/lib/supabase/repository";
import { CloudUnavailable } from "@/components/CloudUnavailable";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!hasSupabaseConfig()) return <CloudUnavailable />;
  try { return <WorkspaceHome projects={await cloudListProjects()} view="projects" />; } catch (error) { if (isCloudSetupError(error)) return <CloudUnavailable />; throw error; }
}
