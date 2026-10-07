import assert from "node:assert/strict";
import test from "node:test";
import { POST as analyzeRoute } from "../app/api/analyze/route";
import { POST as reviewRoute } from "../app/api/review/[token]/route";

const cloudEnvironmentKeys = [
  "APP_ORIGIN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
] as const;

function useLocalCloudTestEnvironment() {
  const previous = new Map(
    cloudEnvironmentKeys.map((key) => [key, process.env[key]]),
  );
  process.env.APP_ORIGIN = "http://localhost:3002";
  for (const key of cloudEnvironmentKeys.slice(1)) delete process.env[key];
  return () => {
    for (const key of cloudEnvironmentKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test("mutating API rejects a foreign or missing browser origin", async () => {
  const restoreCloudEnvironment = useLocalCloudTestEnvironment();
  const body = JSON.stringify({
    brief: "A small studio needs a responsive site and a contact pathway.",
  });
  try {
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
  } finally {
    restoreCloudEnvironment();
  }
});
