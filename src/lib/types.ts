export type ProjectStatus =
  | "draft"
  | "shared"
  | "changes_requested"
  | "approved";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type Workspace = {
  id: string;
  name: string;
  personal: boolean;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPermission = WorkspaceRole;

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
  workspaceId?: string;
  archived?: boolean;
  tags?: string[];
  deadline?: string | null;
  version?: number;
  role?: ProjectPermission;
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
  avatarObjectKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectAttachment = {
  id: string;
  projectId: string;
  snapshotToken?: string | null;
  objectKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  pendingDelete?: boolean;
};

export type AdminCustomerDetail = {
  id: string;
  email: string;
  emailConfirmedAt?: string | null;
  joinedAt: string;
  lastSignInAt?: string | null;
  profile?: AccountProfile | null;
  suspended: boolean;
  suspensionReason?: string | null;
  projects: Array<{ id: string; title: string; status: string; updatedAt: string }>;
};

export type ProjectVersion = {
  version: number;
  project: Project;
  changedBy?: string | null;
  createdAt: string;
};

export type VersionComparison = {
  projectId: string;
  leftVersion: number;
  rightVersion: number;
  changedFields: Array<{
    field: string;
    left: unknown;
    right: unknown;
  }>;
};

export type WorkspaceInvite = {
  id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked";
  emailDeliveryStatus: "undelivered" | "queued" | "sent" | "failed";
  token?: string;
};

export type WorkspaceNotification = {
  id: number;
  eventType:
    | "feedback"
    | "approval"
    | "change_request"
    | "proposal"
    | "mention"
    | "workspace_invite"
    | "review_invite"
    | "system";
  projectId?: string | null;
  snapshotToken?: string | null;
  actorId?: string | null;
  payload: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
};

export type BriefTemplate = {
  id: string;
  name: string;
  brief: string;
  scope?: Scope | null;
  tags: string[];
  workspaceId?: string | null;
  createdAt: string;
  updatedAt: string;
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
