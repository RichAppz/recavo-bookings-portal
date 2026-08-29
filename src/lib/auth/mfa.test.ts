import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mfaStepFor, verifiedTotp } from "./mfa.ts";

describe("mfaStepFor", () => {
  it("proceeds when the session is already AAL2", () => {
    assert.equal(
      mfaStepFor({ currentLevel: "aal2", nextLevel: "aal2" }, { totp: [] }),
      "proceed",
    );
    assert.equal(
      mfaStepFor(
        { currentLevel: "aal2" },
        { totp: [{ id: "f1", status: "verified" }] },
      ),
      "proceed",
    );
  });

  it("challenges when a verified factor exists but the session is AAL1", () => {
    assert.equal(
      mfaStepFor(
        { currentLevel: "aal1", nextLevel: "aal2" },
        { totp: [{ id: "f1", status: "verified" }] },
      ),
      "challenge",
    );
  });

  it("enrolls when there is no verified factor", () => {
    assert.equal(mfaStepFor({ currentLevel: "aal1", nextLevel: "aal1" }, { totp: [] }), "enroll");
    assert.equal(mfaStepFor({ currentLevel: "aal1" }, null), "enroll");
    assert.equal(
      mfaStepFor(
        { currentLevel: "aal1" },
        { totp: [{ id: "pending", status: "unverified" }] },
      ),
      "enroll",
    );
  });
});

describe("verifiedTotp", () => {
  it("returns the first verified TOTP factor", () => {
    const found = verifiedTotp({
      totp: [
        { id: "a", status: "unverified" },
        { id: "b", status: "verified" },
      ],
    });
    assert.equal(found?.id, "b");
  });

  it("returns undefined when none are verified", () => {
    assert.equal(verifiedTotp({ totp: [{ id: "a", status: "unverified" }] }), undefined);
    assert.equal(verifiedTotp({ totp: [] }), undefined);
    assert.equal(verifiedTotp(null), undefined);
  });
});
