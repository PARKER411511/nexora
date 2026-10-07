import type { BriefAnalysis, Scope } from "./types";

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}
const isStringArray = (value: unknown, max = 50): value is string[] =>
  Array.isArray(value) &&
  value.length <= max &&
  value.every(
    (item) =>
      typeof item === "string" && item.trim().length > 0 && item.length <= 500,
  );

export function isValidBriefAnalysis(value: unknown): value is BriefAnalysis {
  if (!value || typeof value !== "object") return false;
  const analysis = value as Record<string, unknown>;
  return (
    (analysis.mode === "local" || analysis.mode === "openai") &&
    typeof analysis.summary === "string" &&
    analysis.summary.length <= 2000 &&
    typeof analysis.audience === "string" &&
    analysis.audience.length <= 500 &&
    isStringArray(analysis.goals) &&
    isStringArray(analysis.pages) &&
    isStringArray(analysis.needs) &&
    isStringArray(analysis.risks) &&
    isStringArray(analysis.questions)
  );
}

export function validateScope(value: unknown): value is Scope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Record<string, unknown>;
  const milestones = scope.milestones;
  return (
    isStringArray(scope.deliverables) &&
    isStringArray(scope.included) &&
    isStringArray(scope.excluded) &&
    Array.isArray(milestones) &&
    milestones.length <= 20 &&
    milestones.every((item) => {
      if (!item || typeof item !== "object") return false;
      const milestone = item as Record<string, unknown>;
      return [milestone.name, milestone.detail, milestone.timing].every(
        (part) =>
          typeof part === "string" &&
          part.trim().length > 0 &&
          part.length <= 300,
      );
    }) &&
    typeof scope.revisions === "number" &&
    Number.isInteger(scope.revisions) &&
    scope.revisions >= 0 &&
    scope.revisions <= 20
  );
}

export function validateProjectInput(input: Record<string, unknown>) {
  const title = stringValue(input.title);
  const client = stringValue(input.client);
  const brief = stringValue(input.brief);
  if (!title || title.length > 120)
    throw new Error("Add a project name up to 120 characters.");
  if (!client || client.length > 120)
    throw new Error("Add a client or team name up to 120 characters.");
  if (!brief || brief.length < 24 || brief.length > 20000)
    throw new Error("Add a brief between 24 and 20,000 characters.");
  if (!isValidBriefAnalysis(input.analysis) || !validateScope(input.scope))
    throw new Error(
      "Your analysis and scope are malformed. Please analyze the brief again.",
    );
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  if (tags.length > 20 || tags.some((tag) => tag.length > 40))
    throw new Error("Use up to 20 project tags, each under 40 characters.");
  const deadline = input.deadline == null || input.deadline === "" ? null : stringValue(input.deadline);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline))
    throw new Error("Use a valid deadline date.");
  const workspaceId = input.workspaceId == null || input.workspaceId === "" ? undefined : stringValue(input.workspaceId);
  if (workspaceId && !/^[0-9a-f-]{36}$/i.test(workspaceId))
    throw new Error("Choose a valid workspace.");
  return {
    title,
    client,
    brief,
    analysis: input.analysis as BriefAnalysis,
    scope: input.scope as Scope,
    tags,
    deadline,
    workspaceId,
  };
}

export function validateChangeRequestInput(input: Record<string, unknown>) {
  const requesterName = stringValue(input.requesterName);
  const title = stringValue(input.title);
  const details = stringValue(input.details);
  if (
    !requesterName ||
    requesterName.length > 120 ||
    !title ||
    title.length > 160 ||
    !details ||
    details.length > 4000
  )
    throw new Error(
      "Add your name, a short request title, and details up to 4,000 characters.",
    );
  return { requesterName, title, details };
}

export function validateChangeProposalInput(input: Record<string, unknown>) {
  const requestId = stringValue(input.requestId);
  const title = stringValue(input.title);
  const details = stringValue(input.details);
  const timelineImpact = stringValue(input.timelineImpact);
  const rationale = stringValue(input.rationale);
  const currency = stringValue(input.currency).toUpperCase();
  const affectedDeliverables = input.affectedDeliverables;
  const priceAdjustment = input.priceAdjustment;
  if (
    !requestId ||
    !title ||
    title.length > 160 ||
    !details ||
    details.length > 4000 ||
    !timelineImpact ||
    timelineImpact.length > 500 ||
    !rationale ||
    rationale.length > 2000
  )
    throw new Error(
      "Complete the proposal title, details, timeline impact, and rationale.",
    );
  if (
    !Array.isArray(affectedDeliverables) ||
    affectedDeliverables.length > 30 ||
    !affectedDeliverables.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0 &&
        item.length <= 300,
    )
  )
    throw new Error("List up to 30 affected deliverables.");
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Use a three-letter currency code such as USD or GBP.");
  if (
    typeof priceAdjustment !== "number" ||
    !Number.isFinite(priceAdjustment) ||
    Math.abs(priceAdjustment) > 10000000 ||
    Math.round(priceAdjustment * 100) !== priceAdjustment * 100
  )
    throw new Error("Enter a price adjustment with up to two decimal places.");
  return {
    requestId,
    title,
    details,
    affectedDeliverables: affectedDeliverables.map((item) => item.trim()),
    priceAdjustment,
    currency,
    timelineImpact,
    rationale,
  };
}

export function validateProfileInput(input: Record<string, unknown>) {
  const fullName = stringValue(input.fullName);
  const company = stringValue(input.company);
  const roleTitle = stringValue(input.roleTitle);
  const website = stringValue(input.website);
  const bio = stringValue(input.bio);
  if (fullName.length > 120 || company.length > 120 || roleTitle.length > 120)
    throw new Error("Keep your name, company, and role under 120 characters.");
  if (website.length > 300 || bio.length > 2000)
    throw new Error("Keep your website under 300 and bio under 2,000 characters.");
  if (website && !/^https?:\/\/[^\s]+$/i.test(website))
    throw new Error("Use a full website address starting with https://.");
  return { fullName, company, roleTitle, website, bio };
}
