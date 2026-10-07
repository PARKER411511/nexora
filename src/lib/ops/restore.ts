import { BACKUP_TABLES, type BackupDocument, type BackupRow, validateBackupDocument } from "./format";

export type RestoreExecutor = {
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};

type TableSpec = {
  name: (typeof BACKUP_TABLES)[number];
  columns: string[];
  identity: boolean;
  userColumns?: string[];
  userPrimary?: string;
  key: string[];
  jsonColumns?: string[];
};

const userColumns = [
  "owner_id", "created_by", "updated_by", "invited_by", "accepted_by", "actor_id", "uploaded_by",
  "delete_requested_by", "changed_by", "granted_by", "requester_id", "decided_by_id", "user_id", "subject_id",
];

const tableSpecs: TableSpec[] = [
  { name: "private.nexora_admins", columns: ["user_id", "created_at"], identity: false, userColumns: ["user_id"], userPrimary: "user_id", key: ["user_id"] },
  { name: "public.profiles", columns: ["id", "full_name", "company", "role_title", "website", "bio", "created_at", "updated_at", "avatar_object_key", "avatar_pending_key", "avatar_pending_mime", "avatar_pending_size"], identity: false, userColumns: ["id"], userPrimary: "id", key: ["id"] },
  { name: "public.workspaces", columns: ["id", "owner_id", "name", "personal", "created_at", "updated_at"], identity: false, userColumns, key: ["id"] },
  { name: "public.workspace_members", columns: ["workspace_id", "user_id", "role", "invited_by", "created_at", "updated_at"], identity: false, userColumns: ["user_id", "invited_by"], key: ["workspace_id", "user_id"] },
  { name: "public.projects", columns: ["id", "owner_id", "title", "client", "brief", "analysis", "scope", "status", "review_token", "approval", "created_at", "updated_at", "workspace_id", "created_by", "archived", "tags", "deadline", "version", "updated_by", "review_invited_only"], identity: false, userColumns, key: ["id"], jsonColumns: ["analysis", "scope", "approval"] },
  { name: "public.review_snapshots", columns: ["token", "project_id", "owner_id", "project_json", "status", "created_at"], identity: false, userColumns: ["owner_id"], key: ["token"], jsonColumns: ["project_json"] },
  { name: "public.project_versions", columns: ["id", "project_id", "version", "project_json", "changed_by", "created_at"], identity: true, userColumns: ["changed_by"], key: ["id"], jsonColumns: ["project_json"] },
  { name: "public.review_comments", columns: ["id", "snapshot_token", "name", "comment", "action", "created_at", "author_id", "author_email", "parent_id", "mentioned_user_ids"], identity: true, userColumns: ["author_id", "mentioned_user_ids"], key: ["id"] },
  { name: "public.change_requests", columns: ["id", "project_id", "snapshot_token", "requester_name", "title", "details", "status", "created_at", "updated_at", "requester_id"], identity: false, userColumns: ["requester_id"], key: ["id"] },
  { name: "public.change_proposals", columns: ["id", "request_id", "version", "title", "details", "affected_deliverables", "price_adjustment", "currency", "timeline_impact", "rationale", "status", "created_at", "decided_by", "decision_comment", "decided_at", "decided_by_id"], identity: false, userColumns: ["decided_by_id"], key: ["id"], jsonColumns: ["affected_deliverables"] },
  { name: "public.brief_templates", columns: ["id", "owner_id", "created_by", "workspace_id", "name", "brief", "scope", "tags", "created_at", "updated_at"], identity: false, userColumns, key: ["id"], jsonColumns: ["scope"] },
  { name: "public.workspace_invites", columns: ["id", "workspace_id", "email", "role", "token_hash", "expires_at", "invited_by", "accepted_by", "accepted_at", "revoked_at", "email_delivery_status", "created_at"], identity: false, userColumns: ["invited_by", "accepted_by"], key: ["id"] },
  { name: "public.review_invitations", columns: ["id", "project_id", "snapshot_token", "invited_email", "invited_by", "status", "due_at", "token_hash", "email_delivery_status", "accepted_by", "accepted_at", "created_at"], identity: false, userColumns: ["invited_by", "accepted_by"], key: ["id"] },
  { name: "public.notifications", columns: ["id", "user_id", "event_type", "project_id", "snapshot_token", "actor_id", "payload", "read_at", "created_at"], identity: true, userColumns, key: ["id"], jsonColumns: ["payload"] },
  { name: "public.project_attachments", columns: ["id", "project_id", "snapshot_token", "owner_id", "uploaded_by", "object_key", "original_name", "mime_type", "byte_size", "created_at", "delete_requested_at", "delete_requested_by"], identity: false, userColumns, key: ["id"] },
  { name: "public.support_requests", columns: ["id", "requester_id", "subject", "body", "status", "created_at", "updated_at"], identity: false, userColumns: ["requester_id"], key: ["id"] },
  { name: "private.account_states", columns: ["user_id", "suspended", "reason", "changed_by", "changed_at"], identity: false, userColumns: ["user_id", "changed_by"], userPrimary: "user_id", key: ["user_id"] },
  { name: "private.platform_roles", columns: ["user_id", "role", "granted_by", "created_at"], identity: false, userColumns: ["user_id", "granted_by"], userPrimary: "user_id", key: ["user_id"] },
  { name: "private.audit_events", columns: ["id", "actor_id", "action", "target_type", "target_id", "payload", "created_at"], identity: true, userColumns: ["actor_id"], key: ["id"], jsonColumns: ["payload"] },
  { name: "private.app_errors", columns: ["id", "actor_id", "request_id", "source", "message", "context", "created_at"], identity: true, userColumns: ["actor_id"], key: ["id"], jsonColumns: ["context"] },
  { name: "private.rate_limits", columns: ["bucket", "subject_id", "window_started_at", "count"], identity: false, userColumns: ["subject_id"], key: ["bucket", "subject_id", "window_started_at"] },
  { name: "private.application_backups", columns: ["id", "version", "sha256", "manifest", "created_by", "created_at"], identity: false, userColumns: ["created_by"], key: ["id"], jsonColumns: ["manifest"] },
  { name: "private.account_deletion_requests", columns: ["id", "user_id", "confirmation", "reason", "status", "created_at", "updated_at"], identity: false, userColumns: ["user_id"], key: ["id"] },
  { name: "private.profile_avatar_tombstones", columns: ["user_id", "object_key", "created_at"], identity: false, userColumns: ["user_id"], key: ["object_key"] },
];

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableSql(name: string) {
  return name.split(".").map(quoteIdentifier).join(".");
}

