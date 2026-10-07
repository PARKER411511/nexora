import type { AccountDeletionManifestItem } from "@/lib/supabase/repository";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type AccountDeletionResult =
  | { status: "pending"; message: string }
  | { status: "completed"; message: string };

type ProviderError = { message?: string } | null;
type ProviderResult<T = unknown> = PromiseLike<{ data: T | null; error: ProviderError }>;
type ProviderQuery = ProviderResult<unknown> & {
  eq(column: string, value: unknown): ProviderQuery;
  in(column: string, values: unknown[]): ProviderQuery;
};

/** The small provider surface keeps the worker testable without a hosted DB. */
export type AccountDeletionProvider = {
  rpc(name: string, args?: Record<string, unknown>): ProviderResult;
  from(table: string): {
    select(columns: string): ProviderQuery;
    update(values: Record<string, unknown>): ProviderQuery;
    delete(): ProviderQuery;
  };
  storage: { from(bucket: string): { remove(keys: string[]): ProviderResult } };
  auth: { admin: { deleteUser(userId: string): ProviderResult } };
};

export type AccountDeletionWorkerOptions = {
  /** Optional test/queue adapter. The default reads through the service RPC. */
  readManifest?: () => Promise<AccountDeletionManifestItem[]>;
};

function failure(message: string): Error {
  return new Error(`Account deletion paused: ${message}`);
}

function providerData<T>(value: unknown): T {
  return value as T;
}

async function removeObject(
  admin: AccountDeletionProvider,
  item: AccountDeletionManifestItem,
) {
  const result = await admin.storage.from(item.bucket).remove([item.object_key]);
  if (result.error) throw failure(`could not remove ${item.kind} storage object`);
  const check = await admin.rpc("nexora_storage_object_exists", {
    p_bucket: item.bucket,
    p_object_key: item.object_key,
  });
  if (check.error) throw failure("could not verify storage cleanup");
  if (check.data === true) throw failure("storage cleanup was not confirmed");
}

async function transferObject(
  admin: AccountDeletionProvider,
  item: AccountDeletionManifestItem,
  fromUserId: string,
) {
  if (!item.workspace_owner_id || !item.workspace_id)
    throw failure("a team attachment has no current workspace owner");
  const exists = await admin.rpc("nexora_storage_object_exists", {
    p_bucket: item.bucket,
    p_object_key: item.object_key,
  });
  if (exists.error) throw failure("could not inspect team storage ownership");
  if (exists.data !== true) return;
  const result = await admin.rpc("nexora_storage_reassign_owner", {
    p_bucket: item.bucket,
    p_object_key: item.object_key,
    p_from: fromUserId,
    p_to: item.workspace_owner_id,
    p_workspace_id: item.workspace_id,
  });
  if (result.error) throw failure("could not transfer team storage ownership");
  if (result.data !== true)
    throw failure("team storage ownership transfer was not confirmed");
}

async function readRows<T>(query: ProviderQuery, label: string) {
  const result = await query;
  if (result.error) throw failure(`could not read ${label}`);
  return providerData<T[]>(result.data ?? []);
}

async function requireWrite(query: ProviderQuery, label: string) {
  const response = await query;
  if (response.error) throw failure(`could not update ${label}`);
}

async function readServiceManifest(
  admin: AccountDeletionProvider,
  userId: string,
): Promise<AccountDeletionManifestItem[]> {
  const result = await admin.rpc("nexora_account_deletion_manifest", {
    p_user_id: userId,
  });
  if (result.error) throw failure("could not read the deletion manifest");
  return providerData<AccountDeletionManifestItem[]>(result.data ?? []);
}

/**
 * Completes a deletion request only when the server-only provider credential is
 * available. It removes personal blobs, transfers team blob ownership to the
 * workspace owner, de-identifies invitation provenance, and calls Auth admin
 * deletion. Any failed verification leaves the account and request retryable.
 */
