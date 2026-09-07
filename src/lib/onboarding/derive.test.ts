import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type {
  Booking,
  CatalogueService,
  ConnectAccount,
  Customer,
  Location,
  OnboardingStepKey,
  Package,
  PolicyDocument,
  Staff,
} from "@/lib/api/types";
import { deriveBusinessOnboarding, type DeriveOnboardingInput } from "./derive.ts";

/**
 * The OpenAPI records carry dozens of fields; `deriveBusinessOnboarding` reads
 * a handful. Building only those keeps each case legible, and casting once here
 * beats repeating a 30-line literal in every test.
 */
const location = (over: Partial<Location> = {}) =>
  ({ id: "loc_1", active: true, publicVisible: false, ...over }) as Location;

const staff = (over: Partial<Staff> = {}) =>
  ({
    id: "stf_1",
    status: "active",
    workingRules: [{ weekday: 1, start: "09:00", end: "17:00" }],
    locationIds: ["loc_1"],
    ...over,
  }) as unknown as Staff;

const service = (over: Partial<CatalogueService> = {}) =>
  ({ id: "svc_1", active: true, publicVisible: false, ...over }) as CatalogueService;

const customer = (over: Partial<Customer> = {}) => ({ id: "cus_1", ...over }) as Customer;

const booking = (over: Partial<Booking> = {}) =>
  ({ id: "bkg_1", status: "confirmed", ...over }) as Booking;

const pkg = (over: Partial<Package> = {}) => ({ id: "pkg_1", active: true, ...over }) as Package;

const policy = (type: string, status = "published") =>
  ({ id: `pol_${type}`, type, status }) as unknown as PolicyDocument;

/** Nothing done yet: every step should read as incomplete from here. */
function emptyInput(over: Partial<DeriveOnboardingInput> = {}): DeriveOnboardingInput {
  return {
    businessId: "biz_1",
    locations: [],
    staff: [],
    services: [],
    customers: [],
    bookings: [],
    packages: [],
    policies: [],
    connect: null,
    ...over,
  };
}

const stepFor = (input: DeriveOnboardingInput, key: OnboardingStepKey) => {
  const step = deriveBusinessOnboarding(input).steps.find((s) => s.key === key);
  assert.ok(step, `expected a "${key}" step`);
  return step;
};

