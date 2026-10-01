import type { BriefAnalysis, Scope } from "./types";
import { isValidBriefAnalysis } from "./validation";

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

export function analyzeBrief(brief: string): BriefAnalysis {
  const text = brief.trim();
  const lower = text.toLowerCase();
  const pages = ["Home"];
  if (/about|team|story|company/.test(lower)) pages.push("About");
  if (/service|offer|solution|program|class/.test(lower)) pages.push("Services");
  if (/contact|enquir|book|schedule|appointment/.test(lower)) pages.push("Contact");
  if (/blog|article|journal|news/.test(lower)) pages.push("Journal");
  if (/work|project|portfolio|case stud/.test(lower)) pages.push("Work");
  if (/shop|store|product|commerce|buy|checkout/.test(lower)) pages.push("Shop / product detail");

  const goals = [
    /lead|enquir|contact|book|schedule/.test(lower) ? "Create a clear path to enquire or book" : "Explain the offer clearly to the right audience",
    /brand|visual|identity|premium|luxury/.test(lower) ? "Translate the existing brand into a confident digital experience" : "Make the experience easy to scan on mobile and desktop",
  ];
  if (/sell|shop|commerce|checkout/.test(lower)) goals.push("Support a focused purchase journey");
  if (/seo|search|google|content/.test(lower)) goals.push("Create a foundation for discoverable content");

  const needs = [
    "Responsive page system with reusable sections",
    "Content hierarchy and copy placeholders for review",
    /form|contact|enquir|book|appointment/.test(lower) ? "A validated enquiry or booking form" : "A clear contact action",
  ];
  if (/cms|edit|update|content/.test(lower)) needs.push("A lightweight content editing path");
  if (/analytics|track|measure/.test(lower)) needs.push("Analytics and conversion event plan");

  const risks = [
    "Final content and photography may affect page rhythm and delivery timing",
    /logo|brand|identity|visual/.test(lower) ? "Brand assets and usage rules need to be confirmed before visual design" : "The visual direction needs a focused reference set",
  ];
  if (/shop|commerce|payment|checkout/.test(lower)) risks.push("Commerce, tax, and fulfilment requirements need a separate technical pass");
  if (/integration|api|crm|mailchimp|hubspot/.test(lower)) risks.push("Third-party integration credentials and limits are not yet defined");

  const questions = [
    "Who is the primary audience, and what should they do first?",
    "Which content, photography, and brand assets are ready for the first review?",
    /deadline|launch|date|week/.test(lower) ? "Which launch date is fixed, and what can move if timing changes?" : "Is there a target launch window or event to work toward?",
  ];
  if (/book|schedule|appointment|class|session/.test(lower)) questions.push("Which booking or slot-management tool should the enquiry connect to, and what happens after a booking?");
  if (/membership|pricing|plan|subscription|payment|pay/.test(lower)) questions.push("How should membership options, pricing, and payment expectations be explained or handled?");
  return {
    mode: "local",
    summary: text.length > 180 ? `${text.slice(0, 177).trim()}…` : text || "A focused digital experience with a clear next step.",
    audience: /b2b|business|founder|team|company/.test(lower) ? "Prospective partners and decision-makers" : "People discovering the business for the first time",
    goals: unique(goals), pages: unique(pages), needs: unique(needs), risks: unique(risks), questions,
  };
}

export function makeDefaultScope(analysis: BriefAnalysis): Scope {
  return {
    deliverables: ["Responsive website design and build", "Content-ready page templates", "Launch handoff and basic QA"],
    included: [
      ...analysis.pages.slice(0, 5).map((page) => `${page} page or template`),
      "Mobile and desktop responsive states",
      "One enquiry or contact pathway",
    ],
    excluded: ["Copywriting and final photography", "Paid media, SEO campaigns, and ongoing maintenance", "Complex third-party integrations unless added as a change request"],
    milestones: [
      { name: "Direction", detail: "Confirm audience, content shape, and visual route", timing: "Week 1" },
      { name: "Design", detail: "Review the key page and responsive component system", timing: "Weeks 2–3" },
      { name: "Build", detail: "Develop approved screens, test, and prepare handoff", timing: "Weeks 4–5" },
    ],
    revisions: 2,
  };
}

type OpenAIResponse = {
  status?: string;
  output_text?: unknown;
  output?: unknown;
  error?: { message?: string };
};

function extractResponseText(payload: OpenAIResponse): string {
  if (payload.error?.message) throw new Error(`OpenAI error: ${payload.error.message}`);
  if (payload.status && payload.status !== "completed") throw new Error(`OpenAI response was ${payload.status}`);
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const parts: string[] = [];
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const typedPart = part as { type?: unknown; text?: unknown; refusal?: unknown };
        if (typedPart.type === "refusal" || typeof typedPart.refusal === "string") throw new Error("OpenAI refused to return a structured analysis");
        if (typedPart.type === "output_text" && typeof typedPart.text === "string") parts.push(typedPart.text);
      }
    }
  }
  const text = parts.join("").trim();
  if (!text) throw new Error("OpenAI returned no structured analysis");
  return text;
}

export async function analyzeWithOpenAI(brief: string): Promise<BriefAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" }, audience: { type: "string" },
      goals: { type: "array", items: { type: "string" } }, pages: { type: "array", items: { type: "string" } },
      needs: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } }, questions: { type: "array", items: { type: "string" } },
    }, required: ["summary", "audience", "goals", "pages", "needs", "risks", "questions"],
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [{ role: "system", content: "Turn a freelance web project brief into concise scope planning inputs. Do not invent facts." }, { role: "user", content: brief }],
        text: { format: { type: "json_schema", name: "nexora_brief_analysis", strict: true, schema } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI responded ${response.status}`);
    const payload = await response.json() as OpenAIResponse;
    let parsed: unknown;
    try { parsed = JSON.parse(extractResponseText(payload)); } catch (error) { throw new Error(error instanceof Error ? error.message : "OpenAI returned invalid JSON"); }
    const analysis = { ...(parsed && typeof parsed === "object" ? parsed : {}), mode: "openai" };
    if (!isValidBriefAnalysis(analysis)) throw new Error("OpenAI returned an incomplete analysis");
    return analysis;
  } finally { clearTimeout(timeout); }
}
