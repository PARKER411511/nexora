import { notFound } from "next/navigation";
import { ProjectEditor } from "@/components/ProjectEditor";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { cloudGetProject, isCloudSetupError } from "@/lib/supabase/repository";
import { CloudUnavailable } from "@/components/CloudUnavailable";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasSupabaseConfig()) return <CloudUnavailable />;
  let project;
  try { project = await cloudGetProject(id); } catch (error) { if (isCloudSetupError(error)) return <CloudUnavailable />; throw error; }
  if (!project) notFound();
  return <ProjectEditor project={project} />;
}
