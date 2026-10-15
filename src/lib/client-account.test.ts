import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cancelOutcome, relativeWhen } from "./client-account.ts";

const TZ = "Europe/London";

type CancelInput = Parameters<typeof cancelOutcome>[0];

function booking(overrides: Record<string, unknown> = {}): CancelInput {
  return {
    start: "2026-10-16T08:00:00.000Z",
    status: "confirmed",
    priceMinor: 4500,
    currency: "GBP",
    paymentMethod: "card",
    serviceSnapshot: { cancellationPolicy: { windowHours: 24 } },
    ...overrides,
  } as unknown as CancelInput;
}

const sentence = (o: ReturnType<typeof cancelOutcome>) => `${o.before}${o.emphasis}${o.after}`;

describe("relativeWhen", () => {
  it("says Today / Tomorrow / the date in the studio's timezone", () => {
    const now = new Date("2026-10-15T07:00:00.000Z");
    assert.equal(relativeWhen("2026-10-15T08:00:00.000Z", TZ, now), "Today, 09:00");
    assert.equal(relativeWhen("2026-10-16T08:00:00.000Z", TZ, now), "Tomorrow, 09:00");
    assert.equal(relativeWhen("2026-10-23T08:00:00.000Z", TZ, now), "Fri 23 Oct, 09:00");
  });
});

describe("cancelOutcome — the exact money consequence", () => {
  const late = Date.parse("2026-10-15T20:00:00.000Z"); // 12h before
  const early = Date.parse("2026-10-14T08:00:00.000Z"); // 48h before

  it("a paid session inside the window is not refunded", () => {
    const o = cancelOutcome(booking({ paidMinor: 4500 }), "Northside Strength", late);
    assert.equal(o.tone, "warn");
    assert.equal(o.emphasis, "the £45.00 is not refunded");
    assert.equal(
      sentence(o),
      "It's less than 24 hours away, so Northside Strength's policy means the £45.00 is not refunded.",
    );
  });

  it("a paid session outside the window is refundable, arranged by the business", () => {
    const o = cancelOutcome(booking({ paidMinor: 4500 }), "Northside Strength", early);
    assert.equal(o.tone, "ok");
    assert.match(
      sentence(o),
      /^It's more than 24 hours away, so the £45\.00 you paid is refundable/,
    );
    assert.match(sentence(o), /Northside Strength will arrange the refund\.$/);
  });

  it("a credit booking inside the window uses the credit", () => {
    const o = cancelOutcome(booking({ paymentMethod: "credit" }), "Northside Strength", late);
    assert.equal(o.tone, "warn");
    assert.equal(o.emphasis, "the session credit is used");
  });

  it("a credit booking outside the window returns the credit", () => {
    const o = cancelOutcome(booking({ paymentMethod: "credit" }), null, early);
    assert.equal(o.tone, "ok");
    assert.equal(o.emphasis, "session credit comes back");
  });

  it("an unpaid session inside the window is a late cancellation of the price", () => {
    const o = cancelOutcome(booking({ paymentMethod: "pay_later" }), "Northside Strength", late);
    assert.equal(o.tone, "warn");
    assert.equal(o.emphasis, "late cancellation");
    assert.match(o.after, /£45\.00 session/);
  });

  it("a free session has nothing to pay", () => {
    const o = cancelOutcome(booking({ priceMinor: 0 }), "Northside Strength", late);
    assert.equal(o.tone, "ok");
    assert.equal(sentence(o), "Nothing to pay. Northside Strength will be told.");
  });

  it("with no notice window at all, any time is free to cancel", () => {
    const o = cancelOutcome(
      booking({ serviceSnapshot: { cancellationPolicy: { windowHours: 0 } } }),
      "Studio",
      late,
    );
    assert.equal(o.tone, "ok");
    assert.match(sentence(o), /^Free to cancel: there's nothing to pay\./);
  });
});
