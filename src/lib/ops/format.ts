export const BACKUP_SCHEMA = "nexora-application-v2" as const;
export const BACKUP_VERSION = "2" as const;
export const BACKUP_ROW_LIMIT = 5000;
export const BACKUP_MAX_ROW_LIMIT = 10000;

export const BACKUP_TABLES = [
  "public.profiles",
  "public.projects",
  "public.review_snapshots",
  "public.review_comments",
  "public.change_requests",
  "public.change_proposals",
  "public.workspaces",
  "public.workspace_members",
  "public.project_versions",
  "public.brief_templates",
  "public.workspace_invites",
  "public.review_invitations",
  "public.notifications",
  "public.project_attachments",
  "public.support_requests",
  "private.nexora_admins",
  "private.account_states",
  "private.platform_roles",
  "private.audit_events",
  "private.app_errors",
  "private.rate_limits",
  "private.application_backups",
  "private.account_deletion_requests",
  "private.profile_avatar_tombstones",
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, unknown>;
export type BackupTables = Record<BackupTableName, BackupRow[]>;

export type StorageManifest = {
  objects: Array<{
    bucketId: string;
    objectKey: string;
    ownerId: string | null;
    size: number | null;
    mimeType: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  note: "metadata-only; Storage object bytes require a separate provider backup";
};

export type BackupDocument = {
  schema: typeof BACKUP_SCHEMA;
  version: typeof BACKUP_VERSION;
  app: "nexora";
  generatedAt: string;
  rowLimit: number;
  tables: BackupTables;
  storageManifest: StorageManifest;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateBackupDocument(input: unknown): asserts input is BackupDocument {
  if (!isRecord(input)) throw new Error("Backup payload must be a JSON object.");
  if (input.schema !== BACKUP_SCHEMA || input.version !== BACKUP_VERSION || input.app !== "nexora") {
    throw new Error("Backup schema is not supported.");
  }
  if (typeof input.generatedAt !== "string" || Number.isNaN(Date.parse(input.generatedAt))) {
    throw new Error("Backup generatedAt is invalid.");
  }
  if (typeof input.rowLimit !== "number" || !Number.isInteger(input.rowLimit) || input.rowLimit < 1 || input.rowLimit > BACKUP_MAX_ROW_LIMIT) {
    throw new Error("Backup row limit is invalid.");
  }
  if (!isRecord(input.tables)) throw new Error("Backup tables are missing.");
  const unknownTables = Object.keys(input.tables).filter((name) => !(BACKUP_TABLES as readonly string[]).includes(name));
  if (unknownTables.length) throw new Error(`Backup contains unsupported tables: ${unknownTables.join(", ")}.`);
  for (const name of BACKUP_TABLES) {
    const rows = input.tables[name];
    if (!Array.isArray(rows) || rows.some((row) => !isRecord(row))) {
      throw new Error(`Backup table ${name} is invalid.`);
    }
    if (rows.length > input.rowLimit) throw new Error(`Backup table ${name} exceeds its declared row limit.`);
  }
  if (!isRecord(input.storageManifest) || !Array.isArray(input.storageManifest.objects)) {
    throw new Error("Backup Storage manifest is missing.");
  }
  if (input.storageManifest.note !== "metadata-only; Storage object bytes require a separate provider backup") {
    throw new Error("Backup Storage manifest note is invalid.");
  }
  for (const object of input.storageManifest.objects) {
    if (!isRecord(object) || typeof object.bucketId !== "string" || typeof object.objectKey !== "string") {
      throw new Error("Backup Storage manifest contains an invalid object.");
    }
  }
}

export function emptyBackupTables(): BackupTables {
  return Object.fromEntries(BACKUP_TABLES.map((name) => [name, []])) as unknown as BackupTables;
}
