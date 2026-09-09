import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Booking } from "./api/types.ts";
import { formatHours, summariseBookings } from "./calendar-stats.ts";

function booking(over: Partial<Booking>): Booking {
  return {
    start: "2026-09-08T09:00:00Z",
    end: "2026-09-08T10:00:00Z",
    allDay: false,
    status: "confirmed",
    priceMinor: 5000,
    paidMinor: 0,
    paymentMethod: "none",
    leadCustomerId: "c1",
    ...over,
  } as Booking;
}

describe("calendar range totals", () => {
  it("counts live bookings, money booked/collected/owed, hours and clients", () => {
    const s = summariseBookings([
      booking({ paidMinor: 5000 }),
      booking({ paidMinor: 2000, leadCustomerId: "c2", end: "2026-09-08T10:30:00Z" }),
      booking({ priceMinor: 0, leadCustomerId: "c1" }),
    ]);
    assert.equal(s.active, 3);
    assert.equal(s.cancelled, 0);
    assert.equal(s.bookedMinor, 10_000);
    assert.equal(s.collectedMinor, 7000);
    assert.equal(s.outstandingMinor, 3000);
    assert.equal(s.timedMinutes, 210);
    assert.equal(s.clients, 2);
  });

  it("keeps cancelled jobs out of the totals but keeps the money they paid", () => {
    const s = summariseBookings([
      booking({ status: "cancelled_by_customer", paidMinor: 1500 }),
      booking({ status: "expired" }),
      booking({ status: "draft" }),
      booking({}),
    ]);
    assert.equal(s.active, 1);
    assert.equal(s.cancelled, 2);
    assert.equal(s.bookedMinor, 5000);
    assert.equal(s.collectedMinor, 1500);
    assert.equal(s.outstandingMinor, 5000);
  });

  it("counts all-day jobs separately from timed hours", () => {
    const s = summariseBookings([
      booking({ allDay: true, start: "2026-09-07T23:00:00Z", end: "2026-09-10T23:00:00Z" }),
      booking({}),
    ]);
    assert.equal(s.allDay, 1);
    assert.equal(s.timedMinutes, 60);
  });

  it("formats hours the way a diary would", () => {
    assert.equal(formatHours(45), "45 min");
    assert.equal(formatHours(60), "1 h");
    assert.equal(formatHours(870), "14.5 h");
  });
});
