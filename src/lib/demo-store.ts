"use client";

import { analyzeBrief, makeDefaultScope } from "./analyzer";
import {
  isValidBriefAnalysis,
  validateChangeProposalInput,
  validateChangeRequestInput,
  validateProjectInput,
} from "./validation";
import type {
  BriefAnalysis,
  ChangeProposal,
  ChangeRequest,
  Project,
  ProjectHistory,
  ProjectResponse,
  ReviewComment,
  ReviewSnapshot,
  Scope,
} from "./types";

const STORAGE_KEY = "nexora-demo-state-v1";

export type DemoSnapshot = {
  token: string;
  projectId: string;
  project: Project;
  createdAt: string;
  status: "shared" | "approved" | "revoked";
  comments: ReviewComment[];
};

export type DemoStateMetadata = {
  version: 1;
  sampleProjectIds: string[];
  seededAt: string;
};

export type DemoState = {
  version: 1;
  projects: Project[];
  snapshots: DemoSnapshot[];
  changeRequests: ChangeRequest[];
  metadata?: DemoStateMetadata;
};

export class DemoStorageError extends Error {}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function randomToken() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  }
  return `${randomId()}${randomId()}`.replaceAll("-", "");
}

function emptyState(): DemoState {
  return { version: 1, projects: [], snapshots: [], changeRequests: [] };
}

function storageAvailable() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function isStoredProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Project;
  try {
    validateProjectInput(project as unknown as Record<string, unknown>);
    return (
      typeof project.id === "string" &&
      ["draft", "shared", "changes_requested", "approved"].includes(
        project.status,
      ) &&
      typeof project.createdAt === "string" &&
      typeof project.updatedAt === "string"
    );
  } catch {
    return false;
  }
}

function isStoredComment(value: unknown): value is ReviewComment {
  if (!value || typeof value !== "object") return false;
  const comment = value as ReviewComment;
  return (
    Number.isInteger(comment.id) &&
    typeof comment.name === "string" &&
    comment.name.length <= 120 &&
    typeof comment.comment === "string" &&
    comment.comment.length <= 4000 &&
    (comment.action === "feedback" || comment.action === "approval") &&
    typeof comment.createdAt === "string"
  );
}

function isStoredSnapshot(
  value: unknown,
  projectIds: Set<string>,
): value is DemoSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as DemoSnapshot;
  return (
    typeof snapshot.token === "string" &&
    snapshot.token.length >= 32 &&
    typeof snapshot.projectId === "string" &&
    projectIds.has(snapshot.projectId) &&
    isStoredProject(snapshot.project) &&
    snapshot.project.id === snapshot.projectId &&
    snapshot.project.reviewToken === snapshot.token &&
    typeof snapshot.createdAt === "string" &&
    ["shared", "approved", "revoked"].includes(snapshot.status) &&
    (snapshot.status !== "approved" || snapshot.project.status === "approved") &&
    Array.isArray(snapshot.comments) &&
    snapshot.comments.every(isStoredComment)
  );
}

function isStoredChangeRequest(
  value: unknown,
  projectIds: Set<string>,
  tokens: Set<string>,
): value is ChangeRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as ChangeRequest;
  if (
    typeof request.id !== "string" ||
    typeof request.projectId !== "string" ||
    !projectIds.has(request.projectId) ||
    typeof request.token !== "string" ||
    !tokens.has(request.token) ||
    !requesterInputIsValid(request) ||
    !["open", "proposed", "accepted", "declined"].includes(request.status) ||
    typeof request.createdAt !== "string" ||
    typeof request.updatedAt !== "string" ||
    !Array.isArray(request.proposals)
  )
    return false;
  return request.proposals.every((proposal) =>
    isStoredProposal(proposal, request.id),
  );
}

function requesterInputIsValid(request: ChangeRequest) {
  try {
    validateChangeRequestInput({
      requesterName: request.requesterName,
      title: request.title,
      details: request.details,
    });
    return true;
  } catch {
    return false;
  }
}

