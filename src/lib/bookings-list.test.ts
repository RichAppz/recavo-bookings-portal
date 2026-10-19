import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Booking } from "./api/types.ts";
import {
  amountNote,
  bookingsCsv,
  dayGroupHeading,
  defaultSortDir,
  groupByDay,
  inTab,
  matchesQuery,
  needsAction,
  presetRange,
  rangeLabel,
  sortBookings,
  statusPill,
} from "./bookings-list.ts";

const NOW = new Date("2026-10-19T12:00:00Z");

function booking(over: Partial<Booking>): Booking {
  return {
    id: "b1",
    reference: "B-ABC123",
    start: "2026-10-20T09:00:00Z",
    end: "2026-10-20T10:00:00Z",
    allDay: false,
    status: "confirmed",
    attendanceStatus: "unknown",
    priceMinor: 5000,
    paidMinor: 5000,
    depositMinor: null,
    paymentMethod: "none",
    currency: "GBP",
    leadCustomerId: "c1",
    holdExpiresAt: null,
    serviceSnapshot: { serviceId: "s1", name: "PT session" },
    ...over,
  } as unknown as Booking;
}

describe("needsAction", () => {
  it("flags held bookings", () => {
    assert.equal(needsAction(booking({ status: "awaiting_payment", paidMinor: 0 }), NOW), true);
    assert.equal(needsAction(booking({ status: "held", paidMinor: 0 }), NOW), true);
  });
  it("flags money owed only when the session is within seven days", () => {
    assert.equal(needsAction(booking({ paidMinor: 0 }), NOW), true);
    assert.equal(
      needsAction(
        booking({ paidMinor: 0, start: "2026-11-05T09:00:00Z", end: "2026-11-05T10:00:00Z" }),
        NOW,
      ),
      false,
    );
    assert.equal(needsAction(booking({ paidMinor: 2000, depositMinor: 2000 }), NOW), true);
  });
  it("flags past sessions nobody has marked", () => {
    const past = { start: "2026-10-18T09:00:00Z", end: "2026-10-18T10:00:00Z" };
    assert.equal(needsAction(booking(past), NOW), true);
    assert.equal(needsAction(booking({ ...past, attendanceStatus: "attended" }), NOW), false);
    assert.equal(needsAction(booking({ ...past, status: "no_show" }), NOW), false);
  });
  it("never flags cancelled, expired or draft bookings", () => {
    assert.equal(
      needsAction(booking({ status: "cancelled_by_customer", paidMinor: 0 }), NOW),
      false,
    );
    assert.equal(needsAction(booking({ status: "expired", paidMinor: 0 }), NOW), false);
    assert.equal(needsAction(booking({ status: "draft", paidMinor: 0 }), NOW), false);
  });
});

describe("tabs and sorting", () => {
  it("splits upcoming and past on the end time", () => {
    const live = booking({ start: "2026-10-19T11:30:00Z", end: "2026-10-19T12:30:00Z" });
    const done = booking({ start: "2026-10-19T10:00:00Z", end: "2026-10-19T11:00:00Z" });
    assert.equal(inTab(live, "upcoming", NOW), true);
    assert.equal(inTab(live, "past", NOW), false);
    assert.equal(inTab(done, "past", NOW), true);
    assert.equal(inTab(done, "all", NOW), true);
  });
  it("defaults to soonest first for upcoming, newest first for the rest", () => {
    assert.equal(defaultSortDir("upcoming"), "asc");
    assert.equal(defaultSortDir("past"), "desc");
    assert.equal(defaultSortDir("all"), "desc");
  });
  it("sorts by time, amount or client name with time as the tiebreak", () => {
    const a = booking({ id: "a", priceMinor: 100, start: "2026-10-21T09:00:00Z" });
    const b = booking({ id: "b", priceMinor: 300, start: "2026-10-20T09:00:00Z" });
    const names: Record<string, string> = { a: "Zed", b: "Amy" };
    const name = (x: Booking) => names[x.id] ?? "";
    assert.deepEqual(
      sortBookings([a, b], "time", "asc", name).map((x) => x.id),
      ["b", "a"],
    );
    assert.deepEqual(
      sortBookings([a, b], "amount", "desc", name).map((x) => x.id),
      ["b", "a"],
    );
    assert.deepEqual(
      sortBookings([a, b], "client", "asc", name).map((x) => x.id),
      ["b", "a"],
    );
  });
});

describe("presetRange / rangeLabel", () => {
  const today = new Date(2026, 9, 19); // Monday
  it("builds inclusive local ranges", () => {
    assert.deepEqual(presetRange("this_week", today), { from: "2026-10-19", to: "2026-10-25" });
    assert.deepEqual(presetRange("next_7", today), { from: "2026-10-19", to: "2026-10-25" });
    assert.deepEqual(presetRange("this_month", today), { from: "2026-10-01", to: "2026-10-31" });
    assert.deepEqual(presetRange("last_30", today), { from: "2026-09-20", to: "2026-10-19" });
    assert.deepEqual(presetRange("default", today), { from: "2026-10-05", to: "2026-11-18" });
  });
  it("labels a range the way the spec reads it", () => {
    assert.equal(rangeLabel("2026-10-05", "2026-11-18"), "5 Oct to 18 Nov");
    assert.equal(rangeLabel("2026-12-28", "2027-01-04"), "28 Dec 2026 to 4 Jan 2027");
    assert.equal(rangeLabel("2026-10-05", "2026-10-05"), "5 Oct");
  });
});

