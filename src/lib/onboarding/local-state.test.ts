/**
 * @vitest-environment jsdom
 *
 * Reads and writes localStorage, so it needs a window. The rest of src/lib runs
 * in the faster node project.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import {
  getSkippedStepsLocally,
  isOnboardingDismissedLocally,
  setOnboardingDismissedLocally,
  skipOnboardingStepLocally,
} from "./local-state.ts";

beforeEach(() => {
  window.localStorage.clear();
});

describe("dismissal", () => {
  it("defaults to not dismissed", () => {
    assert.equal(isOnboardingDismissedLocally("biz_1"), false);
  });

  it("remembers a dismissal", () => {
    setOnboardingDismissedLocally("biz_1");
    assert.equal(isOnboardingDismissedLocally("biz_1"), true);
  });

  it("keeps businesses apart", () => {
    // Someone running two studios dismisses the checklist on the finished one;
    // the half-set-up one must still nag them.
    setOnboardingDismissedLocally("biz_1");
    assert.equal(isOnboardingDismissedLocally("biz_2"), false);
  });
});

describe("skipped steps", () => {
  it("starts empty", () => {
    assert.deepEqual(getSkippedStepsLocally("biz_1"), []);
  });

  it("accumulates without duplicating", () => {
    skipOnboardingStepLocally("biz_1", "stripe_connect");
    skipOnboardingStepLocally("biz_1", "policies");
    skipOnboardingStepLocally("biz_1", "stripe_connect");
    assert.deepEqual(getSkippedStepsLocally("biz_1"), ["stripe_connect", "policies"]);
  });

  it("keeps businesses apart", () => {
    skipOnboardingStepLocally("biz_1", "package");
    assert.deepEqual(getSkippedStepsLocally("biz_2"), []);
  });
});

describe("corrupt storage", () => {
  it("falls back rather than throwing on unparseable JSON", () => {
    // localStorage is user-writable and survives deploys, so a value written by
    // an older shape of this code must degrade to the default, not crash the
    // console on load.
    window.localStorage.setItem("recavo:onboarding:skipped:biz_1", "{not json");
    window.localStorage.setItem("recavo:onboarding:dismissed:biz_1", "{not json");
    assert.deepEqual(getSkippedStepsLocally("biz_1"), []);
    assert.equal(isOnboardingDismissedLocally("biz_1"), false);
  });
});
