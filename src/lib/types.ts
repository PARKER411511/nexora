export type ProjectStatus =
  | "draft"
  | "shared"
  | "changes_requested"
  | "approved";

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

export type SnapshotStatus = "current" | "superseded" | "approved" | "revoked";

export type ProjectResponse = ReviewComment & {
  token: string;
  snapshotCreatedAt: string;
  snapshotStatus: SnapshotStatus;
};

export type ChangeRequestStatus = "open" | "proposed" | "accepted" | "declined";
export type ProposalStatus = "sent" | "accepted" | "declined";

export type ChangeProposal = {
  id: string;
  requestId: string;
  version: number;
  title: string;
  details: string;
  affectedDeliverables: string[];
  priceAdjustment: number;
  currency: string;
  timelineImpact: string;
  rationale: string;
  status: ProposalStatus;
  createdAt: string;
  decidedBy?: string;
  decisionComment?: string;
  decidedAt?: string;
};

export type ChangeRequest = {
  id: string;
  projectId: string;
  token: string;
  requesterName: string;
  title: string;
  details: string;
  status: ChangeRequestStatus;
  createdAt: string;
  updatedAt: string;
  proposals: ChangeProposal[];
};

export type ProjectHistory = {
  responses: ProjectResponse[];
  changeRequests: ChangeRequest[];
};

export type ReviewSnapshot = Project & {
  comments: ReviewComment[];
  snapshotCreatedAt: string;
  changeRequests: ChangeRequest[];
};

export type AccountProfile = {
  id?: string;
  fullName: string;
  company: string;
  roleTitle: string;
  website: string;
  bio: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminCustomer = {
  id: string;
  email: string;
  name: string;
  company: string;
  joinedAt: string;
  projectCount: number;
};

export type AdminProject = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    email: string;
    name: string;
    company: string;
  };
};

export type AdminOverview = {
  customerCount: number;
  projectCount: number;
  customers: AdminCustomer[];
  projects: AdminProject[];
};
