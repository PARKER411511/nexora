import type { BriefAnalysis, Scope } from "./types";

export function stringValue(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
const isStringArray = (value: unknown, max = 50): value is string[] => Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 500);

export function isValidBriefAnalysis(value: unknown): value is BriefAnalysis {
  if (!value || typeof value !== "object") return false;
  const analysis = value as Record<string, unknown>;
  return (analysis.mode === "local" || analysis.mode === "openai") && typeof analysis.summary === "string" && analysis.summary.length <= 2000 && typeof analysis.audience === "string" && analysis.audience.length <= 500 && isStringArray(analysis.goals) && isStringArray(analysis.pages) && isStringArray(analysis.needs) && isStringArray(analysis.risks) && isStringArray(analysis.questions);
}

function validateScope(value: unknown): value is Scope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Record<string, unknown>;
  const milestones = scope.milestones;
  return isStringArray(scope.deliverables) && isStringArray(scope.included) && isStringArray(scope.excluded) && Array.isArray(milestones) && milestones.length <= 20 && milestones.every((item) => {
    if (!item || typeof item !== "object") return false;
    const milestone = item as Record<string, unknown>;
    return [milestone.name, milestone.detail, milestone.timing].every((part) => typeof part === "string" && part.trim().length > 0 && part.length <= 300);
  }) && typeof scope.revisions === "number" && Number.isInteger(scope.revisions) && scope.revisions >= 0 && scope.revisions <= 20;
}

export function validateProjectInput(input: Record<string, unknown>) {
  const title = stringValue(input.title); const client = stringValue(input.client); const brief = stringValue(input.brief);
  if (!title || title.length > 120) throw new Error("Add a project name up to 120 characters.");
  if (!client || client.length > 120) throw new Error("Add a client or team name up to 120 characters.");
  if (!brief || brief.length < 24 || brief.length > 20000) throw new Error("Add a brief between 24 and 20,000 characters.");
  if (!isValidBriefAnalysis(input.analysis) || !validateScope(input.scope)) throw new Error("Your analysis and scope are malformed. Please analyze the brief again.");
  return { title, client, brief, analysis: input.analysis as BriefAnalysis, scope: input.scope as Scope };
}
