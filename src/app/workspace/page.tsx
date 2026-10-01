import { WorkspaceHome } from "@/components/WorkspaceHome";
import { isDemoMode } from "@/lib/mode";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  if (isDemoMode()) return <WorkspaceHome demoMode projects={[]} />;
  const { listProjects } = await import("@/lib/db");
  return <WorkspaceHome projects={listProjects()} />;
}
