export type ProjectStatus = "draft" | "shared" | "changes_requested" | "approved";

export type BriefAnalysis = {
  mode: "local" | "openai";
  summary: string;
  audience: string;
  goals: string[];
  pages: string[];
  needs: string[];
  risks: string[];
  questions: string[];
};

export type Milestone = { name: string; detail: string; timing: string };

export type Scope = {
  deliverables: string[];
  included: string[];
  excluded: string[];
  milestones: Milestone[];
  revisions: number;
};

export type Project = {
  id: string;
  title: string;
  client: string;
  brief: string;
  analysis: BriefAnalysis;
  scope: Scope;
  status: ProjectStatus;
  reviewToken?: string;
  approval?: { name: string; comment: string; approvedAt: string };
  createdAt: string;
  updatedAt: string;
};

export type ReviewComment = {
  id: number;
  name: string;
  comment: string;
  action: "feedback" | "approval";
  createdAt: string;
};

export type ReviewSnapshot = Project & {
  comments: ReviewComment[];
  snapshotCreatedAt: string;
};
