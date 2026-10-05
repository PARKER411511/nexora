import assert from "node:assert/strict";
import test from "node:test";

import { safeNextPath } from "./supabase/auth";

test("safeNextPath preserves valid same-site destinations", () => {
  assert.equal(
    safeNextPath("/review/abc123?next=%2Fworkspace#comments"),
    "/review/abc123?next=%2Fworkspace#comments",
  );
  assert.equal(
    safeNextPath("/workspace/projects/abc"),
    "/workspace/projects/abc",
  );
});

test("safeNextPath rejects external and ambiguous URL destinations", () => {
  const unsafe = [
    "https://evil.example/login",
    "//evil.example/login",
    "/\\\\evil.example/login",
    "/workspace/\u0000",
    "/workspace/%2e%2e/auth/sign-in",
    "/foo/..//evil.example",
  ];

  for (const value of unsafe)
    assert.equal(safeNextPath(value), "/workspace", `unsafe path: ${value}`);
});