function jsonParameter(value: unknown, column: string, spec: TableSpec) {
  if (value === undefined) return null;
  if (spec.jsonColumns?.includes(column)) return JSON.stringify(value);
  if (column === "token_hash" && typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) throw new Error("Backup token hash is not valid bytea.");
    return Buffer.from(hex, "hex");
  }
  return value;
}

function mappedUserValue(value: unknown, sourceId: string, authIdMap: Record<string, string>) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value !== "string") throw new Error(`User reference ${sourceId} is not a string.`);
  const mapped = authIdMap[value];
  if (!mapped) throw new Error(`Missing auth-ID mapping for ${value}.`);
  return mapped;
}

function mapRow(row: BackupRow, spec: TableSpec, authIdMap: Record<string, string>) {
  const mapped = { ...row };
  for (const column of spec.userColumns ?? []) {
    if (column === "mentioned_user_ids") {
      const ids = row[column];
      mapped[column] = ids === null || ids === undefined ? [] : Array.isArray(ids) ? ids.map((id) => mappedUserValue(id, String(id), authIdMap)) : (() => { throw new Error("mentioned_user_ids must be an array."); })();
    } else if (column in row) {
      mapped[column] = mappedUserValue(row[column], String(row[column]), authIdMap);
    }
  }
  if (spec.userPrimary && spec.userPrimary in row) mapped[spec.userPrimary] = mappedUserValue(row[spec.userPrimary], String(row[spec.userPrimary]), authIdMap);
  return mapped;
}

function collectAuthReferences(document: BackupDocument) {
  const references = new Set<string>();
  for (const spec of tableSpecs) {
    for (const row of document.tables[spec.name]) {
      for (const column of spec.userColumns ?? []) {
        const value = row[column];
        if (column === "mentioned_user_ids" && Array.isArray(value)) {
          for (const id of value) if (typeof id === "string") references.add(id);
        } else if (typeof value === "string") references.add(value);
      }
      if (spec.userPrimary && typeof row[spec.userPrimary] === "string") references.add(row[spec.userPrimary] as string);
    }
  }
  return [...references];
}

