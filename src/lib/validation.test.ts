import assert from "node:assert/strict";
import test from "node:test";
import { validateChangeProposalInput, validateProfileInput } from "./validation";

test("proposal validation rejects malformed money and timeline input", () => {
  const valid = {
    requestId: "request-1",
    title: "Booking flow",
    details: "Add a booking path.",
    affectedDeliverables: ["Classes page"],
    priceAdjustment: 250,
    currency: "USD",
    timelineImpact: "Adds two working days",
    rationale: "Needs a provider integration.",
  };
  assert.equal(validateChangeProposalInput(valid).priceAdjustment, 250);
  assert.throws(
    () =>
      validateChangeProposalInput({ ...valid, priceAdjustment: Number.NaN }),
    /price adjustment/,
  );
  assert.throws(
    () => validateChangeProposalInput({ ...valid, currency: "US" }),
    /currency/,
  );
  assert.throws(
    () => validateChangeProposalInput({ ...valid, timelineImpact: "" }),
    /timeline/,
  );
});

test("profile validation trims optional fields and bounds website input", () => {
  const profile = validateProfileInput({
    fullName: "  Owner One ",
    company: " Studio ",
    roleTitle: " Designer ",
    website: " https://example.com ",
    bio: "  A short bio. ",
  });
  assert.equal(profile.fullName, "Owner One");
  assert.equal(profile.website, "https://example.com");
  assert.throws(
    () => validateProfileInput({ ...profile, website: "javascript:alert(1)" }),
    /website/i,
  );
  assert.throws(
    () => validateProfileInput({ ...profile, bio: "x".repeat(2001) }),
    /2,000/i,
  );
});
