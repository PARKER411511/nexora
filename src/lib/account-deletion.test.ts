import assert from "node:assert/strict";
import test from "node:test";
import {
  completeAccountDeletionWithProvider,
  type AccountDeletionProvider,
} from "./account-deletion";

type FakeOptions = {
  ownership?: Record<string, unknown>;
  removeError?: boolean;
  authError?: boolean;
  completeError?: boolean;
};

type FakeProvider = AccountDeletionProvider & {
  calls: string[];
  writes: string[];
};

function query(data: unknown = [], error: { message?: string } | null = null) {
  const promise = Promise.resolve({ data, error });
  return Object.assign(promise, {
    eq() {
      return this;
    },
    in() {
      return this;
    },
  });
}

function provider(options: FakeOptions = {}): FakeProvider {
  const calls: string[] = [];
  const writes: string[] = [];
  const fake = {
    calls,
    writes,
    rpc(name: string) {
      calls.push(name);
      if (name === "nexora_claim_account_deletion") return Promise.resolve({ data: true, error: null });
      if (name === "nexora_account_deletion_preflight") return Promise.resolve({ data: true, error: null });
      if (name === "nexora_storage_verify_deletion_manifest") return Promise.resolve({ data: options.ownership ?? { ok: true, untracked: 0, unowned: 0 }, error: null });
      if (name === "nexora_storage_object_exists") return Promise.resolve({ data: false, error: null });
      if (name === "nexora_storage_owned_object_count") return Promise.resolve({ data: 0, error: null });
      if (name === "nexora_release_account_deletion") return Promise.resolve({ data: true, error: null });
      if (name === "nexora_complete_account_deletion_request") return Promise.resolve({ data: !options.completeError, error: options.completeError ? { message: "record failed" } : null });
      return Promise.resolve({ data: [], error: null });
    },
    from(table: string) {
      return {
        select() {
          return query(table === "workspaces" || table === "projects" ? [] : []);
        },
        update() {
          writes.push(table);
          return query(true);
        },
        delete() {
          writes.push(table);
          return query(true);
        },
      };
    },
    storage: {
      from() {
        return {
          remove() {
            calls.push("storage.remove");
            return Promise.resolve({ data: options.removeError ? null : [], error: options.removeError ? { message: "remove failed" } : null });
          },
        };
      },
    },
    auth: {
      admin: {
        deleteUser() {
          calls.push("auth.deleteUser");
          return Promise.resolve({ data: null, error: options.authError ? { message: "auth failed" } : null });
        },
      },
    },
  } as unknown as FakeProvider;
  return fake;
}

const userId = "00000000-0000-0000-0000-000000000001";
const avatar = { bucket: "nexora-profile-avatars", object_key: `${userId}/avatar`, kind: "avatar" as const };

test("deletion completes and records durable completion after Auth", async () => {
  const fake = provider();
  const result = await completeAccountDeletionWithProvider(userId, fake, { readManifest: async () => [avatar] });
  assert.equal(result.status, "completed");
  assert.equal(fake.calls.filter((call) => call === "nexora_account_deletion_preflight").length, 2);
  assert.ok(fake.calls.includes("nexora_storage_verify_deletion_manifest"));
  assert.ok(fake.calls.includes("auth.deleteUser"));
  assert.ok(!fake.calls.includes("nexora_complete_account_deletion_request"));
  assert.ok(!fake.calls.includes("nexora_release_account_deletion"));
});

test("an orphaned owned object cannot be masked by a short manifest", async () => {
  const fake = provider({ ownership: { ok: false, untracked: 1, unowned: 0 } });
  await assert.rejects(
    completeAccountDeletionWithProvider(userId, fake, { readManifest: async () => [avatar] }),
    /unregistered storage object/,
  );
  assert.ok(fake.calls.includes("nexora_release_account_deletion"));
  assert.ok(!fake.calls.includes("storage.remove"));
  assert.deepEqual(fake.writes, []);
});

test("cleanup failure releases processing state and leaves metadata intact", async () => {
  const fake = provider({ removeError: true });
  await assert.rejects(
    completeAccountDeletionWithProvider(userId, fake, { readManifest: async () => [avatar] }),
    /could not remove/,
  );
  assert.ok(fake.calls.includes("nexora_release_account_deletion"));
  assert.deepEqual(fake.writes, []);
  assert.ok(!fake.calls.includes("auth.deleteUser"));
});

test("Auth failure remains retryable and never reports completed", async () => {
  const fake = provider({ authError: true });
  await assert.rejects(
    completeAccountDeletionWithProvider(userId, fake, { readManifest: async () => [avatar] }),
    /Auth rejected/,
  );
  assert.ok(fake.calls.includes("nexora_release_account_deletion"));
  assert.ok(!fake.calls.includes("nexora_complete_account_deletion_request"));
});

test("Auth success is completed even when the cascaded request row cannot be updated", async () => {
  const fake = provider({ completeError: true });
  const result = await completeAccountDeletionWithProvider(userId, fake, { readManifest: async () => [] });
  assert.equal(result.status, "completed");
  assert.ok(fake.calls.includes("auth.deleteUser"));
  assert.ok(!fake.calls.includes("nexora_complete_account_deletion_request"));
  assert.ok(!fake.calls.includes("nexora_release_account_deletion"));
});

test("team storage owner cannot be deleted before ownership transfer", async () => {
  const fake = provider();
  await assert.rejects(
    completeAccountDeletionWithProvider(userId, fake, {
      readManifest: async () => [{ ...avatar, bucket: "nexora-private", object_key: "team/file", kind: "attachment", workspace_id: "workspace-1", workspace_owner_id: userId, workspace_personal: false }],
    }),
    /transfer team workspace ownership/,
  );
  assert.ok(!fake.calls.includes("storage.remove"));
  assert.ok(!fake.calls.includes("auth.deleteUser"));
});

test("a team transfer can be retried after Auth failure", async () => {
  const fake = provider({ authError: true });
  const baseRpc = fake.rpc.bind(fake);
  (fake as unknown as { rpc: AccountDeletionProvider["rpc"] }).rpc = (name, args) => {
    if (name === "nexora_storage_object_exists") { fake.calls.push(name); return Promise.resolve({ data: true, error: null }); }
    if (name === "nexora_storage_reassign_owner") { fake.calls.push(name); return Promise.resolve({ data: true, error: null }); }
    return baseRpc(name, args);
  };
  const teamFile = { ...avatar, bucket: "nexora-private", object_key: "team/file", kind: "attachment" as const, workspace_id: "workspace-1", workspace_owner_id: "00000000-0000-0000-0000-000000000002", workspace_personal: false };
  await assert.rejects(
    completeAccountDeletionWithProvider(userId, fake, { readManifest: async () => [teamFile] }),
    /Auth rejected/,
  );
  (fake.auth.admin as unknown as { deleteUser: AccountDeletionProvider["auth"]["admin"]["deleteUser"] }).deleteUser = () => {
    fake.calls.push("auth.deleteUser.retry");
    return Promise.resolve({ data: null, error: null });
  };
  const retried = await completeAccountDeletionWithProvider(userId, fake, { readManifest: async () => [teamFile] });
  assert.equal(retried.status, "completed");
  assert.ok(fake.calls.filter((call) => call === "nexora_storage_reassign_owner").length >= 2);
});
