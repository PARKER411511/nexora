import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { analyzeBrief, makeDefaultScope } from "./analyzer";
import {
  demoAnalyze,
  demoCreateChangeProposal,
  demoCreateChangeRequest,
  demoCreateProject,
  demoDecideChangeProposal,
  demoGetReview,
  demoListProjects,
  demoReviewComment,
  demoShareProject,
  demoUpdateProject,
  DemoStorageError,
} from "./demo-store";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

const brief =
  "A neighborhood gym needs a responsive site with class booking, membership details, and a contact path.";

function createProject() {
  const analysis = demoAnalyze(brief);
  return demoCreateProject({
    title: "Northstar Gym",
    client: "Northstar",
    brief,
    analysis,
    scope: makeDefaultScope(analysis),
  });
}

beforeEach(() => storage.clear());

test("demo rejects oversized review input and stale review links", () => {
  const project = createProject();
  const shared = demoShareProject(project.id);
  assert.throws(
    () =>
      demoReviewComment(shared.project.reviewToken!, {
        name: "",
        comment: "Please clarify the booking step.",
        action: "feedback",
      }),
    DemoStorageError,
  );
  assert.throws(
    () =>
      demoReviewComment(shared.project.reviewToken!, {
        name: "Client",
        comment: "x".repeat(4001),
        action: "feedback",
      }),
    DemoStorageError,
  );
  demoUpdateProject(project.id, {
    ...project,
    title: "Northstar Gym refresh",
  });
  assert.equal(demoGetReview(shared.project.reviewToken!), null);
});

test("demo preserves the approved scope through change proposal decisions", () => {
  const project = createProject();
  const shared = demoShareProject(project.id);
  const approved = demoReviewComment(shared.project.reviewToken!, {
    name: "Client",
    comment: "Approved as written.",
    action: "approval",
  });
  const request = demoCreateChangeRequest(shared.project.reviewToken!, {
    requesterName: "Client",
    title: "Add class booking",
    details: "Connect the schedule to a booking provider.",
  });
  const requestId = request.changeRequests[0].id;
  const history = demoCreateChangeProposal(project.id, {
    requestId,
    title: "Booking provider connection",
    details: "Add booking links and confirmation states.",
    affectedDeliverables: ["Classes page"],
    priceAdjustment: 350,
    currency: "USD",
    timelineImpact: "Adds three working days",
    rationale: "The provider requires a separate integration path.",
  });
  const proposal = history.changeRequests[0].proposals[0];
  assert.throws(
    () =>
      demoDecideChangeProposal(shared.project.reviewToken!, {
        proposalId: proposal.id,
        decision: "accepted",
        name: "Client",
        comment: "x".repeat(4001),
      }),
    DemoStorageError,
  );
  const decided = demoDecideChangeProposal(shared.project.reviewToken!, {
    proposalId: proposal.id,
    decision: "accepted",
    name: "Client",
    comment: "Approved the addition.",
  });
  assert.deepEqual(decided.scope, approved.scope);
  assert.equal(decided.changeRequests[0].status, "accepted");
  const repeated = demoDecideChangeProposal(shared.project.reviewToken!, {
    proposalId: proposal.id,
    decision: "accepted",
    name: "Client",
    comment: "Submitted again.",
  });
  assert.equal(repeated.changeRequests[0].proposals[0].status, "accepted");
});

test("demo rejects duplicate and cross-referenced stored records", () => {
  const project = createProject();
  const shared = demoShareProject(project.id);
  const raw = JSON.parse(storage.getItem("nexora-demo-state-v1")!);
  raw.snapshots.push(raw.snapshots[0]);
  storage.setItem("nexora-demo-state-v1", JSON.stringify(raw));
  assert.throws(() => demoListProjects(), DemoStorageError);

  storage.clear();
  const second = createProject();
  const secondShared = demoShareProject(second.id);
  const invalid = JSON.parse(storage.getItem("nexora-demo-state-v1")!);
  invalid.snapshots[0].status = "approved";
  invalid.snapshots[0].project.status = "shared";
  storage.setItem("nexora-demo-state-v1", JSON.stringify(invalid));
  assert.throws(() => demoListProjects(), DemoStorageError);
  assert.equal(secondShared.project.id, second.id);
});