describe("matchesQuery", () => {
  const b = booking({});
  const client = { name: "Sam Taylor", email: "sam@example.com", phone: "+44 7700 900123" };
  it("matches reference, service and client details", () => {
    assert.equal(matchesQuery(b, "abc1", client), true);
    assert.equal(matchesQuery(b, "pt sess", client), true);
    assert.equal(matchesQuery(b, "taylor", client), true);
    assert.equal(matchesQuery(b, "sam@", client), true);
    assert.equal(matchesQuery(b, "07700 900", client), true);
    assert.equal(matchesQuery(b, "nobody", client), false);
    assert.equal(matchesQuery(b, "", undefined), true);
  });
});

describe("grouping and headings", () => {
  it("groups consecutive rows by day", () => {
    const groups = groupByDay(["a:1", "b:1", "c:2"], (r) => r.split(":")[1]!);
    assert.deepEqual(
      groups.map((g) => [g.day, g.rows.length]),
      [
        ["1", 2],
        ["2", 1],
      ],
    );
  });
  it("names today, tomorrow and yesterday, and adds the year when it differs", () => {
    assert.equal(dayGroupHeading("2026-10-19", "2026-10-19"), "Today, Mon 19 Oct");
    assert.equal(dayGroupHeading("2026-10-20", "2026-10-19"), "Tomorrow, Tue 20 Oct");
    assert.equal(dayGroupHeading("2026-10-18", "2026-10-19"), "Yesterday, Sun 18 Oct");
    assert.equal(dayGroupHeading("2025-10-18", "2026-10-19"), "Sat 18 Oct 2025");
  });
});

describe("statusPill / amountNote", () => {
  const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(0)}`;
  const time = () => "20:10";
  it("reads attendance over status and keeps the specific wording as detail", () => {
    assert.deepEqual(statusPill(booking({ attendanceStatus: "attended" }), NOW), {
      label: "Attended",
      tone: "green",
      tick: true,
    });
    assert.equal(
      statusPill(booking({ status: "late_cancelled" }), NOW).detail,
      "Late cancellation",
    );
    assert.equal(statusPill(booking({ status: "awaiting_payment" }), NOW).label, "Held");
    assert.equal(statusPill(booking({ paidMinor: 0 }), NOW).label, "Unpaid");
    assert.equal(statusPill(booking({}), NOW).label, "Confirmed");
  });
  it("says a finished job is not marked done, paid or not, until someone marks it", () => {
    const past = { start: "2026-10-05T09:00:00Z", end: "2026-10-05T10:00:00Z" };
    assert.equal(statusPill(booking(past), NOW).label, "Not marked done");
    assert.equal(statusPill(booking(past), NOW).tone, "amber");
    assert.equal(statusPill(booking({ ...past, paidMinor: 0 }), NOW).label, "Not marked done");
    assert.equal(
      statusPill(booking({ ...past, attendanceStatus: "attended" }), NOW).label,
      "Attended",
    );
    assert.equal(statusPill(booking({ ...past, status: "no_show" }), NOW).label, "No-show");
    assert.equal(statusPill(booking({ ...past, status: "completed" }), NOW).label, "Completed");
    assert.equal(
      statusPill(booking({ ...past, status: "cancelled_by_business" }), NOW).label,
      "Cancelled",
    );
    // Still running (or not started): nothing to mark yet.
    assert.equal(
      statusPill(booking({ start: "2026-10-19T11:00:00Z", end: "2026-10-19T13:00:00Z" }), NOW)
        .label,
      "Confirmed",
    );
    // Every such row is one Needs action shows, so the tab and the pill agree.
    assert.equal(needsAction(booking(past), NOW), true);
  });
  it("notes the hold or the balance under the amount", () => {
    assert.equal(
      amountNote(booking({ status: "held", holdExpiresAt: "2026-10-19T19:10:00Z" }), money, time),
      "Held until 20:10",
    );
    assert.equal(amountNote(booking({ paidMinor: 2000 }), money, time), "GBP 30 due");
    assert.equal(amountNote(booking({}), money, time), null);
    assert.equal(
      amountNote(booking({ status: "cancelled_by_business", paidMinor: 0 }), money, time),
      null,
    );
  });
});

describe("bookingsCsv", () => {
  it("quotes commas and writes money in major units", () => {
    const csv = bookingsCsv(
      [booking({ serviceSnapshot: { serviceId: "s", name: "Wash, wax" } as never })],
      {
        client: () => "Sam Taylor",
        trainer: () => "Mia",
        location: () => "Studio",
        date: () => "20/10/2026",
        time: (iso) => (iso.endsWith("09:00:00Z") ? "09:00" : "10:00"),
      },
    );
    const [header, row] = csv.split("\n");
    assert.ok(header!.startsWith("Reference,Date,Start,End,Service"));
    assert.ok(row!.includes('"Wash, wax"'));
    assert.ok(row!.includes(",50.00,50.00,GBP,confirmed,unknown"));
  });
});
