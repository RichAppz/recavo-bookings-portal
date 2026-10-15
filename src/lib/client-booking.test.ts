import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDays,
  addMonths,
  bookingAdditionalServiceIds,
  canClientCancelBooking,
  canClientMoveBooking,
  clientCancelDeadlineIso,
  clientCancelWindowHours,
  isWithinClientCancelWindow,
  monthGrid,
  monthOf,
  nextAvailableLabel,
  shortPlace,
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

  it("steps months, carrying over the year", () => {
    assert.equal(monthOf("2026-10-16"), "2026-10");
    assert.equal(addMonths("2026-10", 1), "2026-11");
    assert.equal(addMonths("2026-12", 1), "2027-01");
    assert.equal(addMonths("2026-01", -1), "2025-12");
  });

  it("lays a month out Monday-first in whole weeks", () => {
    // October 2026 starts on a Thursday: three blanks, 31 days, one trailing blank.
    const cells = monthGrid("2026-10");
    assert.equal(cells.length, 35);
    assert.deepEqual(cells.slice(0, 4), [null, null, null, "2026-10-01"]);
    assert.equal(cells[33], "2026-10-31");
    assert.equal(cells[34], null);
    // A month starting on a Monday has no leading blanks.
    assert.equal(monthGrid("2026-06")[0], "2026-06-01");
    // February 2027 fits exactly four weeks.
    assert.equal(monthGrid("2027-02").length, 28);
  });

  it("shortens an address to the town and outward postcode", () => {
    assert.equal(shortPlace("12 Mill Street, Leeds LS6 2AB"), "Leeds LS6");
    assert.equal(shortPlace("Unit 4, The Depot, Manchester, M1 4PQ"), "Manchester M1");
    assert.equal(shortPlace("Studio 2, Brighton"), "Brighton");
    assert.equal(shortPlace(""), null);
    assert.equal(shortPlace(null), null);
  });

  it("labels the next free time relative to today", () => {
    const tz = "Europe/London";
    assert.equal(nextAvailableLabel("2026-10-15T16:00:00Z", tz, "2026-10-15"), "Today, 17:00");
    assert.equal(nextAvailableLabel("2026-10-16T08:00:00Z", tz, "2026-10-15"), "Tomorrow, 09:00");
    assert.equal(nextAvailableLabel("2026-10-19T08:00:00Z", tz, "2026-10-15"), "Mon 19 Oct, 09:00");
  });
});