function isStoredProposal(
  value: unknown,
  requestId: string,
): value is ChangeProposal {
  if (!value || typeof value !== "object") return false;
  const proposal = value as ChangeProposal;
  try {
    validateChangeProposalInput(proposal as unknown as Record<string, unknown>);
  } catch {
    return false;
  }
  return (
    proposal.requestId === requestId &&
    typeof proposal.id === "string" &&
    Number.isInteger(proposal.version) &&
    proposal.version > 0 &&
    ["sent", "accepted", "declined"].includes(proposal.status) &&
    typeof proposal.createdAt === "string" &&
    (!proposal.decidedBy || typeof proposal.decidedBy === "string") &&
    (!proposal.decisionComment ||
      typeof proposal.decisionComment === "string") &&
    (!proposal.decidedAt || typeof proposal.decidedAt === "string")
  );
}

function isStoredMetadata(
  value: unknown,
  projectIds: Set<string>,
): value is DemoStateMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as DemoStateMetadata;
  return (
    metadata.version === 1 &&
    typeof metadata.seededAt === "string" &&
    Array.isArray(metadata.sampleProjectIds) &&
    metadata.sampleProjectIds.length > 0 &&
    new Set(metadata.sampleProjectIds).size === metadata.sampleProjectIds.length &&
    metadata.sampleProjectIds.every((id) => projectIds.has(id))
  );
}

function readState(): DemoState {
  if (!storageAvailable())
    throw new DemoStorageError(
      "This browser does not allow local demo storage. Try a normal browser window.",
    );
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.projects) ||
      !Array.isArray(parsed.snapshots) ||
      !Array.isArray(parsed.changeRequests)
    )
      throw new Error("invalid root shape");
    const projects = parsed.projects as Project[];
    const projectIds = new Set(projects.map((project) => project.id));
    const snapshots = parsed.snapshots as DemoSnapshot[];
    const tokens = new Set(
      snapshots
        .filter(
          (snapshot): snapshot is DemoSnapshot =>
            !!snapshot &&
            typeof snapshot === "object" &&
            typeof (snapshot as DemoSnapshot).token === "string",
        )
        .map((snapshot) => snapshot.token),
    );
    const requestIds = new Set(parsed.changeRequests.map((request) => request.id));
    const proposalCount = parsed.changeRequests.reduce(
      (count, request) => count + request.proposals.length,
      0,
    );
    const proposalIds = new Set(
      parsed.changeRequests.flatMap((request) =>
        request.proposals.map((proposal) => proposal.id),
      ),
    );
    if (
      !projects.every(isStoredProject) ||
      projectIds.size !== projects.length ||
      tokens.size !== snapshots.length ||
      requestIds.size !== parsed.changeRequests.length ||
      proposalIds.size !== proposalCount ||
      !parsed.snapshots.every((snapshot) =>
        isStoredSnapshot(snapshot, projectIds),
      ) ||
      !parsed.changeRequests.every((request) =>
        isStoredChangeRequest(request, projectIds, tokens),
      ) ||
      (parsed.metadata !== undefined &&
        !isStoredMetadata(parsed.metadata, projectIds))
    )
      throw new Error("invalid shape");
    for (const project of projects) {
      if (project.reviewToken) {
        const matches = snapshots.filter(
          (snapshot) =>
            snapshot.projectId === project.id &&
            snapshot.token === project.reviewToken,
        );
        if (matches.length !== 1) throw new Error("invalid project token");
      }
    }
    for (const request of parsed.changeRequests as ChangeRequest[]) {
      const project = projects.find((item) => item.id === request.projectId);
      const snapshot = snapshots.find((item) => item.token === request.token);
      if (
        !project ||
        project.reviewToken !== request.token ||
        !snapshot ||
        snapshot.projectId !== request.projectId ||
        snapshot.status !== "approved"
      )
        throw new Error("invalid request token");
      const versions = request.proposals.map((proposal) => proposal.version);
      if (
        new Set(versions).size !== versions.length ||
        versions.some((version, index) => version !== index + 1)
      )
        throw new Error("invalid proposal versions");
      if (
        request.status === "open" &&
        request.proposals.length !== 0
      )
        throw new Error("invalid open request");
      if (
        request.status === "proposed" &&
        request.proposals.at(-1)?.status !== "sent"
      )
        throw new Error("invalid proposal status");
      if (
        request.status === "accepted" &&
        request.proposals.at(-1)?.status !== "accepted"
      )
        throw new Error("invalid accepted request");
      if (
        request.status === "declined" &&
        request.proposals.at(-1)?.status !== "declined"
      )
        throw new Error("invalid declined request");
    }
    return parsed as DemoState;
  } catch {
    throw new DemoStorageError(
      "Demo data could not be read safely. Clear this site’s storage and try again.",
    );
  }
}

