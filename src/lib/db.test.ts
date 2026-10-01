import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeBrief, makeDefaultScope } from "./analyzer";

const testDirectory = mkdtempSync(join(tmpdir(), "nexora-db-test-"));
process.env.NEXORA_DB_PATH = join(testDirectory, "nexora-test.db");
let databaseModule: typeof import("./db");
before(async () => { databaseModule = await import("./db"); });
after(() => { databaseModule.closeDatabase(); rmSync(testDirectory, { recursive: true, force: true }); });

function fixture() { const analysis = analyzeBrief("A small studio needs a responsive website with a contact form and clear services."); return { title: `Test ${Date.now()}-${Math.random()}`, client: "Test client", brief: "A small studio needs a responsive website with a contact form and clear services.", analysis, scope: makeDefaultScope(analysis) }; }

test("approval locks a project and repeat approval is idempotent", () => {
  const project = databaseModule.createProject(fixture()); const shared = databaseModule.shareProject(project.id); const approved = databaseModule.reviewComment(shared.reviewToken!, { name: "Alex", comment: "Approved as written.", action: "approval" });
  assert.equal(approved.status, "approved");
  const repeated = databaseModule.reviewComment(shared.reviewToken!, { name: "Alex", comment: "Approved again.", action: "approval" });
  assert.equal(repeated.status, "approved");
  assert.throws(() => databaseModule.updateProject(project.id, fixture()), /locked/);
});

test("resharing revokes stale snapshots before a new approval", () => {
  const project = databaseModule.createProject(fixture()); const first = databaseModule.shareProject(project.id); const second = databaseModule.shareProject(project.id);
  assert.equal(databaseModule.getReview(first.reviewToken!), null);
  assert.equal(databaseModule.getReview(second.reviewToken!)?.reviewToken, second.reviewToken);
});

test("saving edits revokes the current review token before reshare", () => {
  const project = databaseModule.createProject(fixture()); const first = databaseModule.shareProject(project.id);
  databaseModule.updateProject(project.id, fixture());
  assert.equal(databaseModule.getReview(first.reviewToken!), null);
});