describe("deriveBusinessOnboarding shape", () => {
  it("returns all ten steps in the order the checklist renders them", () => {
    const result = deriveBusinessOnboarding(emptyInput());
    assert.deepEqual(
      result.steps.map((s) => s.key),
      [
        "location",
        "staff_availability",
        "service",
        "client",
        "first_booking",
        "saas_subscription",
        "public_booking",
        "stripe_connect",
        "policies",
        "package",
      ],
    );
  });

  it("counts only the five required steps towards progress", () => {
    // The optional half (billing, public booking, Stripe, policies, packages)
    // must not drag the percentage down, or a working studio never reads 100%.
    const result = deriveBusinessOnboarding(emptyInput());
    assert.equal(result.requiredTotal, 5);
    assert.equal(result.requiredCompleted, 0);
    assert.equal(result.percentComplete, 0);
    assert.equal(result.status, "in_progress");
  });

  it("gives every step somewhere to go", () => {
    for (const step of deriveBusinessOnboarding(emptyInput()).steps) {
      assert.match(step.href, /^\//, `${step.key} should link into the app`);
      assert.ok(step.title.length > 0);
    }
  });
});

describe("required step completion", () => {
  it("ticks location as soon as one exists", () => {
    assert.equal(stepFor(emptyInput(), "location").completed, false);
    assert.equal(stepFor(emptyInput({ locations: [location()] }), "location").completed, true);
  });

  it("wants availability to be active, scheduled, and placed somewhere", () => {
    // All three together, because a trainer missing any one of them produces no
    // bookable slots at all — a half-set-up staff member is not a tick.
    const complete = emptyInput({ staff: [staff()] });
    assert.equal(stepFor(complete, "staff_availability").completed, true);

    for (const gap of [
      { status: "invited" },
      { workingRules: [] },
      { locationIds: [] },
    ] as Partial<Staff>[]) {
      const input = emptyInput({ staff: [staff(gap)] });
      assert.equal(
        stepFor(input, "staff_availability").completed,
        false,
        `${JSON.stringify(gap)} should not count as available`,
      );
    }
  });

  it("ignores an archived service", () => {
    assert.equal(
      stepFor(emptyInput({ services: [service({ active: false })] }), "service").completed,
      false,
    );
    assert.equal(stepFor(emptyInput({ services: [service()] }), "service").completed, true);
  });

  it("ticks the client step on any customer", () => {
    assert.equal(stepFor(emptyInput({ customers: [customer()] }), "client").completed, true);
  });

  it("does not count a booking that never happened", () => {
    // Cancelling the one test booking should reopen the step, otherwise the
    // checklist claims a studio has proved the flow when it has not.
    for (const status of [
      "cancelled_by_customer",
      "cancelled_by_business",
      "late_cancelled",
      "expired",
    ]) {
      const input = emptyInput({ bookings: [booking({ status } as Partial<Booking>)] });
      assert.equal(stepFor(input, "first_booking").completed, false, `${status} should not count`);
    }
    assert.equal(stepFor(emptyInput({ bookings: [booking()] }), "first_booking").completed, true);
    assert.equal(
      stepFor(
        emptyInput({ bookings: [booking({ status: "completed" } as Partial<Booking>)] }),
        "first_booking",
      ).completed,
      true,
    );
  });

  it("reaches 100% and complete once the five required steps are done", () => {
    const input = emptyInput({
      locations: [location()],
      staff: [staff()],
      services: [service()],
      customers: [customer()],
      bookings: [booking()],
    });
    const result = deriveBusinessOnboarding(input);
    assert.equal(result.requiredCompleted, 5);
    assert.equal(result.percentComplete, 100);
    assert.equal(result.status, "complete");
  });

  it("rounds partial progress to whole percent", () => {
    const input = emptyInput({ locations: [location()], staff: [staff()] });
    assert.equal(deriveBusinessOnboarding(input).percentComplete, 40);
  });
});

describe("optional step completion", () => {
  it("needs both a public service and a public location to share a link", () => {
    // Either one alone yields a booking page with nothing bookable on it.
    const serviceOnly = emptyInput({
      services: [service({ publicVisible: true })],
      locations: [location({ publicVisible: false })],
    });
    const locationOnly = emptyInput({
      services: [service({ publicVisible: false })],
      locations: [location({ publicVisible: true })],
    });
    const both = emptyInput({
      services: [service({ publicVisible: true })],
      locations: [location({ publicVisible: true })],
    });
    assert.equal(stepFor(serviceOnly, "public_booking").completed, false);
    assert.equal(stepFor(locationOnly, "public_booking").completed, false);
    assert.equal(stepFor(both, "public_booking").completed, true);
  });

  it("will not call an inactive location public", () => {
    const input = emptyInput({
      services: [service({ publicVisible: true })],
      locations: [location({ publicVisible: true, active: false })],
    });
    assert.equal(stepFor(input, "public_booking").completed, false);
  });

  it("accepts Stripe either as charges-enabled or fully onboarded", () => {
    const charging = { chargesEnabled: true } as unknown as ConnectAccount;
    const onboarded = { onboardingState: "complete" } as unknown as ConnectAccount;
    const pending = {
      chargesEnabled: false,
      onboardingState: "pending",
    } as unknown as ConnectAccount;
    assert.equal(stepFor(emptyInput({ connect: charging }), "stripe_connect").completed, true);
    assert.equal(stepFor(emptyInput({ connect: onboarded }), "stripe_connect").completed, true);
    assert.equal(stepFor(emptyInput({ connect: pending }), "stripe_connect").completed, false);
  });

  it("requires cancellation and terms to be published, not merely drafted", () => {
    const drafts = emptyInput({
      policies: [policy("cancellation", "draft"), policy("terms", "draft")],
    });
    const onlyOne = emptyInput({ policies: [policy("cancellation")] });
    const both = emptyInput({ policies: [policy("cancellation"), policy("terms")] });
    assert.equal(stepFor(drafts, "policies").completed, false);
    assert.equal(stepFor(onlyOne, "policies").completed, false);
    assert.equal(stepFor(both, "policies").completed, true);
  });

  it("mirrors the saasEntitled flag", () => {
    assert.equal(stepFor(emptyInput(), "saas_subscription").completed, false);
    assert.equal(stepFor(emptyInput({ saasEntitled: true }), "saas_subscription").completed, true);
  });

  it("ignores an inactive package", () => {
    assert.equal(
      stepFor(emptyInput({ packages: [pkg({ active: false })] }), "package").completed,
      false,
    );
    assert.equal(stepFor(emptyInput({ packages: [pkg()] }), "package").completed, true);
  });
});

describe("skipping and dismissing", () => {
  it("marks an optional step as skipped", () => {
    const input = emptyInput({ skippedKeys: ["stripe_connect"] });
    assert.equal(stepFor(input, "stripe_connect").skipped, true);
  });

  it("refuses to skip a required step", () => {
    // The checklist offers no skip button for these, but the local skip list is
    // user-writable storage, so the derivation has to hold the line itself.
    const input = emptyInput({ skippedKeys: ["location" as OnboardingStepKey] });
    assert.equal(stepFor(input, "location").skipped, false);
  });

  it("dismissing keeps the progress figures and only changes status", () => {
    const input = emptyInput({
      locations: [location()],
      dismissed: true,
      dismissedAt: "2026-03-01T10:00:00.000Z",
    });
    const result = deriveBusinessOnboarding(input);
    assert.equal(result.status, "dismissed");
    assert.equal(result.dismissedAt, "2026-03-01T10:00:00.000Z");
    assert.equal(result.requiredCompleted, 1);
    assert.equal(result.percentComplete, 20);
  });

  it("stamps a dismissal that arrives without a time", () => {
    const result = deriveBusinessOnboarding(emptyInput({ dismissed: true }));
    assert.ok(result.dismissedAt, "expected a dismissal timestamp to be filled in");
    assert.ok(!Number.isNaN(Date.parse(result.dismissedAt!)));
  });
});
