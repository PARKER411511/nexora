import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { analyzeBrief, makeDefaultScope } from "./analyzer";
import {
  demoAnalyze,
  demoCreateChangeProposal,
  demoCreateChangeRequest,
  demoCreateProject,
  demoDecideChangeProposal,
  demoGetProject,
  demoGetReview,
  demoListProjects,
  demoInitializeWorkspace,
  demoLoadSampleProjects,
  demoResetSampleProjects,
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

test("demo seeds three fictional projects once and keeps existing projects", () => {
  const first = demoInitializeWorkspace();
  assert.equal(first.projects.length, 3);
  assert.equal(first.hasSamples, true);
  assert.equal(first.initialized, true);
  assert.equal(
    first.projects.filter((project) => project.status === "draft").length,
    1,
  );
  assert.equal(
    first.projects.filter((project) => project.status === "approved").length,
    2,
  );
  assert.ok(first.projects.every((project) => project.client.includes("Fictional")));
  assert.ok(
    first.projects
      .filter((project) => project.status === "approved")
      .every((project) => (project.reviewToken?.length ?? 0) >= 32),
  );
  const pending = first.projects.find((project) => project.title.includes("pending"));
  assert.ok(pending?.reviewToken);
  const pendingHistory = demoGetReview(pending!.reviewToken!);
  assert.equal(pendingHistory?.changeRequests[0]?.status, "proposed");
  assert.equal(pendingHistory?.changeRequests[0]?.proposals[0]?.status, "sent");

  const second = demoInitializeWorkspace();
  assert.equal(second.initialized, false);
  assert.deepEqual(
    second.projects.map((project) => project.id).sort(),
    first.projects.map((project) => project.id).sort(),
  );

  storage.removeItem("nexora-demo-state-v1");
  const recreated = demoCreateProject({
    title: "Existing user project",
    client: "Existing client",
    brief,
    analysis: demoAnalyze(brief),
    scope: makeDefaultScope(demoAnalyze(brief)),
  });
  const merged = demoLoadSampleProjects();
  assert.equal(merged.projects.length, 4);
  assert.ok(merged.projects.some((project) => project.id === recreated.id));
});

test("demo initialization preserves legacy state until samples are explicitly loaded", () => {
  const legacy = createProject();
  const before = storage.getItem("nexora-demo-state-v1");
  const initialized = demoInitializeWorkspace();
  assert.equal(initialized.initialized, false);
  assert.equal(initialized.hasSamples, false);
  assert.deepEqual(initialized.projects.map((project) => project.id), [legacy.id]);
  assert.equal(storage.getItem("nexora-demo-state-v1"), before);

  const loaded = demoLoadSampleProjects();
  assert.equal(loaded.projects.length, 4);
  const repeated = demoLoadSampleProjects();
  assert.equal(repeated.projects.length, 4);
  assert.deepEqual(
    repeated.projects.map((project) => project.id).sort(),
    loaded.projects.map((project) => project.id).sort(),
  );
});

test("demo reset rotates sample links, recovers corrupt state, and preserves other storage", () => {
  const before = demoInitializeWorkspace();
  const oldReviewToken = before.projects.find((project) => project.status === "approved")!.reviewToken!;
  storage.setItem("unrelated-site-setting", "keep me");
  const user = createProject();
  const after = demoResetSampleProjects();
  assert.equal(after.projects.length, 3);
  assert.equal(storage.getItem("unrelated-site-setting"), "keep me");
  assert.equal(demoGetReview(oldReviewToken), null);
  assert.equal(demoGetProject(user.id), null);
  assert.notEqual(
    after.projects.map((project) => project.id).sort().join(","),
    before.projects.map((project) => project.id).sort().join(","),
  );

  storage.setItem("nexora-demo-state-v1", "{broken");
  const recovered = demoResetSampleProjects();
  assert.equal(recovered.projects.length, 3);
  assert.equal(demoListProjects().length, 3);
});

test("demo failed reset save leaves the existing state untouched", () => {
  const before = demoInitializeWorkspace();
  const raw = storage.getItem("nexora-demo-state-v1");
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.throws(() => demoResetSampleProjects(), DemoStorageError);
  storage.setItem = originalSetItem;
  assert.equal(storage.getItem("nexora-demo-state-v1"), raw);
  assert.deepEqual(
    demoListProjects().map((project) => project.id).sort(),
    before.projects.map((project) => project.id).sort(),
  );
});