function validateRows(document: BackupDocument) {
  for (const spec of tableSpecs) {
    const seen = new Set<string>();
    for (const row of document.tables[spec.name]) {
      const unknown = Object.keys(row).filter((column) => !spec.columns.includes(column));
      if (unknown.length) throw new Error(`Backup table ${spec.name} has unsupported columns: ${unknown.join(", ")}.`);
      for (const column of spec.columns) if (!(column in row)) throw new Error(`Backup table ${spec.name} row is missing ${column}.`);
      const key = spec.key.map((column) => JSON.stringify(row[column])).join("|");
      if (seen.has(key)) throw new Error(`Backup table ${spec.name} contains duplicate key ${key}.`);
      seen.add(key);
    }
  }
}

async function assertEmpty(executor: RestoreExecutor) {
  for (const spec of tableSpecs) {
    const result = await executor.query<{ count: number | string }>(`select count(*)::int as count from ${tableSql(spec.name)}`);
    if (Number(result.rows[0]?.count ?? 0) !== 0) throw new Error(`Restore target table ${spec.name} is not empty.`);
  }
}

async function assertMappedAuthUsers(executor: RestoreExecutor, references: string[], authIdMap: Record<string, string>) {
  for (const sourceId of references) {
    const targetId = authIdMap[sourceId];
    if (!targetId) throw new Error(`Missing auth-ID mapping for ${sourceId}.`);
    const result = await executor.query<{ id: string }>("select id::text as id from auth.users where id=$1::uuid", [targetId]);
    if (!result.rows.length) throw new Error(`Mapped auth user ${targetId} does not exist in the isolated target.`);
  }
}

function insertSql(spec: TableSpec, row: BackupRow) {
  const columns = spec.columns.map(quoteIdentifier).join(",");
  const placeholders = spec.columns.map((_, index) => `$${index + 1}`).join(",");
  const override = spec.identity ? " overriding system value" : "";
  return `insert into ${tableSql(spec.name)} (${columns})${override} values (${placeholders})`;
}

export type RestoreOptions = {
  targetKind: "isolated";
  authIdMap: Record<string, string>;
  allowExisting?: false;
};

export type RestoreResult = {
  schema: string;
  rows: Record<string, number>;
};

export async function restoreBackupDocument(executor: RestoreExecutor, input: unknown, options: RestoreOptions): Promise<RestoreResult> {
  validateBackupDocument(input);
  const document = input;
  if (options.targetKind !== "isolated") throw new Error("Logical restore is permitted only into an isolated target.");
  if (options.allowExisting) throw new Error("Destructive restore is disabled; target must be empty.");
  if (!options.authIdMap || typeof options.authIdMap !== "object") throw new Error("An explicit auth-ID mapping is required.");
  validateRows(document);
  const references = collectAuthReferences(document);
  await assertEmpty(executor);
  await assertMappedAuthUsers(executor, references, options.authIdMap);

  const restored: Record<string, number> = {};
  await executor.exec("begin");
  try {
    // Restore into an isolated target without replaying application side-effect
    // triggers (for example, comment-to-notification). Internal foreign-key
    // triggers remain enabled, so related IDs are still checked by the target.
    for (const spec of tableSpecs) await executor.exec(`alter table ${tableSql(spec.name)} disable trigger user`);
    for (const spec of tableSpecs) {
      const insert = insertSql(spec, {});
      let count = 0;
      for (const sourceRow of document.tables[spec.name]) {
        const row = mapRow(sourceRow, spec, options.authIdMap);
        const params = spec.columns.map((column) => jsonParameter(row[column], column, spec));
        await executor.query(insert, params);
        count += 1;
      }
      restored[spec.name] = count;
    }
    for (const spec of tableSpecs) await executor.exec(`alter table ${tableSql(spec.name)} enable trigger user`);
    for (const spec of tableSpecs.filter((item) => item.identity)) {
      await executor.query(`select setval(pg_get_serial_sequence('${spec.name}', 'id'), coalesce((select max("id") from ${tableSql(spec.name)}), 0) + 1, false)`);
    }
    await executor.exec("commit");
  } catch (error) {
    await executor.exec("rollback");
    throw error;
  }
  for (const spec of tableSpecs) {
    const result = await executor.query<{ count: number | string }>(`select count(*)::int as count from ${tableSql(spec.name)}`);
    const count = Number(result.rows[0]?.count ?? 0);
    if (count !== restored[spec.name]) throw new Error(`Restore count mismatch for ${spec.name}.`);
  }
  return { schema: document.schema, rows: restored };
}

export { tableSpecs as restoreTableSpecs };
