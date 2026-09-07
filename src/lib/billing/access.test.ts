import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  isBillingBlocked,
  isBillingPath,
  isConsoleAccessAllowed,
  isSaasSubscriptionComplete,
  subscriptionAccessState,
} from "./access.ts";

describe("subscriptionAccessState", () => {
  it("passes through every state the API can send", () => {
    for (const state of ["none", "pending", "trial", "entitled", "grace", "restricted", "ended"]) {
      assert.equal(subscriptionAccessState({ accessState: state }), state);
    }
  });

  it("treats anything it does not recognise as no access", () => {
    // A state added to the API before the portal knows about it must lock the
    // console, not open it: the safe default is the one that cannot leak paid
    // features to an unpaid workspace.
    assert.equal(subscriptionAccessState({ accessState: "cancelled_pending_migration" }), "none");
    assert.equal(subscriptionAccessState({ accessState: null }), "none");
    assert.equal(subscriptionAccessState({}), "none");
    assert.equal(subscriptionAccessState(null), "none");
    assert.equal(subscriptionAccessState(undefined), "none");
  });
});

describe("isConsoleAccessAllowed", () => {
  it("opens the console while trialling, paying, or in grace", () => {
    // Grace matters: a failed card must not lock a studio out mid-session.
    assert.equal(isConsoleAccessAllowed({ accessState: "trial" }), true);
    assert.equal(isConsoleAccessAllowed({ accessState: "entitled" }), true);
    assert.equal(isConsoleAccessAllowed({ accessState: "grace" }), true);
  });

  it("keeps it shut everywhere else", () => {
    assert.equal(isConsoleAccessAllowed({ accessState: "none" }), false);
    assert.equal(isConsoleAccessAllowed({ accessState: "pending" }), false);
    assert.equal(isConsoleAccessAllowed({ accessState: "restricted" }), false);
    assert.equal(isConsoleAccessAllowed({ accessState: "ended" }), false);
    assert.equal(isConsoleAccessAllowed(null), false);
  });
});

describe("isBillingBlocked", () => {
  it("blocks when there is no subscription at all", () => {
    // A business created seconds ago has no subscription record yet, and that
    // is exactly the case that must be sent to /billing.
    assert.equal(isBillingBlocked(null), true);
    assert.equal(isBillingBlocked(undefined), true);
  });

  it("does not block the states that open the console", () => {
    assert.equal(isBillingBlocked({ accessState: "trial" }), false);
    assert.equal(isBillingBlocked({ accessState: "entitled" }), false);
    assert.equal(isBillingBlocked({ accessState: "grace" }), false);
  });

  it("blocks the states that close it", () => {
    assert.equal(isBillingBlocked({ accessState: "none" }), true);
    assert.equal(isBillingBlocked({ accessState: "pending" }), true);
    assert.equal(isBillingBlocked({ accessState: "restricted" }), true);
    assert.equal(isBillingBlocked({ accessState: "ended" }), true);
  });
});

describe("isBillingPath", () => {
  it("covers the billing surface and its return URLs", () => {
    assert.equal(isBillingPath("/billing"), true);
    assert.equal(isBillingPath("/billing/success"), true);
    assert.equal(isBillingPath("/billing/cancel"), true);
  });

  it("does not match a path that merely starts with the same letters", () => {
    // Without the trailing slash this would swallow any future /billings or
    // /billing-report route and quietly exempt it from the console lock.
    assert.equal(isBillingPath("/billings"), false);
    assert.equal(isBillingPath("/billing-report"), false);
    assert.equal(isBillingPath("/"), false);
  });
});

describe("isSaasSubscriptionComplete", () => {
  it("counts any console-opening access state as done", () => {
    assert.equal(isSaasSubscriptionComplete({ accessState: "trial" }), true);
    assert.equal(isSaasSubscriptionComplete({ accessState: "entitled" }), true);
    assert.equal(isSaasSubscriptionComplete({ accessState: "grace" }), true);
  });

  it("falls back to the Stripe status when access has not caught up", () => {
    // Checkout returns before the webhook lands, so for a moment the row says
    // "trialing" with no access state. The onboarding tick should still show.
    assert.equal(isSaasSubscriptionComplete({ accessState: "pending", status: "trialing" }), true);
    assert.equal(isSaasSubscriptionComplete({ accessState: "pending", status: "active" }), true);
  });

  it("stays incomplete for a subscription that never started", () => {
    assert.equal(isSaasSubscriptionComplete({ accessState: "none", status: "incomplete" }), false);
    assert.equal(isSaasSubscriptionComplete({ accessState: "ended", status: "canceled" }), false);
    assert.equal(isSaasSubscriptionComplete(null), false);
  });
});
