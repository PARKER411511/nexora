import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkspaceOverview } from "./workspace-overview";
import type { Project, ProjectHistory } from "./types";

const analysis = {
  mode: "local" as const,
  summary: "A useful summary.",
  audience: "Independent teams.",
  goals: ["Launch"],
  pages: ["Home"],
  needs: ["Content"],
  risks: ["Timing"],
  questions: ["Who approves?"],
};

function project(
  id: string,
  status: Project["status"],
  createdAt: string,
  updatedAt = createdAt,
): Project {
  return {
    id,
    title: `Project ${id}`,
    client: `Client ${id}`,
    brief: "A short brief.",
    analysis,
    scope: {
      deliverables: ["Site"],
      included: ["Responsive pages"],
      excluded: ["Copywriting"],
      milestones: [{ name: "Launch", detail: "Ship", timing: "Week 1" }],
      revisions: 2,
    },
    status,
    createdAt,
    updatedAt,
  };
}

describe("buildWorkspaceOverview", () => {
  it("counts statuses and builds recent project rows from persisted projects", () => {
    const projects = [
      project("draft", "draft", "2025-01-01T00:00:00.000Z"),
      project("shared", "shared", "2025-01-02T00:00:00.000Z"),
      project("changes", "changes_requested", "2025-01-03T00:00:00.000Z"),
      project("approved", "approved", "2025-01-04T00:00:00.000Z"),
    ];

    const overview = buildWorkspaceOverview(projects);

    assert.deepEqual(overview.counts, {
      total: 4,
      drafts: 1,
      awaitingReview: 2,
      approved: 1,
    });
    assert.deepEqual(
      overview.recentProjects.map((item) => item.id),
      ["approved", "changes", "shared", "draft"],
    );
    assert.equal(
      overview.activities.every((item) => item.kind === "project"),
      true,
    );
  });

  it("surfaces approval, feedback, pending proposals, and decisions with owner links", () => {
    const pending = project(
      "pending",
      "approved",
      "2025-01-01T00:00:00.000Z",
      "2025-01-06T00:00:00.000Z",
    );
    const history: ProjectHistory = {
      responses: [
        {
          id: 1,
          name: "Alex",
          comment: "Approved.",
          action: "approval",
          createdAt: "2025-01-02T00:00:00.000Z",
          token: "a".repeat(32),
          snapshotCreatedAt: "2025-01-01T00:00:00.000Z",
          snapshotStatus: "approved",
        },
      ],
      changeRequests: [
        {
          id: "request-1",
          projectId: pending.id,
          token: "b".repeat(32),
          requesterName: "Alex",
          title: "Add welcome flow",
          details: "Add a welcome email.",
          status: "proposed",
          createdAt: "2025-01-03T00:00:00.000Z",
          updatedAt: "2025-01-03T00:00:00.000Z",
          proposals: [
            {
              id: "proposal-1",
              requestId: "request-1",
              version: 1,
              title: "Add welcome flow",
              details: "Add the email flow.",
              affectedDeliverables: ["Email flow"],
              priceAdjustment: 480,
              currency: "USD",
              timelineImpact: "+1 week",
              rationale: "A new deliverable needs implementation time.",
              status: "sent",
              createdAt: "2025-01-04T00:00:00.000Z",
            },
          ],
        },
      ],
    };

    const overview = buildWorkspaceOverview([pending], {
      [pending.id]: history,
    });

    assert.deepEqual(
      overview.activities.map((item) => item.label),
      [
        "Project updated",
        "Proposal awaiting decision",
        "Change request",
        "Scope approved",
        "Project created",
      ],
    );
    const pendingActivity = overview.activities.find(
      (item) => item.label === "Proposal awaiting decision",
    );
    assert.equal(pendingActivity?.tone, "attention");
    assert.equal(
      pendingActivity?.href,
      "/workspace/projects/pending?tab=changes",
    );
  });
});
