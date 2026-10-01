import { notFound } from "next/navigation";
import { isDemoMode } from "@/lib/mode";
import { DemoProjectPage } from "@/components/DemoProjectPage";
import { ProjectEditor } from "@/components/ProjectEditor";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isDemoMode()) return <DemoProjectPage id={id} />;
  const { getProject } = await import("@/lib/db");
  const project = getProject(id);
  if (!project) notFound();
  return <ProjectEditor project={project} />;
}
