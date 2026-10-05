import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountProfile,
  AdminOverview,
  BriefAnalysis,
  ChangeProposal,
  Project,
  ProjectHistory,
  ReviewSnapshot,
  Scope,
} from "@/lib/types";
import { createSupabaseServerClient, requireServerUser } from "./server";

export class CloudDomainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export class AdminRequiredError extends CloudDomainError {
  constructor(message = "Admin access required.") {
    super(message, 403);
  }
}
export function isCloudSetupError(error: unknown) {
  return (
    error instanceof Error &&
    /PGRST20[25]|schema cache|relation .* does not exist|Cloud storage is not configured/i.test(
      error.message,
    )
  );
}

function throwRpc(error: { code?: string; message?: string } | null): never {
  const message = error?.message || "Cloud operation failed.";
  const status =
    error?.code === "PGRST116" || /not found|does not belong/i.test(message)
      ? 404
      : /locked|already|current|decision/i.test(message)
        ? 409
        : 400;
  throw new CloudDomainError(message, status);
}
async function owner(): Promise<SupabaseClient> {
  await requireServerUser();
  return createSupabaseServerClient();
}
function one<T>(
  data: T | T[] | null,
  error: { code?: string; message?: string } | null,
): T {
  if (error) throwRpc(error);
  return (Array.isArray(data) ? data[0] : data) as T;
}

export async function cloudListProjects(): Promise<Project[]> {
  const { data, error } = await (await owner()).rpc("nexora_list_projects");
  if (error) throwRpc(error);
  return data ?? [];
}
export async function cloudGetProject(id: string): Promise<Project | null> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_get_project", { p_project_id: id });
  if (error && error.code === "PGRST116") return null;
  if (error) throwRpc(error);
  return Array.isArray(data) ? (data[0] ?? null) : data;
}
export async function cloudGetHistory(id: string): Promise<ProjectHistory> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_project_history", { p_project_id: id });
  return one<ProjectHistory>(data, error);
}
export async function cloudCreateProject(input: {
  title: string;
  client: string;
  brief: string;
  analysis: BriefAnalysis;
  scope: Scope;
}): Promise<Project> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_create_project", { p_project: input });
  return one<Project>(data, error);
}
export async function cloudUpdateProject(
  id: string,
  input: {
    title: string;
    client: string;
    brief: string;
    analysis: BriefAnalysis;
    scope: Scope;
  },
): Promise<Project> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_update_project", { p_project_id: id, p_project: input });
  return one<Project>(data, error);
}
export async function cloudShareProject(id: string): Promise<Project> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_share_project", { p_project_id: id });
  return one<Project>(data, error);
}
export async function cloudCreateChangeProposal(
  projectId: string,
  input: Record<string, unknown>,
): Promise<ProjectHistory> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_create_change_proposal", {
    p_project_id: projectId,
    p_input: input,
  });
  return one<ProjectHistory>(data, error);
}
export async function cloudExportProject(
  id: string,
): Promise<{ project: Project; history: ProjectHistory }> {
  const project = await cloudGetProject(id);
  if (!project) throw new CloudDomainError("Project not found", 404);
  return { project, history: await cloudGetHistory(id) };
}

export async function cloudGetReview(
  token: string,
): Promise<ReviewSnapshot | null> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_get_review", { p_token: token });
  if (error && error.code === "PGRST116") return null;
  if (error) throwRpc(error);
  return Array.isArray(data) ? (data[0] ?? null) : data;
}
export async function cloudReviewAction(
  token: string,
  input: Record<string, unknown>,
): Promise<ReviewSnapshot> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_review_action", { p_token: token, p_action: input });
  return one<ReviewSnapshot>(data, error);
}

const emptyProfile: AccountProfile = {
  fullName: "",
  company: "",
  roleTitle: "",
  website: "",
  bio: "",
};

export async function cloudGetProfile(): Promise<AccountProfile> {
  const { data, error } = await (await owner()).rpc("nexora_get_profile");
  if (error) throwRpc(error);
  return (data ?? emptyProfile) as AccountProfile;
}

export async function cloudUpdateProfile(
  profile: Omit<AccountProfile, "id" | "createdAt" | "updatedAt">,
): Promise<AccountProfile> {
  const { data, error } = await (await owner()).rpc("nexora_update_profile", {
    p_profile: profile,
  });
  return one<AccountProfile>(data, error);
}

export async function cloudIsAdmin(): Promise<boolean> {
  const { data, error } = await (await owner()).rpc("nexora_is_admin");
  if (error) throwRpc(error);
  return data === true;
}

export async function cloudGetAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await (await owner()).rpc("nexora_admin_overview");
  if (error) {
    if (/admin access required/i.test(error.message ?? ""))
      throw new AdminRequiredError();
    throwRpc(error);
  }
  return data as AdminOverview;
}
