/**
 * @vitest-environment jsdom
 *
 * Both modules stash what register collected into sessionStorage, so they need
 * a window.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import {
  clearPendingBusiness,
  readPendingBusiness,
  stashPendingBusiness,
} from "./pending-business.ts";
import {
  clearPendingProfile,
  readPendingProfile,
  stashPendingProfile,
  takePendingProfile,
} from "./pending-profile.ts";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("pending business", () => {
  it("round-trips what register collected", () => {
    stashPendingBusiness({ legalName: "Northside Strength", industryTemplateKey: "personal_pt" });
    assert.deepEqual(readPendingBusiness(), {
      legalName: "Northside Strength",
      industryTemplateKey: "personal_pt",
    });
  });

  it("reads as absent before anything is stashed, and after it is cleared", () => {
    assert.equal(readPendingBusiness(), null);
    stashPendingBusiness({ legalName: "Northside Strength", industryTemplateKey: "personal_pt" });
    clearPendingBusiness();
    assert.equal(readPendingBusiness(), null);
  });

  it("survives a corrupt value instead of breaking onboarding", () => {
    // Prefill is a convenience; a bad value should cost the prefill, not the
    // ability to create a business at all.
    window.sessionStorage.setItem("recavo.pendingBusiness", "{not json");
    assert.equal(readPendingBusiness(), null);
  });
});

describe("pending profile", () => {
  it("round-trips the name", () => {
    stashPendingProfile({ firstName: "Ada", lastName: "Lovelace" });
    assert.deepEqual(readPendingProfile(), { firstName: "Ada", lastName: "Lovelace" });
  });

  it("takePendingProfile reads once and leaves nothing behind", () => {
    // The name is PATCHed to /me exactly once; a second read must come back
    // empty or a later session would re-send a stale name.
    stashPendingProfile({ firstName: "Ada", lastName: "Lovelace" });
    assert.deepEqual(takePendingProfile(), { firstName: "Ada", lastName: "Lovelace" });
    assert.equal(takePendingProfile(), null);
    assert.equal(window.sessionStorage.getItem("recavo.pendingProfile"), null);
  });

  it("taking nothing is harmless", () => {
    assert.equal(takePendingProfile(), null);
  });

  it("clears on request", () => {
    stashPendingProfile({ firstName: "Ada", lastName: "Lovelace" });
    clearPendingProfile();
    assert.equal(readPendingProfile(), null);
  });

  it("survives a corrupt value", () => {
    window.sessionStorage.setItem("recavo.pendingProfile", "{not json");
    assert.equal(readPendingProfile(), null);
  });
});
