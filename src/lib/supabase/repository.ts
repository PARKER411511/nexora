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
  BriefTemplate,
  ProjectVersion,
  VersionComparison,
  Workspace,
  WorkspaceInvite,
  WorkspaceNotification,
  WorkspaceRole,
  ProjectAttachment,
  AdminCustomerDetail,
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

export async function cloudListWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await (await owner()).rpc("nexora_list_workspaces");
  if (error) throwRpc(error);
  return (data ?? []) as Workspace[];
}

export async function cloudCreateWorkspace(name: string): Promise<Workspace> {
  const { data, error } = await (await owner()).rpc("nexora_create_workspace", {
    p_name: name,
  });
  return one<Workspace>(data, error);
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
  workspaceId?: string;
  tags?: string[];
  deadline?: string | null;
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
    workspaceId?: string;
    tags?: string[];
    deadline?: string | null;
  },
): Promise<Project> {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_update_project", { p_project_id: id, p_project: input });
  return one<Project>(data, error);
}

export async function cloudArchiveProject(
  id: string,
  archived = true,
): Promise<Project> {
  const { data, error } = await (await owner()).rpc("nexora_archive_project", {
    p_project_id: id,
    p_archived: archived,
  });
  return one<Project>(data, error);
}

export async function cloudDuplicateProject(
  id: string,
  title?: string,
): Promise<Project> {
  const { data, error } = await (await owner()).rpc("nexora_duplicate_project", {
    p_project_id: id,
    p_title: title ?? null,
  });
  return one<Project>(data, error);
}

export async function cloudDeleteProject(id: string, confirmation: string): Promise<boolean> {
  const { data, error } = await (await owner()).rpc("nexora_delete_project", {
    p_project_id: id,
    p_confirmation: confirmation,
  });
  return Boolean(one<boolean>(data, error));
}

export async function cloudListProjectVersions(
  id: string,
): Promise<ProjectVersion[]> {
  const { data, error } = await (await owner()).rpc("nexora_project_versions", {
    p_project_id: id,
  });
  if (error) throwRpc(error);
  return (data ?? []) as ProjectVersion[];
}

export async function cloudCompareProjectVersions(
  id: string,
  leftVersion: number,
  rightVersion: number,
): Promise<VersionComparison> {
  const { data, error } = await (await owner()).rpc(
    "nexora_compare_versions",
    { p_project_id: id, p_left: leftVersion, p_right: rightVersion },
  );
  return one<VersionComparison>(data, error);
}

export async function cloudInviteWorkspaceMember(
  workspaceId: string,
  email: string,
  role: Exclude<WorkspaceRole, "owner">,
): Promise<WorkspaceInvite> {
  const { data, error } = await (await owner()).rpc("nexora_workspace_invite", {
    p_workspace_id: workspaceId,
    p_email: email,
    p_role: role,
  });
  return one<WorkspaceInvite>(data, error);
}

export type WorkspaceMember = {
  userId: string;
  role: WorkspaceRole;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export async function cloudListWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await (await owner()).rpc("nexora_list_workspace_members", { p_workspace_id: workspaceId });
  if (error) throwRpc(error);
  return (data ?? []) as WorkspaceMember[];
}

export async function cloudSetWorkspaceMemberRole(workspaceId: string, userId: string, role: Exclude<WorkspaceRole, "owner">) {
  const { data, error } = await (await owner()).rpc("nexora_set_workspace_member_role", { p_workspace_id: workspaceId, p_user_id: userId, p_role: role });
  return Boolean(one<boolean>(data, error));
}

export async function cloudRemoveWorkspaceMember(workspaceId: string, userId: string) {
  const { data, error } = await (await owner()).rpc("nexora_remove_workspace_member", { p_workspace_id: workspaceId, p_user_id: userId });
  return Boolean(one<boolean>(data, error));
}

export async function cloudTransferWorkspaceOwnership(workspaceId: string, userId: string) {
  const { data, error } = await (await owner()).rpc("nexora_transfer_workspace_ownership", { p_workspace_id: workspaceId, p_new_owner: userId });
  return Boolean(one<boolean>(data, error));
}

export async function cloudRevokeWorkspaceInvite(id: string) {
  const { data, error } = await (await owner()).rpc("nexora_revoke_workspace_invite", { p_invite_id: id });
  return Boolean(one<boolean>(data, error));
}

export async function cloudListTemplates(workspaceId: string): Promise<BriefTemplate[]> {
  const { data, error } = await (await owner()).rpc("nexora_list_brief_templates", { p_workspace_id: workspaceId });
  if (error) throwRpc(error);
  return (data ?? []) as BriefTemplate[];
}

export async function cloudCreateTemplate(workspaceId: string, name: string, brief: string, tags: string[] = [], scope?: Scope | null) {
  const client = await owner();
  const { data, error } = scope
    ? await client.rpc("nexora_create_scope_template", { p_workspace_id: workspaceId, p_name: name, p_brief: brief, p_scope: scope, p_tags: tags })
    : await client.rpc("nexora_create_brief_template", { p_workspace_id: workspaceId, p_name: name, p_brief: brief, p_tags: tags });
  return one<BriefTemplate>(data, error);
}

