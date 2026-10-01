import type { Project, ProjectHistory, ProjectResponse } from "./types";

export type OverviewActivityKind =
  "project" | "response" | "change_request" | "proposal";

export type OverviewActivity = {
  id: string;
  projectId: string;
  projectTitle: string;
  kind: OverviewActivityKind;
  label: string;
  detail: string;
  occurredAt: string;
  href: string;
  tone?: "attention" | "positive";
};

export type WorkspaceOverview = {
  counts: {
    total: number;
    drafts: number;
    awaitingReview: number;
    approved: number;
  };
  recentProjects: Project[];
  activities: OverviewActivity[];
};

const changesHref = (projectId: string) =>
  `/workspace/projects/${projectId}?tab=changes`;

function responseActivity(
  project: Project,
  response: ProjectResponse,
): OverviewActivity {
  const isApproval = response.action === "approval";
  return {
    id: `${project.id}:response:${response.id}`,
    projectId: project.id,
    projectTitle: project.title,
    kind: "response",
    label: isApproval ? "Scope approved" : "Client feedback",
    detail: isApproval
      ? `${response.name} approved the shared scope.`
      : `${response.name} left feedback on the shared scope.`,
    occurredAt: response.createdAt,
    href: changesHref(project.id),
    tone: isApproval ? "positive" : undefined,
  };
}

export function buildWorkspaceOverview(
  projects: Project[],
  histories: Record<string, ProjectHistory> = {},
): WorkspaceOverview {
  const counts = {
    total: projects.length,
    drafts: projects.filter((project) => project.status === "draft").length,
    awaitingReview: projects.filter(
      (project) =>
        project.status === "shared" || project.status === "changes_requested",
    ).length,
    approved: projects.filter((project) => project.status === "approved")
      .length,
  };

  const activities: OverviewActivity[] = [];
  for (const project of projects) {
    activities.push({
      id: `${project.id}:created`,
      projectId: project.id,
      projectTitle: project.title,
      kind: "project",
      label: "Project created",
      detail: `${project.client} brief saved in the workspace.`,
      occurredAt: project.createdAt,
      href: `/workspace/projects/${project.id}`,
    });

    const history = histories[project.id];
    if (history) {
      activities.push(
        ...history.responses.map((response) =>
          responseActivity(project, response),
        ),
      );

      for (const request of history.changeRequests) {
        const requestNeedsAttention =
          request.status === "open" || request.status === "proposed";
        activities.push({
          id: `${project.id}:request:${request.id}`,
          projectId: project.id,
          projectTitle: project.title,
          kind: "change_request",
          label: "Change request",
          detail: `${request.title} · ${request.requesterName}`,
          occurredAt: request.createdAt,
          href: changesHref(project.id),
          tone: requestNeedsAttention ? "attention" : undefined,
        });

        for (const proposal of request.proposals) {
          const proposalNeedsAttention = proposal.status === "sent";
          activities.push({
            id: `${project.id}:proposal:${proposal.id}:sent`,
            projectId: project.id,
            projectTitle: project.title,
            kind: "proposal",
            label: proposalNeedsAttention
              ? "Proposal awaiting decision"
              : "Change proposal sent",
            detail: `${proposal.title} · ${proposal.currency} ${proposal.priceAdjustment}`,
            occurredAt: proposal.createdAt,
            href: changesHref(project.id),
            tone: proposalNeedsAttention ? "attention" : undefined,
          });

          if (proposal.decidedAt) {
            activities.push({
              id: `${project.id}:proposal:${proposal.id}:decision`,
              projectId: project.id,
              projectTitle: project.title,
              kind: "proposal",
              label:
                proposal.status === "accepted"
                  ? "Change proposal accepted"
                  : "Change proposal declined",
              detail: proposal.decidedBy
                ? `${proposal.decidedBy} recorded the decision.`
                : "A decision was recorded for this proposal.",
              occurredAt: proposal.decidedAt,
              href: changesHref(project.id),
              tone: proposal.status === "accepted" ? "positive" : undefined,
            });
          }
        }
      }
    }

    const hasConcreteUpdate = activities.some(
      (activity) =>
        activity.projectId === project.id &&
        activity.occurredAt === project.updatedAt &&
        activity.kind !== "project",
    );
    if (project.updatedAt !== project.createdAt && !hasConcreteUpdate) {
      activities.push({
        id: `${project.id}:updated:${project.updatedAt}`,
        projectId: project.id,
        projectTitle: project.title,
        kind: "project",
        label: "Project updated",
        detail: "The latest project activity was saved.",
        occurredAt: project.updatedAt,
        href: `/workspace/projects/${project.id}`,
      });
    }
  }

  const activityPriority: Record<OverviewActivityKind, number> = {
    project: 1,
    response: 2,
    change_request: 3,
    proposal: 4,
  };
  activities.sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) ||
      activityPriority[b.kind] - activityPriority[a.kind] ||
      b.id.localeCompare(a.id),
  );

  return {
    counts,
    recentProjects: [...projects]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 4),
    activities: activities.slice(0, 8),
  };
}
