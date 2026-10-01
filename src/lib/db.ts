import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  BriefAnalysis,
  ChangeProposal,
  ChangeRequest,
  Project,
  ProjectHistory,
  ProjectResponse,
  ProjectStatus,
  ReviewComment,
  ReviewSnapshot,
  Scope,
} from "./types";

const dataDir = join(process.cwd(), ".data");
mkdirSync(dataDir, { recursive: true });
const databasePath = process.env.NEXORA_DB_PATH || join(dataDir, "nexora.db");
const database = new DatabaseSync(databasePath);
database.exec("PRAGMA busy_timeout = 5000;");
try { database.exec("PRAGMA journal_mode = WAL;"); } catch { /* another local process may be changing the journal mode; the timeout still protects schema setup */ }
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, client TEXT NOT NULL, brief TEXT NOT NULL, analysis_json TEXT NOT NULL, scope_json TEXT NOT NULL, status TEXT NOT NULL, review_token TEXT UNIQUE, approval_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS snapshots (token TEXT PRIMARY KEY, project_id TEXT NOT NULL, project_json TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'shared');
  CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, name TEXT NOT NULL, comment TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS change_requests (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, token TEXT NOT NULL, requester_name TEXT NOT NULL, title TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS change_proposals (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, version INTEGER NOT NULL, title TEXT NOT NULL, details TEXT NOT NULL, affected_deliverables_json TEXT NOT NULL, price_adjustment REAL NOT NULL, currency TEXT NOT NULL, timeline_impact TEXT NOT NULL, rationale TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, decided_by TEXT, decision_comment TEXT, decided_at TEXT, UNIQUE(request_id, version));
`);

const now = () => new Date().toISOString();
const toProject = (row: Record<string, unknown>): Project => ({
  id: String(row.id),
  title: String(row.title),
  client: String(row.client),
  brief: String(row.brief),
  analysis: JSON.parse(String(row.analysis_json)),
  scope: JSON.parse(String(row.scope_json)),
  status: String(row.status) as ProjectStatus,
  reviewToken: row.review_token ? String(row.review_token) : undefined,
  approval: row.approval_json
    ? JSON.parse(String(row.approval_json))
    : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

function toProposal(row: Record<string, unknown>): ChangeProposal {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    version: Number(row.version),
    title: String(row.title),
    details: String(row.details),
    affectedDeliverables: JSON.parse(String(row.affected_deliverables_json)),
    priceAdjustment: Number(row.price_adjustment),
    currency: String(row.currency),
    timelineImpact: String(row.timeline_impact),
    rationale: String(row.rationale),
    status: String(row.status) as ChangeProposal["status"],
    createdAt: String(row.created_at),
    decidedBy: row.decided_by ? String(row.decided_by) : undefined,
    decisionComment: row.decision_comment
      ? String(row.decision_comment)
      : undefined,
    decidedAt: row.decided_at ? String(row.decided_at) : undefined,
  };
}

function getChangeRequestsForProject(projectId: string): ChangeRequest[] {
  const requests = database
    .prepare(
      "SELECT * FROM change_requests WHERE project_id=? ORDER BY created_at DESC",
    )
    .all(projectId);
  return requests.map((request) => ({
    id: String(request.id),
    projectId: String(request.project_id),
    token: String(request.token),
    requesterName: String(request.requester_name),
    title: String(request.title),
    details: String(request.details),
    status: String(request.status) as ChangeRequest["status"],
    createdAt: String(request.created_at),
    updatedAt: String(request.updated_at),
    proposals: database
      .prepare(
        "SELECT * FROM change_proposals WHERE request_id=? ORDER BY version ASC",
      )
      .all(String(request.id))
      .map(toProposal),
  }));
}

function snapshotStatus(
  status: string,
  token: string,
  currentToken?: string,
): ProjectResponse["snapshotStatus"] {
  if (status === "approved") return "approved";
  if (status === "revoked") return "revoked";
  return token === currentToken ? "current" : "superseded";
}

export function listProjects(): Project[] {
  return database
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
    .all()
    .map(toProject);
}
export function closeDatabase() {
  database.close();
}
export function getProject(id: string): Project | null {
  const row = database.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? toProject(row) : null;
}
export function getProjectHistory(projectId: string): ProjectHistory {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");
  const responses = database
    .prepare(
      "SELECT c.id, c.name, c.comment, c.action, c.created_at, c.token, s.created_at AS snapshot_created_at, s.status AS snapshot_status FROM comments c JOIN snapshots s ON s.token=c.token WHERE s.project_id=? ORDER BY c.id DESC",
    )
    .all(projectId)
    .map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      comment: String(row.comment),
      action: String(row.action) as ReviewComment["action"],
      createdAt: String(row.created_at),
      token: String(row.token),
      snapshotCreatedAt: String(row.snapshot_created_at),
      snapshotStatus: snapshotStatus(
        String(row.snapshot_status),
        String(row.token),
        project.reviewToken,
      ),
    })) as ProjectResponse[];
  return { responses, changeRequests: getChangeRequestsForProject(projectId) };
}
export function createProject(input: {
  title: string;
  client: string;
  brief: string;
  analysis: BriefAnalysis;
  scope: Scope;
}): Project {
  const id = randomUUID();
  const timestamp = now();
  database
    .prepare(
      "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, 'draft', NULL, NULL, ?, ?)",
    )
    .run(
      id,
      input.title,
      input.client,
      input.brief,
      JSON.stringify(input.analysis),
      JSON.stringify(input.scope),
      timestamp,
      timestamp,
    );
  return getProject(id)!;
}
export function updateProject(
  id: string,
  input: {
    title: string;
    client: string;
    brief: string;
    analysis: BriefAnalysis;
    scope: Scope;
  },
): Project {
  const project = getProject(id);
  if (!project) throw new Error("Project not found");
  if (project.status === "approved")
    throw new Error(
      "Approved scopes are locked. Add a change request from the review page instead.",
    );
  const analysisJson = JSON.stringify(input.analysis);
  const scopeJson = JSON.stringify(input.scope);
  if (
    project.title === input.title &&
    project.client === input.client &&
    project.brief === input.brief &&
    JSON.stringify(project.analysis) === analysisJson &&
    JSON.stringify(project.scope) === scopeJson
  )
    return project;
  const timestamp = now();
  if (project.reviewToken)
    database
      .prepare(
        "UPDATE snapshots SET status='revoked' WHERE token=? AND status <> 'approved'",
      )
      .run(project.reviewToken);
  database
    .prepare(
      "UPDATE projects SET title=?, client=?, brief=?, analysis_json=?, scope_json=?, review_token=NULL, status='draft', updated_at=? WHERE id=?",
    )
    .run(
      input.title,
      input.client,
      input.brief,
      analysisJson,
      scopeJson,
      timestamp,
      id,
    );
  return getProject(id)!;
}
export function shareProject(id: string): Project {
  const project = getProject(id);
  if (!project) throw new Error("Project not found");
  if (project.status === "approved")
    throw new Error("Approved scopes are locked and cannot be reshared.");
  if (project.status === "shared" && project.reviewToken) return project;
  const token = randomBytes(24).toString("base64url");
  const timestamp = now();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "UPDATE snapshots SET status='revoked' WHERE project_id=? AND status <> 'approved'",
      )
      .run(id);
    database
      .prepare(
        "UPDATE projects SET review_token=?, status='shared', updated_at=? WHERE id=?",
      )
      .run(token, timestamp, id);
    const shared = getProject(id)!;
    database
      .prepare("INSERT INTO snapshots VALUES (?, ?, ?, ?, 'shared')")
      .run(token, id, JSON.stringify(shared), timestamp);
    database.exec("COMMIT");
    return { ...shared, reviewToken: token };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
export function getReview(token: string): ReviewSnapshot | null {
  const row = database
    .prepare("SELECT * FROM snapshots WHERE token=?")
    .get(token);
  if (!row) return null;
  if (String(row.status) === "revoked") return null;
  const project = JSON.parse(String(row.project_json)) as Project;
  const current = getProject(project.id);
  if (String(row.status) === "approved") {
    project.status = "approved";
    project.approval = current?.approval ?? project.approval;
  } else if (
    current?.reviewToken === token &&
    current.status === "changes_requested"
  ) {
    project.status = "changes_requested";
  } else {
    project.status = String(row.status) as Project["status"];
  }
  project.reviewToken = token;
  const comments = database
    .prepare(
      "SELECT id, name, comment, action, created_at FROM comments WHERE token=? ORDER BY id ASC",
    )
    .all(token)
    .map((comment) => ({
      id: Number(comment.id),
      name: String(comment.name),
      comment: String(comment.comment),
      action: String(comment.action) as ReviewComment["action"],
      createdAt: String(comment.created_at),
    }));
  return {
    ...project,
    comments,
    changeRequests: getChangeRequestsForProject(project.id),
    snapshotCreatedAt: String(row.created_at),
  };
}

export function createChangeRequest(
  token: string,
  input: { requesterName: string; title: string; details: string },
): ReviewSnapshot {
  const review = getReview(token);
  if (!review || review.status !== "approved")
    throw new Error(
      "Change requests are available after the scope is approved.",
    );
  const current = getProject(review.id);
  if (
    !current ||
    current.reviewToken !== token ||
    current.status !== "approved"
  )
    throw new Error("This approved review link is no longer current.");
  const id = randomUUID();
  const timestamp = now();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "INSERT INTO change_requests(id, project_id, token, requester_name, title, details, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)",
      )
      .run(
        id,
        review.id,
        token,
        input.requesterName,
        input.title,
        input.details,
        timestamp,
        timestamp,
      );
    database.exec("COMMIT");
    return getReview(token)!;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createChangeProposal(
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
): ProjectHistory {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (project.status !== "approved")
    throw new Error("Proposals can only be written against an approved scope.");
  const request = database
    .prepare("SELECT * FROM change_requests WHERE id=? AND project_id=?")
    .get(input.requestId, projectId);
  if (!request) throw new Error("Change request not found for this project.");
  const latest = database
    .prepare(
      "SELECT * FROM change_proposals WHERE request_id=? ORDER BY version DESC LIMIT 1",
    )
    .get(input.requestId);
  if (latest && String(latest.status) === "sent")
    throw new Error(
      "This change request already has a proposal waiting for a decision.",
    );
  if (String(request.status) === "accepted")
    throw new Error(
      "This change request was accepted. Start a new request for another change.",
    );
  const version = latest ? Number(latest.version) + 1 : 1;
  const id = randomUUID();
  const timestamp = now();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "INSERT INTO change_proposals(id, request_id, version, title, details, affected_deliverables_json, price_adjustment, currency, timeline_impact, rationale, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)",
      )
      .run(
        id,
        input.requestId,
        version,
        input.title,
        input.details,
        JSON.stringify(input.affectedDeliverables),
        input.priceAdjustment,
        input.currency,
        input.timelineImpact,
        input.rationale,
        timestamp,
      );
    database
      .prepare(
        "UPDATE change_requests SET status='proposed', updated_at=? WHERE id=?",
      )
      .run(timestamp, input.requestId);
    database.exec("COMMIT");
    return getProjectHistory(projectId);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function decideChangeProposal(
  token: string,
  input: {
    proposalId: string;
    decision: "accepted" | "declined";
    name: string;
    comment: string;
  },
): ReviewSnapshot {
  const review = getReview(token);
  if (!review || review.status !== "approved")
    throw new Error("Only the approved scope can receive proposal decisions.");
  const current = getProject(review.id);
  if (
    !current ||
    current.reviewToken !== token ||
    current.status !== "approved"
  )
    throw new Error("This approved review link is no longer current.");
  const row = database
    .prepare(
      "SELECT p.*, r.project_id, r.status AS request_status FROM change_proposals p JOIN change_requests r ON r.id=p.request_id WHERE p.id=? AND r.project_id=?",
    )
    .get(input.proposalId, review.id);
  if (!row) throw new Error("Change proposal not found for this project.");
  const status = String(row.status) as ChangeProposal["status"];
  if (status !== "sent") {
    if (status === input.decision) return getReview(token)!;
    throw new Error("This proposal already has a different decision.");
  }
  const latest = database
    .prepare(
      "SELECT MAX(version) AS version FROM change_proposals WHERE request_id=?",
    )
    .get(String(row.request_id));
  if (Number(latest?.version) !== Number(row.version))
    throw new Error("This proposal is no longer the latest version.");
  const timestamp = now();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = database
      .prepare(
        "UPDATE change_proposals SET status=?, decided_by=?, decision_comment=?, decided_at=? WHERE id=? AND version=? AND status='sent'",
      )
      .run(
        input.decision,
        input.name,
        input.comment,
        timestamp,
        input.proposalId,
        Number(row.version),
      );
    if (result.changes !== 1)
      throw new Error(
        "This proposal was already decided. Refresh and try again.",
      );
    database
      .prepare("UPDATE change_requests SET status=?, updated_at=? WHERE id=?")
      .run(input.decision, timestamp, String(row.request_id));
    database.exec("COMMIT");
    return getReview(token)!;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
export function reviewComment(
  token: string,
  input: { name: string; comment: string; action: "feedback" | "approval" },
): ReviewSnapshot {
  const review = getReview(token);
  if (!review) throw new Error("Review link not found");
  if (input.action === "approval" && review.status === "approved")
    return review;
  const timestamp = now();
  if (input.action === "approval") {
    const current = getProject(review.id);
    if (!current || current.reviewToken !== token)
      throw new Error(
        "This review link is no longer current. Ask the project owner for a new link.",
      );
    if (current.status === "approved") return getReview(token)!;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    if (input.action === "approval") {
      const approval = {
        name: input.name,
        comment: input.comment,
        approvedAt: timestamp,
      };
      const result = database
        .prepare(
          "UPDATE projects SET status='approved', approval_json=?, updated_at=? WHERE id=? AND review_token=? AND status <> 'approved'",
        )
        .run(JSON.stringify(approval), timestamp, review.id, token);
      if (result.changes !== 1)
        throw new Error(
          "This review link is no longer current. Ask the project owner for a new link.",
        );
      database
        .prepare(
          "INSERT INTO comments(token, name, comment, action, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(token, input.name, input.comment, input.action, timestamp);
      database
        .prepare(
          "UPDATE snapshots SET status='approved' WHERE token=? AND status='shared'",
        )
        .run(token);
    } else {
      database
        .prepare(
          "INSERT INTO comments(token, name, comment, action, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(token, input.name, input.comment, input.action, timestamp);
      if (review.status !== "approved")
        database
          .prepare(
            "UPDATE projects SET status='changes_requested', updated_at=? WHERE id=? AND status <> 'approved'",
          )
          .run(timestamp, review.id);
    }
    database.exec("COMMIT");
    return getReview(token)!;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