export async function cloudSetReviewAccess(projectId: string, invitedOnly: boolean) {
  const { data, error } = await (await owner()).rpc("nexora_set_review_access", { p_project_id: projectId, p_invited_only: invitedOnly });
  return Boolean(one<boolean>(data, error));
}

export async function cloudListReviewInvitations(projectId: string) {
  const { data, error } = await (await owner()).rpc("nexora_list_review_invitations", { p_project_id: projectId });
  if (error) throwRpc(error);
  return (data ?? []) as Array<{ id: string; email: string; status: string; dueAt?: string | null; emailDeliveryStatus: string; createdAt: string }>;
}

export async function cloudCreateReviewInvitation(projectId: string, snapshotToken: string, email: string, dueAt?: string | null) {
  const { data, error } = await (await owner()).rpc("nexora_create_review_invitation", { p_project_id: projectId, p_snapshot_token: snapshotToken, p_email: email, p_due_at: dueAt ?? null });
  return one<{ id: string; email: string; status: string; dueAt?: string | null; emailDeliveryStatus: string; createdAt: string }>(data, error);
}

export async function cloudRevokeReviewInvitation(id: string) {
  const { data, error } = await (await owner()).rpc("nexora_revoke_review_invitation", { p_invite_id: id });
  return Boolean(one<boolean>(data, error));
}

export async function cloudRevokeReviewSnapshot(snapshotToken: string) {
  const { data, error } = await (await owner()).rpc("nexora_revoke_review_snapshot", { p_snapshot_token: snapshotToken });
  return Boolean(one<boolean>(data, error));
}

export type AccountDeletionManifestItem = {
  bucket: string;
  object_key: string;
  kind: "avatar" | "attachment";
  workspace_id?: string | null;
  workspace_owner_id?: string | null;
  workspace_personal?: boolean | null;
};

export async function cloudAccountDeletionManifest(): Promise<AccountDeletionManifestItem[]> {
  const { data, error } = await (await owner()).rpc("nexora_account_deletion_manifest");
  if (error) throwRpc(error);
  return (data ?? []) as AccountDeletionManifestItem[];
}

export async function cloudReviewReply(token: string, comment: string, parentId?: number | null, mentionedEmails: string[] = []) {
  const { data, error } = await (await owner()).rpc("nexora_review_reply", { p_token: token, p_comment: comment, p_parent_id: parentId ?? null, p_mentioned_emails: mentionedEmails });
  return one<ReviewSnapshot>(data, error);
}

export async function cloudAcceptWorkspaceInvite(token: string) {
  const { data, error } = await (
    await owner()
  ).rpc("nexora_accept_workspace_invite", { p_token: token });
  return one<{ workspaceId: string; role: WorkspaceRole; acceptedAt: string }>(
    data,
    error,
  );
}

export async function cloudListNotifications(
  limit = 50,
): Promise<WorkspaceNotification[]> {
  const { data, error } = await (await owner()).rpc(
    "nexora_list_notifications",
    { p_limit: limit },
  );
  if (error) throwRpc(error);
  return (data ?? []) as WorkspaceNotification[];
}

export async function cloudUnreadNotificationCount(): Promise<number> {
  const { data, error } = await (await owner()).rpc(
    "nexora_unread_notification_count",
  );
  if (error) throwRpc(error);
  return Number(data ?? 0);
}

export async function cloudMarkNotificationRead(id: number): Promise<boolean> {
  const { data, error } = await (await owner()).rpc(
    "nexora_mark_notification_read",
    { p_id: id },
  );
  return Boolean(one<boolean>(data, error));
}

export async function cloudRecordClientError(
  source: string,
  message: string,
  context: Record<string, unknown> = {},
): Promise<boolean> {
  const { data, error } = await (await owner()).rpc(
    "nexora_record_client_error",
    { p_source: source, p_message: message, p_context: context },
  );
  return Boolean(one<boolean>(data, error));
}

export async function cloudAllowRequest(operation: string): Promise<boolean> {
  const { data, error } = await (await owner()).rpc("nexora_allow_request", {
    p_operation: operation,
  });
  if (error) throwRpc(error);
  return data === true;
}

export async function cloudCreateSupportRequest(subject: string, body: string) {
  const { data, error } = await (await owner()).rpc(
    "nexora_create_support_request",
    { p_subject: subject, p_body: body },
  );
  return one<{ id: string; subject: string; status: string; createdAt: string }>(
    data,
    error,
  );
}

export async function cloudRegisterAttachment(input: {
  projectId: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  snapshotToken?: string | null;
}) {
  const { data, error } = await (await owner()).rpc("nexora_register_attachment", {
    p_project_id: input.projectId,
    p_original_name: input.originalName,
    p_mime_type: input.mimeType,
    p_byte_size: input.byteSize,
    p_snapshot_token: input.snapshotToken ?? null,
  });
  return one<ProjectAttachment>(data, error);
}

