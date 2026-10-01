import assert from "node:assert/strict";
import test from "node:test";
import { validateChangeProposalInput } from "./validation";

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