export async function completeAccountDeletionWithProvider(
  userId: string,
  admin: AccountDeletionProvider,
  options: AccountDeletionWorkerOptions = {},
): Promise<AccountDeletionResult> {
  const claim = await admin.rpc("nexora_claim_account_deletion", {
    p_user_id: userId,
  });
  if (claim.error) throw failure("could not claim the deletion request");
  if (claim.data !== true)
    return {
      status: "pending",
      message: "A deletion request is already being processed or is no longer pending.",
    };

  let claimed = true;
  try {
    const preflight = await admin.rpc("nexora_account_deletion_preflight", {
      p_user_id: userId,
    });
    if (preflight.error || preflight.data !== true)
      throw failure("account ownership must be transferred before deletion");

    const manifest = await (options.readManifest?.() ??
      readServiceManifest(admin, userId));
    const unique = new Map<string, AccountDeletionManifestItem>();
    for (const item of manifest) {
      if (item.bucket && item.object_key)
        unique.set(`${item.bucket}:${item.object_key}`, item);
    }

    // Exact ownership is required. Comparing this count to manifest length
    // would let a missing registration hide an orphaned object.
    const ownership = await admin.rpc("nexora_storage_verify_deletion_manifest", {
      p_user_id: userId,
      p_manifest: [...unique.values()],
    });
    if (ownership.error)
      throw failure("could not verify provider storage ownership before cleanup");
    const ownershipResult = providerData<{
      ok?: boolean;
      untracked?: number;
      unowned?: number;
    }>(ownership.data ?? {});
    if (ownershipResult.ok !== true)
      throw failure(
        ownershipResult.untracked
          ? "an unregistered storage object needs reconciliation before deletion"
          : "the deletion manifest contains an object owned by another account",
      );

    for (const item of unique.values()) {
      const teamFile =
        item.kind === "attachment" &&
        item.workspace_id &&
        item.workspace_personal === false;
      if (teamFile) {
        if (item.workspace_owner_id === userId)
          throw failure("transfer team workspace ownership before deleting this account");
        await transferObject(admin, item, userId);
      } else await removeObject(admin, item);
    }

    const personalWorkspaces = await readRows<{ id: string }>(
      admin.from("workspaces").select("id").eq("owner_id", userId).eq("personal", true),
      "personal workspaces",
    );
    const personalWorkspaceIds = personalWorkspaces.map((workspace) => workspace.id);
    const ownedProjects = await readRows<{ id: string; workspace_id?: string | null }>(
      admin.from("projects").select("id,workspace_id").eq("owner_id", userId),
      "owned projects",
    );
    const personalProjectIds = ownedProjects
      .filter(
        (project) =>
          !project.workspace_id || personalWorkspaceIds.includes(project.workspace_id),
      )
      .map((project) => project.id);

    await requireWrite(
      admin
        .from("project_attachments")
        .update({ uploaded_by: null, delete_requested_by: null })
        .eq("uploaded_by", userId),
      "attachment provenance",
    );
    if (personalProjectIds.length > 0) {
      await requireWrite(
        admin.from("projects").delete().in("id", personalProjectIds),
        "personal projects",
      );
    }
    await requireWrite(
      admin.from("workspace_members").delete().eq("user_id", userId),
      "workspace membership",
    );
    // Revoke accepted/responded review invitations while the identity is
    // still bound, then de-identify the inviter while retaining team history.
    await requireWrite(
      admin
        .from("review_invitations")
        .update({ status: "revoked" })
        .eq("accepted_by", userId)
        .in("status", ["accepted", "responded"]),
      "accepted review invitations",
    );
    await requireWrite(
      admin
        .from("workspace_invites")
        .update({ invited_by: null })
        .eq("invited_by", userId),
      "workspace invite provenance",
    );
    await requireWrite(
      admin
        .from("review_invitations")
        .update({ invited_by: null })
        .eq("invited_by", userId),
      "review invite provenance",
    );
    if (personalWorkspaceIds.length > 0) {
      await requireWrite(
        admin.from("workspaces").delete().in("id", personalWorkspaceIds),
        "personal workspaces",
      );
    }

    const finalPreflight = await admin.rpc("nexora_account_deletion_preflight", {
      p_user_id: userId,
    });
    if (finalPreflight.error || finalPreflight.data !== true)
      throw failure("account ownership changed during deletion");
    const remainingOwnedObjects = await admin.rpc("nexora_storage_owned_object_count", {
      p_user_id: userId,
    });
    if (remainingOwnedObjects.error)
      throw failure("could not verify provider storage ownership");
    if (Number(remainingOwnedObjects.data ?? 0) > 0)
      throw failure("the account still owns storage objects");

    // The private request is intentionally ON DELETE CASCADE, so Auth success
    // is the durable completion boundary for this identity. Calling a
    // completion RPC after Auth would race that cascade and report a false
    // failure even though the account was deleted. Auth failure releases the
    // still-present processing request for retry.
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw failure("Supabase Auth rejected account deletion");
    claimed = false;
    return {
      status: "completed",
      message: "Your Nexora account and personal data were deleted.",
    };
  } catch (error) {
    if (claimed)
      await admin.rpc("nexora_release_account_deletion", { p_user_id: userId });
    throw error;
  }
}

export async function completeAccountDeletion(
  userId: string,
): Promise<AccountDeletionResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      status: "pending",
      message:
        "Deletion request recorded. Completion is pending the server-only Supabase Auth deletion worker credential.",
    };
  }
  return completeAccountDeletionWithProvider(
    userId,
    admin as unknown as AccountDeletionProvider,
  );
}
