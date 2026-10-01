import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeBrief, makeDefaultScope } from "./analyzer";

const testDirectory = mkdtempSync(join(tmpdir(), "nexora-db-test-"));
process.env.NEXORA_DB_PATH = join(testDirectory, "nexora-test.db");
let databaseModule: typeof import("./db");
before(async () => {
  databaseModule = await import("./db");
});
after(() => {
  databaseModule.closeDatabase();
  rmSync(testDirectory, { recursive: true, force: true });
});

function fixture() {
  const analysis = analyzeBrief(
    "A small studio needs a responsive website with a contact form and clear services.",
  );
  return {
    title: `Test ${Date.now()}-${Math.random()}`,
    client: "Test client",
    brief:
      "A small studio needs a responsive website with a contact form and clear services.",
    analysis,
    scope: makeDefaultScope(analysis),
  };
}

test("approval locks a project and repeat approval is idempotent", () => {
  const project = databaseModule.createProject(fixture());
  const shared = databaseModule.shareProject(project.id);
  const approved = databaseModule.reviewComment(shared.reviewToken!, {
    name: "Alex",
    comment: "Approved as written.",
    action: "approval",
  });
  assert.equal(approved.status, "approved");
  const repeated = databaseModule.reviewComment(shared.reviewToken!, {
    name: "Alex",
    comment: "Approved again.",
    action: "approval",
  });
  assert.equal(repeated.status, "approved");
  assert.throws(
    () => databaseModule.updateProject(project.id, fixture()),
    /locked/,
  );
});

test("resharing revokes stale snapshots before a new approval", () => {
  const project = databaseModule.createProject(fixture());
  const first = databaseModule.shareProject(project.id);
  databaseModule.reviewComment(first.reviewToken!, {
    name: "Alex",
    comment: "Please adjust the contact path.",
    action: "feedback",
  });
  const second = databaseModule.shareProject(project.id);
  assert.equal(databaseModule.getReview(first.reviewToken!), null);
  assert.equal(
    databaseModule.getReview(second.reviewToken!)?.reviewToken,
    second.reviewToken,
  );
});

test("history keeps revoked feedback tied to its revoked snapshot", () => {
  const project = databaseModule.createProject(fixture());
  const first = databaseModule.shareProject(project.id);
  databaseModule.reviewComment(first.reviewToken!, {
    name: "Alex",
    comment: "Please clarify the contact step.",
    action: "feedback",
  });
  const second = databaseModule.shareProject(project.id);
  databaseModule.reviewComment(second.reviewToken!, {
    name: "Alex",
    comment: "Approved.",
    action: "approval",
  });
  const history = databaseModule.getProjectHistory(project.id);
  assert.equal(
    history.responses.find((item) => item.token === first.reviewToken)
      ?.snapshotStatus,
    "revoked",
  );
  assert.equal(
    history.responses.find((item) => item.token === second.reviewToken)
      ?.snapshotStatus,
    "approved",
  );
});

test("saving edits revokes the current review token before reshare", () => {
  const project = databaseModule.createProject(fixture());
  const first = databaseModule.shareProject(project.id);
  databaseModule.updateProject(project.id, fixture());
  assert.equal(databaseModule.getReview(first.reviewToken!), null);
});

test("unchanged saves preserve the current review snapshot", () => {
  const project = databaseModule.createProject(fixture());
  const shared = databaseModule.shareProject(project.id);
  const saved = databaseModule.updateProject(project.id, {
    title: project.title,
    client: project.client,
    brief: project.brief,
    analysis: project.analysis,
    scope: project.scope,
  });
  assert.equal(saved.reviewToken, shared.reviewToken);
  assert.equal(saved.status, "shared");
  assert.equal(
    databaseModule.getReview(shared.reviewToken!)?.reviewToken,
    shared.reviewToken,
  );
});

test("approved baseline supports independent request, proposal, and idempotent decision", () => {
  const project = databaseModule.createProject(fixture());
  const shared = databaseModule.shareProject(project.id);
  const before = databaseModule.getReview(shared.reviewToken!)!;
  const approved = databaseModule.reviewComment(shared.reviewToken!, {
    name: "Alex",
    comment: "Approved as written.",
    action: "approval",
  });
  assert.equal(approved.status, "approved");
  const request = databaseModule.createChangeRequest(shared.reviewToken!, {
    requesterName: "Alex",
    title: "Add class booking",
    details: "We need a booking pathway for new members.",
  });
  const requestId = request.changeRequests[0].id;
  const secondRequest = databaseModule.createChangeRequest(
    shared.reviewToken!,
    {
      requesterName: "Alex",
      title: "Add FAQ",
      details: "Please add a short FAQ section.",
    },
  );
  assert.equal(secondRequest.changeRequests.length, 2);
  const history = databaseModule.createChangeProposal(project.id, {
    requestId,
    title: "Class booking flow",
    details: "Add booking link and confirmation state.",
    affectedDeliverables: ["Classes page", "Contact pathway"],
    priceAdjustment: 350,
    currency: "USD",
    timelineImpact: "Adds 3 working days",
    rationale: "Booking requires a new integration path.",
  });
  const proposal = history.changeRequests.find((item) => item.id === requestId)!
    .proposals[0];
  assert.equal(proposal.status, "sent");
  const decided = databaseModule.decideChangeProposal(shared.reviewToken!, {
    proposalId: proposal.id,
    decision: "accepted",
    name: "Alex",
    comment: "Approved the addition.",
  });
  assert.equal(
    decided.changeRequests.find((item) => item.id === requestId)?.status,
    "accepted",
  );
  assert.deepEqual(decided.scope, before.scope);
  const repeated = databaseModule.decideChangeProposal(shared.reviewToken!, {
    proposalId: proposal.id,
    decision: "accepted",
    name: "Alex",
    comment: "Sent twice.",
  });
  assert.equal(
    repeated.changeRequests.find((item) => item.id === requestId)?.proposals[0]
      .status,
    "accepted",
  );
  assert.throws(
    () =>
      databaseModule.decideChangeProposal(shared.reviewToken!, {
        proposalId: proposal.id,
        decision: "declined",
        name: "Alex",
        comment: "No longer.",
      }),
    /different decision/,
  );
});

test("change proposals cannot cross projects or mutate an approved scope", () => {
  const first = databaseModule.createProject(fixture());
  const firstShare = databaseModule.shareProject(first.id);
  databaseModule.reviewComment(firstShare.reviewToken!, {
    name: "Alex",
    comment: "Approved.",
    action: "approval",
  });
  const request = databaseModule.createChangeRequest(firstShare.reviewToken!, {
    requesterName: "Alex",
    title: "Add search",
    details: "Search the work list.",
  });
  const second = databaseModule.createProject(fixture());
  const secondShare = databaseModule.shareProject(second.id);
  databaseModule.reviewComment(secondShare.reviewToken!, {
    name: "Alex",
    comment: "Approved.",
    action: "approval",
  });
  assert.throws(
    () =>
      databaseModule.createChangeProposal(second.id, {
        requestId: request.changeRequests[0].id,
        title: "Cross project",
        details: "Should fail.",
        affectedDeliverables: ["Search"],
        priceAdjustment: 1,
        currency: "USD",
        timelineImpact: "One day",
        rationale: "Test.",
      }),
    /not found/,
  );
  assert.throws(
    () => databaseModule.updateProject(first.id, fixture()),
    /locked/,
  );
});
