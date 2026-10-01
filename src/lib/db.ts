import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { BriefAnalysis, Project, ProjectStatus, ReviewComment, ReviewSnapshot, Scope } from "./types";

const dataDir = join(process.cwd(), ".data");
mkdirSync(dataDir, { recursive: true });
const databasePath = process.env.NEXORA_DB_PATH || join(dataDir, "nexora.db");
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, client TEXT NOT NULL, brief TEXT NOT NULL, analysis_json TEXT NOT NULL, scope_json TEXT NOT NULL, status TEXT NOT NULL, review_token TEXT UNIQUE, approval_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS snapshots (token TEXT PRIMARY KEY, project_id TEXT NOT NULL, project_json TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'shared');
  CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, name TEXT NOT NULL, comment TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
`);

const now = () => new Date().toISOString();
const toProject = (row: Record<string, unknown>): Project => ({
  id: String(row.id), title: String(row.title), client: String(row.client), brief: String(row.brief),
  analysis: JSON.parse(String(row.analysis_json)), scope: JSON.parse(String(row.scope_json)), status: String(row.status) as ProjectStatus,
  reviewToken: row.review_token ? String(row.review_token) : undefined, approval: row.approval_json ? JSON.parse(String(row.approval_json)) : undefined,
  createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});

export function listProjects(): Project[] {
  return database.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map(toProject);
}
export function closeDatabase() { database.close(); }
export function getProject(id: string): Project | null {
  const row = database.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? toProject(row) : null;
}
export function createProject(input: { title: string; client: string; brief: string; analysis: BriefAnalysis; scope: Scope }): Project {
  const id = randomUUID(); const timestamp = now();
  database.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, 'draft', NULL, NULL, ?, ?)").run(id, input.title, input.client, input.brief, JSON.stringify(input.analysis), JSON.stringify(input.scope), timestamp, timestamp);
  return getProject(id)!;
}
export function updateProject(id: string, input: { title: string; client: string; brief: string; analysis: BriefAnalysis; scope: Scope }): Project {
  const project = getProject(id); if (!project) throw new Error("Project not found");
  if (project.status === "approved") throw new Error("Approved scopes are locked. Add a change request from the review page instead.");
  const timestamp = now();
  if (project.reviewToken) database.prepare("UPDATE snapshots SET status='revoked' WHERE token=? AND status <> 'approved'").run(project.reviewToken);
  database.prepare("UPDATE projects SET title=?, client=?, brief=?, analysis_json=?, scope_json=?, review_token=NULL, status='draft', updated_at=? WHERE id=?").run(input.title, input.client, input.brief, JSON.stringify(input.analysis), JSON.stringify(input.scope), timestamp, id);
  return getProject(id)!;
}
export function shareProject(id: string): Project {
  const project = getProject(id); if (!project) throw new Error("Project not found");
  if (project.status === "approved") throw new Error("Approved scopes are locked and cannot be reshared.");
  const token = randomBytes(24).toString("base64url"); const timestamp = now();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE snapshots SET status='revoked' WHERE project_id=? AND status <> 'approved'").run(id);
    database.prepare("UPDATE projects SET review_token=?, status='shared', updated_at=? WHERE id=?").run(token, timestamp, id);
    const shared = getProject(id)!;
    database.prepare("INSERT INTO snapshots VALUES (?, ?, ?, ?, 'shared')").run(token, id, JSON.stringify(shared), timestamp);
    database.exec("COMMIT"); return { ...shared, reviewToken: token };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}
export function getReview(token: string): ReviewSnapshot | null {
  const row = database.prepare("SELECT * FROM snapshots WHERE token=?").get(token); if (!row) return null;
  if (String(row.status) === "revoked") return null;
  const project = JSON.parse(String(row.project_json)) as Project;
  const current = getProject(project.id);
  if (current?.reviewToken === token && current.status === "approved") {
    project.status = "approved";
    project.approval = current.approval;
  } else if (current?.reviewToken === token && current.status === "changes_requested") {
    project.status = "changes_requested";
  } else {
    project.status = String(row.status) as Project["status"];
  }
  project.reviewToken = token;
  const comments = database.prepare("SELECT id, name, comment, action, created_at FROM comments WHERE token=? ORDER BY id ASC").all(token).map((comment) => ({ id: Number(comment.id), name: String(comment.name), comment: String(comment.comment), action: String(comment.action) as ReviewComment["action"], createdAt: String(comment.created_at) }));
  return { ...project, comments, snapshotCreatedAt: String(row.created_at) };
}
export function reviewComment(token: string, input: { name: string; comment: string; action: "feedback" | "approval" }): ReviewSnapshot {
  const review = getReview(token); if (!review) throw new Error("Review link not found");
  if (input.action === "approval" && review.status === "approved") return review;
  const timestamp = now();
  if (input.action === "approval") {
    const current = getProject(review.id);
    if (!current || current.reviewToken !== token) throw new Error("This review link is no longer current. Ask the project owner for a new link.");
    if (current.status === "approved") return getReview(token)!;
  }
  database.prepare("INSERT INTO comments(token, name, comment, action, created_at) VALUES (?, ?, ?, ?, ?)").run(token, input.name, input.comment, input.action, timestamp);
  if (input.action === "approval") {
    const approval = { name: input.name, comment: input.comment, approvedAt: timestamp };
    database.prepare("UPDATE projects SET status='approved', approval_json=?, updated_at=? WHERE id=? AND review_token=? AND status <> 'approved'").run(JSON.stringify(approval), timestamp, review.id, token);
    database.prepare("UPDATE snapshots SET status='approved' WHERE token=?").run(token);
  } else if (review.status !== "approved") {
    database.prepare("UPDATE projects SET status='changes_requested', updated_at=? WHERE id=? AND status <> 'approved'").run(timestamp, review.id);
  }
  return getReview(token)!;
}