export async function cloudRequestAttachmentDelete(id: string) {
  const { data, error } = await (await owner()).rpc("nexora_request_delete_attachment", { p_attachment_id: id });
  return one<{ id: string; objectKey: string; pending: boolean }>(data, error);
}

export async function cloudFinalizeAttachmentDelete(id: string) {
  const { data, error } = await (await owner()).rpc("nexora_finalize_delete_attachment", { p_attachment_id: id });
  return Boolean(one<boolean>(data, error));
}

export async function cloudRegisterProfileAvatar(mimeType: string, byteSize: number) {
  const { data, error } = await (await owner()).rpc("nexora_register_profile_avatar", { p_mime_type: mimeType, p_byte_size: byteSize });
  return one<{ bucket: string; objectKey: string }>(data, error);
}

export async function cloudClearProfileAvatar(objectKey: string) {
  const { data, error } = await (await owner()).rpc("nexora_clear_profile_avatar", { p_object_key: objectKey });
  return Boolean(one<boolean>(data, error));
}

export async function cloudActivateProfileAvatar(objectKey: string) {
  const { data, error } = await (await owner()).rpc("nexora_activate_profile_avatar", { p_object_key: objectKey });
  return one<{ objectKey: string; previousObjectKey?: string | null }>(data, error);
}

export async function cloudClearPendingProfileAvatar(objectKey: string) {
  const { data, error } = await (await owner()).rpc("nexora_clear_pending_profile_avatar", { p_object_key: objectKey });
  return Boolean(one<boolean>(data, error));
}

export async function cloudFinalizeProfileAvatarDelete(objectKey: string) {
  const { data, error } = await (await owner()).rpc("nexora_finalize_profile_avatar_delete", { p_object_key: objectKey });
  return Boolean(one<boolean>(data, error));
}

export async function cloudRequestAccountDeletion(confirmation: string, reason?: string) {
  const { data, error } = await (await owner()).rpc("nexora_request_account_deletion", { p_confirmation: confirmation, p_reason: reason ?? null });
  return one<{ id: string; status: string; createdAt: string }>(data, error);
}

export async function cloudAdminCustomerDetail(id: string) {
  const { data, error } = await (await owner()).rpc("nexora_admin_customer_detail", { p_user_id: id });
  const raw = one<AdminCustomerDetail & { profile?: Record<string, unknown> | null }>(data, error);
  const profile = raw.profile;
  return {
    ...raw,
    profile: profile
      ? {
          id: typeof profile.id === "string" ? profile.id : undefined,
          fullName: String(profile.fullName ?? profile.full_name ?? ""),
          company: String(profile.company ?? ""),
          roleTitle: String(profile.roleTitle ?? profile.role_title ?? ""),
          website: String(profile.website ?? ""),
          bio: String(profile.bio ?? ""),
          avatarObjectKey: (profile.avatarObjectKey ?? profile.avatar_object_key ?? null) as string | null,
          createdAt: typeof (profile.createdAt ?? profile.created_at) === "string" ? String(profile.createdAt ?? profile.created_at) : undefined,
          updatedAt: typeof (profile.updatedAt ?? profile.updated_at) === "string" ? String(profile.updatedAt ?? profile.updated_at) : undefined,
        }
      : null,
  } satisfies AdminCustomerDetail;
}
export async function cloudAdminProjectDetail(id: string) {
  const { data, error } = await (await owner()).rpc("nexora_admin_project_detail", { p_project_id: id });
  return one<Record<string, unknown>>(data, error);
}
export async function cloudAdminSetSuspended(id: string, suspended: boolean, reason?: string) {
  const { data, error } = await (await owner()).rpc("nexora_admin_set_account_suspended", { p_user_id: id, p_suspended: suspended, p_reason: reason ?? null });
  return Boolean(one<boolean>(data, error));
}

export async function cloudAdminHealthSummary() {
  const { data, error } = await (await owner()).rpc("nexora_admin_health_summary");
  return one<{ generatedAt: string; database: string; recentErrors: number; openSupport: number; pendingInvites: number }>(data, error);
}
export async function cloudAdminSupportQueue() {
  const { data, error } = await (await owner()).rpc("nexora_admin_support_queue");
  if (error) throwRpc(error);
  return (data ?? []) as Array<{ id: string; subject: string; body: string; status: string; createdAt: string; updatedAt: string; requesterId: string; email: string }>;
}
export async function cloudAdminSetSupportStatus(id: string, status: string) {
  const { data, error } = await (await owner()).rpc("nexora_admin_set_support_status", { p_id: id, p_status: status });
  return Boolean(one<boolean>(data, error));
}
export async function cloudAdminAuditFeed(limit = 50) {
  const { data, error } = await (await owner()).rpc("nexora_admin_audit_feed", { p_limit: limit });
  if (error) throwRpc(error);
  return (data ?? []) as Array<{ id: string; action: string; targetType: string; targetId: string; payload: Record<string, unknown>; createdAt: string; actorEmail?: string; actorName?: string }>;
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