function writeState(state: DemoState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new DemoStorageError(
      "The browser could not save this demo. Check available site storage and try again.",
    );
  }
}

function currentProject(state: DemoState, id: string) {
  const project = state.projects.find((item) => item.id === id);
  if (!project)
    throw new DemoStorageError("Project not found in this browser.");
  return project;
}

function currentSnapshot(state: DemoState, token: string) {
  return state.snapshots.find((snapshot) => snapshot.token === token);
}

function changeRequestsFor(state: DemoState, projectId: string) {
  return state.changeRequests
    .filter((request) => request.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((request) => ({
      ...request,
      proposals: request.proposals.map((proposal) => ({ ...proposal })),
    }));
}

function snapshotStatus(
  snapshot: DemoSnapshot,
  currentToken?: string,
): ProjectResponse["snapshotStatus"] {
  if (snapshot.status === "approved") return "approved";
  if (snapshot.status === "revoked") return "revoked";
  return snapshot.token === currentToken ? "current" : "superseded";
}

function getReviewFromState(
  state: DemoState,
  token: string,
): ReviewSnapshot | null {
  const snapshot = currentSnapshot(state, token);
  if (!snapshot || snapshot.status === "revoked") return null;
  const project = currentProject(state, snapshot.projectId);
  const reviewProject = clone(snapshot.project);
  if (snapshot.status === "approved") {
    reviewProject.status = "approved";
    reviewProject.approval = project.approval ?? reviewProject.approval;
  } else if (
    project.reviewToken === token &&
    project.status === "changes_requested"
  ) {
    reviewProject.status = "changes_requested";
  } else {
    reviewProject.status = snapshot.status;
  }
  reviewProject.reviewToken = token;
  return {
    ...reviewProject,
    comments: clone(snapshot.comments),
    changeRequests: changeRequestsFor(state, project.id),
    snapshotCreatedAt: snapshot.createdAt,
  };
}

export function demoListProjects() {
  return clone(readState().projects).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function demoGetProject(id: string) {
  const state = readState();
  return clone(state.projects.find((project) => project.id === id) ?? null);
}

export function demoAnalyze(brief: string): BriefAnalysis {
  return analyzeBrief(brief);
}

export function demoCreateProject(input: {
  title: string;
  client: string;
  brief: string;
  analysis: BriefAnalysis;
  scope?: Scope;
}) {
  const analysis = input.analysis;
  if (!isValidBriefAnalysis(analysis))
    throw new DemoStorageError("Analyze the brief before creating a project.");
  const validated = validateProjectInput({
    ...input,
    analysis,
    scope: input.scope ?? makeDefaultScope(analysis),
  });
  const timestamp = now();
  const project: Project = {
    ...validated,
    id: randomId(),
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const state = readState();
  state.projects.push(project);
  writeState(state);
  return clone(project);
}

export function demoUpdateProject(id: string, input: Project) {
  const state = readState();
  const project = currentProject(state, id);
  if (project.status === "approved")
    throw new DemoStorageError(
      "Approved scopes are locked. Add a change request from the review page instead.",
    );
  const validated = validateProjectInput(
    input as unknown as Record<string, unknown>,
  );
  const unchanged =
    project.title === validated.title &&
    project.client === validated.client &&
    project.brief === validated.brief &&
    JSON.stringify(project.analysis) === JSON.stringify(validated.analysis) &&
    JSON.stringify(project.scope) === JSON.stringify(validated.scope);
  if (unchanged) return clone(project);
  if (project.reviewToken) {
    const snapshot = currentSnapshot(state, project.reviewToken);
    if (snapshot && snapshot.status !== "approved") snapshot.status = "revoked";
  }
  const updated = {
    ...project,
    ...validated,
    reviewToken: undefined,
    status: "draft" as const,
    updatedAt: now(),
  };
  state.projects = state.projects.map((item) =>
    item.id === id ? updated : item,
  );
  writeState(state);
  return clone(updated);
}

export function demoShareProject(id: string) {
  const state = readState();
  const project = currentProject(state, id);
  if (project.status === "approved")
    throw new DemoStorageError(
      "Approved scopes are locked and cannot be reshared.",
    );
  if (project.status === "shared" && project.reviewToken)
    return { project: clone(project), url: `/review/${project.reviewToken}` };
  state.snapshots = state.snapshots.map((snapshot) =>
    snapshot.projectId === id && snapshot.status !== "approved"
      ? { ...snapshot, status: "revoked" }
      : snapshot,
  );
  const token = randomToken();
  const timestamp = now();
  const shared: Project = {
    ...project,
    reviewToken: token,
    status: "shared",
    updatedAt: timestamp,
  };
  state.projects = state.projects.map((item) =>
    item.id === id ? shared : item,
  );
  state.snapshots.push({
    token,
    projectId: id,
    project: clone(shared),
    createdAt: timestamp,
    status: "shared",
    comments: [],
  });
  writeState(state);
  return { project: clone(shared), url: `/review/${token}` };
}

export function demoGetHistory(projectId: string): ProjectHistory {
  const state = readState();
  const project = currentProject(state, projectId);
  const responses = state.snapshots
    .filter((snapshot) => snapshot.projectId === projectId)
    .flatMap((snapshot) =>
      snapshot.comments.map((comment) => ({
        ...comment,
        token: snapshot.token,
        snapshotCreatedAt: snapshot.createdAt,
        snapshotStatus: snapshotStatus(snapshot, project.reviewToken),
      })),
    )
    .sort((a, b) => b.id - a.id) as ProjectResponse[];
  return { responses, changeRequests: changeRequestsFor(state, projectId) };
}

export function demoGetReview(token: string) {
  return clone(getReviewFromState(readState(), token));
}

export function demoReviewComment(
  token: string,
  input: { name: string; comment: string; action: "feedback" | "approval" },
) {
  const name = input.name.trim();
  const comment = input.comment.trim();
  if (
    !name ||
    name.length > 120 ||
    !comment ||
    comment.length > 4000 ||
    (input.action !== "feedback" && input.action !== "approval")
  )
    throw new DemoStorageError(
      "Add your name and a comment up to 4,000 characters.",
    );
  const state = readState();
  const review = getReviewFromState(state, token);
  if (!review)
    throw new DemoStorageError("Review link not found or no longer active.");
  const project = currentProject(state, review.id);
  if (input.action === "approval" && review.status === "approved")
    return review;
  if (
    input.action === "approval" &&
    (project.reviewToken !== token || project.status === "approved")
  )
    throw new DemoStorageError("This review link is no longer current.");
  const snapshot = currentSnapshot(state, token)!;
  snapshot.comments.push({
    id: Date.now(),
    name,
    comment,
    action: input.action,
    createdAt: now(),
  });
  if (input.action === "approval") {
    const approval = {
      name,
      comment,
      approvedAt: now(),
    };
    Object.assign(project, {
      status: "approved",
      approval,
      updatedAt: approval.approvedAt,
    });
    snapshot.status = "approved";
    snapshot.project = clone(project);
  } else if (project.status !== "approved") {
    project.status = "changes_requested";
    project.updatedAt = now();
  }
  writeState(state);
  return clone(getReviewFromState(state, token)!);
}

export function demoCreateChangeRequest(
  token: string,
  input: { requesterName: string; title: string; details: string },
) {
  const validated = validateChangeRequestInput(
    input as unknown as Record<string, unknown>,
  );
  const state = readState();
  const review = getReviewFromState(state, token);
  if (!review || review.status !== "approved")
    throw new DemoStorageError(
      "Change requests are available after the scope is approved.",
    );
  const project = currentProject(state, review.id);
  if (project.reviewToken !== token || project.status !== "approved")
    throw new DemoStorageError(
      "This approved review link is no longer current.",
    );
  const timestamp = now();
  state.changeRequests.push({
    id: randomId(),
    projectId: project.id,
    token,
    ...validated,
    status: "open",
    createdAt: timestamp,
    updatedAt: timestamp,
    proposals: [],
  });
  writeState(state);
  return clone(getReviewFromState(state, token)!);
}

export function demoCreateChangeProposal(
  projectId: string,
  input: {
    requestId: string;
    title: string;
    details: string;
    affectedDeliverables: string[];
    priceAdjustment: number;
    currency: string;
    timelineImpact: string;
    rationale: string;
  },
) {
  const validated = validateChangeProposalInput(
    input as unknown as Record<string, unknown>,
  );
  const state = readState();
  const project = currentProject(state, projectId);
  if (project.status !== "approved")
    throw new DemoStorageError(
      "Proposals can only be written against an approved scope.",
    );
  const request = state.changeRequests.find(
    (item) => item.id === validated.requestId && item.projectId === projectId,
  );
  if (!request)
    throw new DemoStorageError("Change request not found for this project.");
  const latest = request.proposals.at(-1);
  if (latest?.status === "sent")
    throw new DemoStorageError(
      "This change request already has a proposal waiting for a decision.",
    );
  if (request.status === "accepted")
    throw new DemoStorageError(
      "This change request was accepted. Start a new request for another change.",
    );
  const proposal: ChangeProposal = {
    id: randomId(),
    version: (latest?.version ?? 0) + 1,
    ...validated,
    status: "sent",
    createdAt: now(),
  };
  request.proposals.push(proposal);
  request.status = "proposed";
  request.updatedAt = proposal.createdAt;
  writeState(state);
  return clone(demoGetHistory(projectId));
}

export function demoDecideChangeProposal(
  token: string,
  input: {
    proposalId: string;
    decision: "accepted" | "declined";
    name: string;
    comment: string;
  },
) {
  const name = input.name.trim();
  const comment = input.comment.trim();
  if (
    !name ||
    name.length > 120 ||
    comment.length > 4000 ||
    !input.proposalId ||
    (input.decision !== "accepted" && input.decision !== "declined")
  )
    throw new DemoStorageError(
      "Add your name and choose an accept or decline decision.",
    );
  const state = readState();
  const review = getReviewFromState(state, token);
  if (!review || review.status !== "approved")
    throw new DemoStorageError(
      "Only the approved scope can receive proposal decisions.",
    );
  const project = currentProject(state, review.id);
  if (project.reviewToken !== token || project.status !== "approved")
    throw new DemoStorageError(
      "This approved review link is no longer current.",
    );
  const request = state.changeRequests.find(
    (item) =>
      item.projectId === project.id &&
      item.proposals.some((proposal) => proposal.id === input.proposalId),
  );
  const proposal = request?.proposals.find(
    (item) => item.id === input.proposalId,
  );
  if (!request || !proposal)
    throw new DemoStorageError("Change proposal not found for this project.");
  if (proposal.status !== "sent") {
    if (proposal.status === input.decision)
      return clone(getReviewFromState(state, token)!);
    throw new DemoStorageError(
      "This proposal already has a different decision.",
    );
  }
  const latest = request.proposals.at(-1);
  if (!latest || latest.id !== proposal.id)
    throw new DemoStorageError(
      "This proposal is no longer the latest version.",
    );
  proposal.status = input.decision;
  proposal.decidedBy = name;
  proposal.decisionComment = comment;
  proposal.decidedAt = now();
  request.status = input.decision;
  request.updatedAt = proposal.decidedAt;
  writeState(state);
  return clone(getReviewFromState(state, token)!);
}

export function demoExportMarkdown(projectId: string) {
  const state = readState();
  const project = currentProject(state, projectId);
  const history = demoGetHistory(projectId);
  const responseLines = history.responses.length
    ? history.responses
        .map(
          (item) =>
            `- **${item.name}** (${item.action}, ${item.snapshotStatus}, ${new Date(item.createdAt).toLocaleString()}): ${item.comment}`,
        )
        .join("\n")
    : "- No client responses yet.";
  const changeLines = history.changeRequests.length
    ? history.changeRequests
        .map((request) =>
          [
            `### ${request.title} — ${request.status}`,
            `Requested by ${request.requesterName}: ${request.details}`,
            ...request.proposals.map(
              (proposal) =>
                `- Proposal v${proposal.version}: **${proposal.title}** — ${proposal.status}; ${proposal.currency} ${proposal.priceAdjustment.toFixed(2)}; ${proposal.timelineImpact}. ${proposal.rationale}${proposal.decidedBy ? ` Decision by ${proposal.decidedBy}: ${proposal.decisionComment || "No comment"}.` : ""}`,
            ),
          ].join("\n"),
        )
        .join("\n\n")
    : "No change requests yet.";
  return [
    `# ${project.title}`,
    `\nClient: ${project.client}`,
    `Status: ${project.status}`,
    `\n## Brief\n${project.brief}`,
    `\n## Analysis\n\n**Audience:** ${project.analysis.audience}`,
    `\n### Goals\n${project.analysis.goals.map((item) => `- ${item}`).join("\n")}`,
    `\n### Pages\n${project.analysis.pages.map((item) => `- ${item}`).join("\n")}`,
    `\n## Scope\n\n### Deliverables\n${project.scope.deliverables.map((item) => `- ${item}`).join("\n")}`,
    `\n### Included\n${project.scope.included.map((item) => `- ${item}`).join("\n")}`,
    `\n### Excluded\n${project.scope.excluded.map((item) => `- ${item}`).join("\n")}`,
    `\n### Milestones\n${project.scope.milestones.map((item) => `- **${item.name}** (${item.timing}) — ${item.detail}`).join("\n")}`,
    `\nRevision rounds: ${project.scope.revisions}`,
    `\n## Response history\n${responseLines}`,
    `\n## Change requests and proposals\n${changeLines}`,
  ].join("\n");
}

export type DemoWorkspaceResult = {
  projects: Project[];
  hasSamples: boolean;
  sampleProjectIds: string[];
  initialized: boolean;
};

function sampleProject(
  title: string,
  client: string,
  brief: string,
): Project {
  const analysis = analyzeBrief(brief);
  const timestamp = now();
  return {
    ...validateProjectInput({
      title,
      client,
      brief,
      analysis,
      scope: makeDefaultScope(analysis),
    }),
    id: randomId(),
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function approvedSample(
  project: Project,
  approvalName: string,
  approvalComment: string,
): { project: Project; snapshot: DemoSnapshot } {
  const token = randomToken();
  const timestamp = now();
  const approved: Project = {
    ...project,
    reviewToken: token,
    status: "approved",
    approval: {
      name: approvalName,
      comment: approvalComment,
      approvedAt: timestamp,
    },
    updatedAt: timestamp,
  };
  return {
    project: approved,
    snapshot: {
      token,
      projectId: approved.id,
      project: clone(approved),
      createdAt: timestamp,
      status: "approved",
      comments: [
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          name: approvalName,
          comment: approvalComment,
          action: "approval",
          createdAt: timestamp,
        },
      ],
    },
  };
}

function buildSampleState(): DemoState {
  const draft = sampleProject(
    "Harbor & Hearth — draft concept",
    "Fictional café concept",
    "Fictional demo brief: a neighborhood café needs a warm responsive site that explains the menu, shares the story, and helps new visitors find opening hours and reserve a table.",
  );
  const approvedSeed = sampleProject(
    "Northline Studio — approved scope",
    "Fictional coaching studio",
    "Fictional demo brief: a strength studio needs a confident website that explains its coaching approach, shows class formats, and helps new members book an intro session before autumn intake.",
  );
  const pendingSeed = sampleProject(
    "Field Notes — pending change",
    "Fictional journal publisher",
    "Fictional demo brief: an independent journal needs a considered editorial website with issue highlights, an archive, contributor context, and a simple path to subscribe.",
  );
  const approved = approvedSample(
    approvedSeed,
    "Alex Morgan (fictional)",
    "The scope is clear for the first release. Approved for this demo.",
  );
  const pending = approvedSample(
    pendingSeed,
    "Sam Rivera (fictional)",
    "The editorial launch scope looks right. Approved for this demo.",
  );
  const requestId = randomId();
  const requestTime = now();
  const proposal: ChangeProposal = {
    id: randomId(),
    requestId,
    version: 1,
    title: "Add a subscriber welcome flow",
    details:
      "Add a short welcome sequence and a connected signup confirmation after the archive launch.",
    affectedDeliverables: ["Subscription pathway", "Launch handoff"],
    priceAdjustment: 480,
    currency: "USD",
    timelineImpact: "Adds three working days after copy approval.",
    rationale:
      "The welcome flow introduces content and integration work outside the approved baseline.",
    status: "sent",
    createdAt: requestTime,
  };
  const request: ChangeRequest = {
    id: requestId,
    projectId: pending.project.id,
    token: pending.snapshot.token,
    requesterName: "Sam Rivera (fictional)",
    title: "Add a subscriber welcome flow",
    details:
      "Could we add a welcome email and confirmation step for new journal subscribers?",
    status: "proposed",
    createdAt: requestTime,
    updatedAt: requestTime,
    proposals: [proposal],
  };
  const projects = [draft, approved.project, pending.project];
  return {
    version: 1,
    projects,
    snapshots: [approved.snapshot, pending.snapshot],
    changeRequests: [request],
    metadata: {
      version: 1,
      sampleProjectIds: projects.map((project) => project.id),
      seededAt: now(),
    },
  };
}

function workspaceResult(
  state: DemoState,
  initialized: boolean,
): DemoWorkspaceResult {
  return {
    projects: clone(state.projects).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
    hasSamples: Boolean(state.metadata?.sampleProjectIds.length),
    sampleProjectIds: [...(state.metadata?.sampleProjectIds ?? [])],
    initialized,
  };
}

export function demoInitializeWorkspace(): DemoWorkspaceResult {
  if (!storageAvailable())
    throw new DemoStorageError(
      "This browser does not allow local demo storage. Try a normal browser window.",
    );
  if (window.localStorage.getItem(STORAGE_KEY) !== null)
    return workspaceResult(readState(), false);
  const state = buildSampleState();
  writeState(state);
  return workspaceResult(state, true);
}

export function demoLoadSampleProjects(): DemoWorkspaceResult {
  const state = readState();
  if (state.metadata?.sampleProjectIds.length)
    return workspaceResult(state, false);
  const samples = buildSampleState();
  const merged: DemoState = {
    ...state,
    projects: [...state.projects, ...samples.projects],
    snapshots: [...state.snapshots, ...samples.snapshots],
    changeRequests: [...state.changeRequests, ...samples.changeRequests],
    metadata: samples.metadata,
  };
  writeState(merged);
  return workspaceResult(merged, false);
}

export function demoResetSampleProjects(): DemoWorkspaceResult {
  if (!storageAvailable())
    throw new DemoStorageError(
      "This browser does not allow local demo storage. Try a normal browser window.",
    );
  const state = buildSampleState();
  writeState(state);
  return workspaceResult(state, false);
}
