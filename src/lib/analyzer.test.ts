import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBrief, makeDefaultScope } from "./analyzer";

test("local analyzer extracts domain signals without pretending to be AI", () => {
  const analysis = analyzeBrief("A yoga studio needs a calm website with classes, a contact form, and a blog before launch.");
  assert.equal(analysis.mode, "local");
  assert.deepEqual(analysis.pages, ["Home", "Services", "Contact", "Journal"]);
  assert.ok(analysis.needs.some((item) => item.includes("form")));
});

test("default scope is derived from analysis and has bounded milestones", () => {
  const scope = makeDefaultScope(analyzeBrief("A simple portfolio website for an illustrator."));
  assert.ok(scope.deliverables.length > 0);
  assert.equal(scope.milestones.length, 3);
  assert.equal(scope.revisions, 2);
});
