import assert from "node:assert/strict";
import test from "node:test";
import { analyzeWithOpenAI } from "./analyzer";
import { POST as analyzeRoute } from "../app/api/analyze/route";

const brief =
  "A strength studio needs a responsive website with classes, booking, and a clear membership journey.";

test("OpenAI adapter parses the raw Responses REST output envelope", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "A clear studio website.",
                  audience: "New members",
                  goals: ["Drive bookings"],
                  pages: ["Home", "Classes"],
                  needs: ["Booking pathway"],
                  risks: ["Availability needs confirmation"],
                  questions: ["Which booking tool is used?"],
                }),
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  try {
    const analysis = await analyzeWithOpenAI(brief);
    assert.equal(analysis.mode, "openai");
    assert.equal(analysis.pages[1], "Classes");
    assert.equal(analysis.questions[0], "Which booking tool is used?");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("malformed or refused provider output is covered by the adapter while an unconfigured API fails closed", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "Cannot comply" }],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  try {
    const response = await analyzeRoute(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3002",
        },
        body: JSON.stringify({ brief, preferOpenAI: true }),
      }),
    );
    const data = (await response.json()) as {
      analysis: { mode: string };
      notice?: string;
    };
    assert.equal(response.status, 503);
    assert.match((data as unknown as { error?: string }).error || "", /Cloud storage is not configured/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
