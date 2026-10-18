import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normaliseTrialEmail } from "./trial-start.ts";

describe("website trial handoff", () => {
  it("normalises the address the signup page records", () => {
    assert.equal(normaliseTrialEmail("  Alex@Studio.co.uk "), "alex@studio.co.uk");
    assert.equal(normaliseTrialEmail("not an email"), null);
    assert.equal(normaliseTrialEmail("a@b"), null);
  });
});
