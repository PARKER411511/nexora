import assert from "node:assert/strict";
import test from "node:test";
import { POST as analyzeRoute } from "../app/api/analyze/route";
import { POST as reviewRoute } from "../app/api/review/[token]/route";

test("mutating API rejects a foreign or missing browser origin", async () => {
  const body = JSON.stringify({
    brief: "A small studio needs a responsive site and a contact pathway.",
  });
  const foreign = await analyzeRoute(
    new Request("http://localhost:3002/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://foreign.example",
      },
      body,
    }),
  );
  assert.equal(foreign.status, 403);
  const missing = await analyzeRoute(
    new Request("http://localhost:3002/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
  assert.equal(missing.status, 403);
  const local = await analyzeRoute(
    new Request("http://localhost:3002/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3002",
      },
      body,
    }),
  );
  assert.equal(local.status, 503);
  const review = await reviewRoute(
    new Request("http://localhost:3002/api/review/unknown", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://foreign.example",
      },
      body: JSON.stringify({
        action: "approval",
        name: "Visitor",
        comment: "Nope",
      }),
    }),
    { params: Promise.resolve({ token: "unknown" }) },
  );
  assert.equal(review.status, 403);
});
