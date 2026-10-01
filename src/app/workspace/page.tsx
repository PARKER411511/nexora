import { listProjects } from "@/lib/db";
import { WorkspaceHome } from "@/components/WorkspaceHome";

export const dynamic = "force-dynamic";

export default function WorkspacePage() { return <WorkspaceHome projects={listProjects()} />; }
