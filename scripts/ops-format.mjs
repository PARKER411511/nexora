export const BACKUP_SCHEMA = "nexora-application-v2";
export const BACKUP_VERSION = "2";
export const BACKUP_TABLES = [
  "public.profiles", "public.projects", "public.review_snapshots", "public.review_comments", "public.change_requests", "public.change_proposals",
  "public.workspaces", "public.workspace_members", "public.project_versions", "public.brief_templates", "public.workspace_invites", "public.review_invitations",
  "public.notifications", "public.project_attachments", "public.support_requests", "private.nexora_admins", "private.account_states", "private.platform_roles",
  "private.audit_events", "private.app_errors", "private.rate_limits", "private.application_backups", "private.account_deletion_requests", "private.profile_avatar_tombstones",
];

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

export function validateBackupDocument(value) {
  if (!record(value) || value.schema !== BACKUP_SCHEMA || value.version !== BACKUP_VERSION || value.app !== "nexora") throw new Error("Backup schema is not supported.");
  if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) throw new Error("Backup generatedAt is invalid.");
  if (!Number.isInteger(value.rowLimit) || value.rowLimit < 1 || value.rowLimit > 10000) throw new Error("Backup row limit is invalid.");
  if (!record(value.tables)) throw new Error("Backup tables are missing.");
  const unknownTables = Object.keys(value.tables).filter((name) => !BACKUP_TABLES.includes(name));
  if (unknownTables.length) throw new Error(`Backup contains unsupported tables: ${unknownTables.join(", ")}.`);
  for (const name of BACKUP_TABLES) {
    if (!Array.isArray(value.tables[name]) || value.tables[name].some((row) => !record(row))) throw new Error(`Backup table ${name} is invalid.`);
    if (value.tables[name].length > value.rowLimit) throw new Error(`Backup table ${name} exceeds its declared row limit.`);
  }
  if (!record(value.storageManifest) || !Array.isArray(value.storageManifest.objects) || value.storageManifest.note !== "metadata-only; Storage object bytes require a separate provider backup") throw new Error("Backup Storage manifest is invalid.");
  for (const item of value.storageManifest.objects) if (!record(item) || typeof item.bucketId !== "string" || typeof item.objectKey !== "string") throw new Error("Backup Storage manifest contains an invalid object.");
  return value;
}
