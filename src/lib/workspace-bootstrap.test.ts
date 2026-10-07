import assert from "node:assert/strict";
import test from "node:test";
import { withPersonalWorkspaceRetry } from "./supabase/repository";

test("personal workspace bootstrap retries one known unique conflict", async () => {
  let calls = 0;
  const workspace = await withPersonalWorkspaceRetry(async () => {
    calls += 1;
    return calls === 1
      ? { data: null, error: { code: "23505", message: "workspaces_one_personal_per_owner" } }
      : { data: "workspace-1", error: null };
  });
  assert.equal(workspace, "workspace-1");
  assert.equal(calls, 2);
});

test("personal workspace bootstrap does not retry unrelated errors", async () => {
  let calls = 0;
  await assert.rejects(
    () => withPersonalWorkspaceRetry(async () => {
      calls += 1;
      return { data: null, error: { code: "42501", message: "permission denied" } };
    }),
    /permission denied/,
  );
  assert.equal(calls, 1);
});

test("personal workspace bootstrap does not retry another owner uniqueness error", async () => {
  let calls = 0;
  await assert.rejects(
    () => withPersonalWorkspaceRetry(async () => {
      calls += 1;
      return { data: null, error: { code: "23505", message: "duplicate key owner_id_other_constraint" } };
    }),
    /owner_id_other_constraint/,
  );
  assert.equal(calls, 1);
});
