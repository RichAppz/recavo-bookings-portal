import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDays,
  bookingAdditionalServiceIds,
  canClientCancelBooking,
  canClientMoveBooking,
  clientCancelDeadlineIso,
  clientCancelWindowHours,
  isWithinClientCancelWindow,
} from "./client-booking.ts";

function booking(
  patch: Partial<{
    status: "confirmed" | "completed";
    allDay: boolean;
    start: string;
    serviceSnapshot: { cancellationPolicy: { windowHours: number } };
  }> = {},
) {
  return {
    status: "confirmed" as const,
    allDay: false,
    start: "2026-10-13T09:00:00.000Z",
    serviceSnapshot: { cancellationPolicy: { windowHours: 24 } },
    lineItems: [{ serviceId: "svc_1" }],
    ...patch,
  };
}

describe("client booking change window", () => {
  it("lets a client move a future timed session", () => {
    assert.equal(canClientMoveBooking(booking(), Date.parse("2026-10-01T00:00:00.000Z")), true);
  });

  it("does not offer move for an all-day job (no public slot to pick)", () => {
    assert.equal(
      canClientMoveBooking(booking({ allDay: true }), Date.parse("2026-10-01T00:00:00.000Z")),
      false,
    );
    assert.equal(
      canClientCancelBooking(booking({ allDay: true }), Date.parse("2026-10-01T00:00:00.000Z")),
      true,
    );
  });

  it("treats a cancel 24h before start as timely", () => {
    const b = booking();
    assert.equal(clientCancelDeadlineIso(b), "2026-10-12T09:00:00.000Z");
    assert.equal(isWithinClientCancelWindow(b, Date.parse("2026-10-12T08:59:00.000Z")), true);
    assert.equal(isWithinClientCancelWindow(b, Date.parse("2026-10-12T09:00:00.000Z")), false);
  });

  it("copes with the slimmer booking the portal API sends a customer", () => {
    // No lineItems, allDay or cancellation policy on the payload — must not throw.
    const slim = { status: "confirmed", start: "2026-10-13T09:00:00.000Z" };
    const now = Date.parse("2026-10-01T00:00:00.000Z");
    assert.equal(canClientMoveBooking(slim, now), true);
    assert.equal(canClientCancelBooking(slim, now), true);
    assert.equal(clientCancelWindowHours(slim), 0);
    assert.deepEqual(bookingAdditionalServiceIds(slim), []);
  });

  it("adds calendar days without shifting the month on UTC", () => {
    assert.equal(addCalendarDays("2026-10-13", 1), "2026-10-14");
    assert.equal(addCalendarDays("2026-10-31", 1), "2026-11-01");
  });
});
