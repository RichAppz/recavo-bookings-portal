import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Booking, ServiceFollowUp } from "@/lib/api/types";
import {
  customIntervalMonths,
  duePill,
  formatReminderWhen,
  lastInLabel,
  leadFits,
  matchesRuleFilter,
  pastClientsFor,
  reminderStats,
  reminderTab,
  remindersAvailable,
  ruleResults,
  sortForTab,
  timeline,
} from "./service-reminders.ts";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const TZ = "Europe/London";

function fu(over: Partial<ServiceFollowUp> = {}): ServiceFollowUp {
  return {
    id: "f1",
    businessId: "b",
    customerId: "c1",
    bookingId: "bk0",
    serviceId: "s1",
    ruleId: "r1",
    source: "rule",
    linkedRecordId: null,
    serviceName: "Ceramic coating",
    label: null,
    title: "Ceramic coating",
    lastDoneAt: "2026-04-21T12:00:00.000Z",
    dueAt: "2026-11-03T12:00:00.000Z",
    remindAt: "2026-10-20T12:00:00.000Z",
    status: "scheduled",
    sentAt: null,
    dismissedAt: null,
    snoozedUntil: null,
    supersededByBookingId: null,
    customer: null,
    linkedRecord: null,
    booking: null,
    createdAt: "2026-04-21T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...over,
  } as ServiceFollowUp;
}

describe("remindersAvailable", () => {
  it("is automotive only", () => {
    assert.equal(remindersAvailable("car_detailing"), true);
    assert.equal(remindersAvailable("personal_training"), false);
    assert.equal(remindersAvailable(undefined), false);
  });
});

describe("reminderTab", () => {
  it("files each status under its tab", () => {
    assert.equal(reminderTab(fu(), NOW), "due");
    assert.equal(reminderTab(fu({ status: "sent" }), NOW), "due");
    assert.equal(reminderTab(fu({ snoozedUntil: "2026-11-01T00:00:00Z" }), NOW), "snoozed");
    assert.equal(reminderTab(fu({ snoozedUntil: "2026-10-01T00:00:00Z" }), NOW), "due");
    assert.equal(reminderTab(fu({ status: "completed" }), NOW), "booked");
    assert.equal(reminderTab(fu({ status: "dismissed" }), NOW), "dismissed");
    assert.equal(reminderTab(fu({ status: "cancelled" }), NOW), null);
  });
});

describe("matchesRuleFilter", () => {
  it("filters by rule or one-offs", () => {
    assert.equal(matchesRuleFilter(fu(), ""), true);
    assert.equal(matchesRuleFilter(fu(), "r1"), true);
    assert.equal(matchesRuleFilter(fu(), "r2"), false);
    assert.equal(matchesRuleFilter(fu({ source: "manual", ruleId: null }), "one-off"), true);
    assert.equal(matchesRuleFilter(fu(), "one-off"), false);
  });
});

describe("sortForTab", () => {
  it("puts overdue first on Due and newest first elsewhere", () => {
    const a = fu({ id: "a", dueAt: "2026-12-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });
    const b = fu({ id: "b", dueAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z" });
    assert.deepEqual(
      sortForTab([a, b], "due").map((f) => f.id),
      ["b", "a"],
    );
    assert.deepEqual(
      sortForTab([a, b], "booked").map((f) => f.id),
      ["b", "a"],
    );
  });
});

describe("duePill", () => {
  it("words the gap in days, months or years", () => {
    assert.deepEqual(duePill("2026-10-15T10:00:00Z", TZ, NOW), {
      label: "5 days overdue",
      tone: "overdue",
    });
    assert.deepEqual(duePill("2026-10-19T10:00:00Z", TZ, NOW), {
      label: "1 day overdue",
      tone: "overdue",
    });
    assert.equal(duePill("2026-10-20T20:00:00Z", TZ, NOW).label, "Today");
    assert.equal(duePill("2026-10-21T08:00:00Z", TZ, NOW).label, "Tomorrow");
    assert.deepEqual(duePill("2026-11-03T12:00:00Z", TZ, NOW), {
      label: "In 14 days",
      tone: "soon",
    });
    assert.deepEqual(duePill("2027-01-20T12:00:00Z", TZ, NOW), {
      label: "In 3 months",
      tone: "later",
    });
    assert.equal(duePill("2028-10-20T12:00:00Z", TZ, NOW).label, "In 2 years");
  });

  it("labels a bad date instead of throwing", () => {
    assert.deepEqual(duePill("not-a-date", TZ, NOW), { label: "Date unknown", tone: "later" });
    assert.doesNotThrow(() => duePill("2026-10-20T12:00:00Z", "Not/AZone", NOW));
    assert.equal(duePill("2026-10-20T12:00:00Z", "Not/AZone", NOW).label, "Date unknown");
  });
});

describe("reminderStats", () => {
  it("counts overdue, due soon, came back and what they brought in", () => {
    const items = [
      fu({ id: "o", dueAt: "2026-10-10T00:00:00Z", status: "sent" }),
      fu({ id: "w", dueAt: "2026-10-24T00:00:00Z" }),
      fu({ id: "m", dueAt: "2026-11-10T00:00:00Z" }),
      fu({ id: "far", dueAt: "2027-06-01T00:00:00Z" }),
      fu({
        id: "snz",
        dueAt: "2026-10-01T00:00:00Z",
        snoozedUntil: "2026-11-01T00:00:00Z",
      }),
      fu({
        id: "back",
        status: "completed",
        supersededByBookingId: "bk1",
        updatedAt: "2026-09-01T00:00:00Z",
      }),
      fu({
        id: "back2",
        status: "completed",
        supersededByBookingId: "bk1",
        updatedAt: "2026-09-02T00:00:00Z",
      }),
      fu({
        id: "old",
        status: "completed",
        supersededByBookingId: "bk2",
        updatedAt: "2026-01-01T00:00:00Z",
      }),
    ];
    const bookings = new Map([
      ["bk1", { priceMinor: 32000, currency: "GBP", status: "confirmed" as const }],
      ["bk2", { priceMinor: 9000, currency: "GBP", status: "completed" as const }],
    ]);
    assert.deepEqual(reminderStats(items, bookings, NOW), {
      overdue: 1,
      due30: 2,
      dueThisWeek: 1,
      cameBack: 2,
      broughtInMinor: 32000,
      currency: "GBP",
    });
    assert.equal(reminderStats(items, null, NOW).broughtInMinor, null);
  });

  it("does not count a booking that was later cancelled", () => {
    const items = [
      fu({ status: "completed", supersededByBookingId: "bk1", updatedAt: "2026-10-01T00:00:00Z" }),
    ];
    const bookings = new Map([
      ["bk1", { priceMinor: 5000, currency: "GBP", status: "cancelled_by_customer" as const }],
    ]);
    assert.equal(reminderStats(items, bookings, NOW).broughtInMinor, 0);
  });
});

describe("ruleResults", () => {
  it("counts open and recently booked items for one rule", () => {
    const items = [
      fu({ id: "1" }),
      fu({ id: "2", status: "sent" }),
      fu({ id: "3", status: "completed", updatedAt: "2026-10-01T00:00:00Z" }),
      fu({ id: "4", ruleId: "r2" }),
    ];
    assert.deepEqual(ruleResults(items, "r1", NOW), { due: 2, cameBack: 1 });
  });
});

describe("timing", () => {
  it("only offers a notice shorter than the interval", () => {
    assert.equal(leadFits(14, 1), true);
    assert.equal(leadFits(30, 1), false);
    assert.equal(leadFits(30, 2), true);
  });

  it("reads Other as months or years within five years", () => {
    assert.equal(customIntervalMonths("18", "months"), 18);
    assert.equal(customIntervalMonths("3", "years"), 36);
    assert.equal(customIntervalMonths("6", "years"), null);
    assert.equal(customIntervalMonths("0", "months"), null);
    assert.equal(customIntervalMonths("1.5", "months"), null);
  });

  it("works out done, reminded and due dates", () => {
    const t = timeline(new Date("2026-05-03T12:00:00Z"), 12, 14);
    assert.equal(t.due.toISOString(), "2027-05-03T12:00:00.000Z");
    assert.equal(t.remind.toISOString(), "2027-04-19T12:00:00.000Z");
  });
});

describe("pastClientsFor", () => {
  const job = (over: Partial<Booking>): Booking =>
    ({
      leadCustomerId: "c1",
      linkedRecordId: null,
      status: "completed",
      end: "2026-09-01T12:00:00Z",
      lineItems: [{ serviceId: "s1" }],
      ...over,
    }) as unknown as Booking;

  it("counts each client once, by their latest job, and skips stale ones", () => {
    const bookings = [
      job({}),
      job({ end: "2026-03-01T12:00:00Z" }),
      job({ leadCustomerId: "c2", end: "2025-01-01T12:00:00Z" }),
      job({ leadCustomerId: "c3", lineItems: [{ serviceId: "s2" }] as Booking["lineItems"] }),
      job({ leadCustomerId: "c4", status: "cancelled_by_customer" }),
      job({ leadCustomerId: "c5", end: "2026-12-01T12:00:00Z" }),
    ];
    assert.equal(pastClientsFor(bookings, "s1", 2, NOW), 1);
    assert.equal(pastClientsFor(bookings, "s1", 24, NOW), 2);
  });
});

describe("lastInLabel", () => {
  it("drops the year when it is this year", () => {
    assert.equal(lastInLabel("2026-04-21T12:00:00Z", TZ, NOW), "Last in 21 Apr");
    assert.equal(lastInLabel("2025-04-21T12:00:00Z", TZ, NOW), "Last in 21 Apr 2025");
  });

  it("survives a missing date or a time zone the runtime rejects", () => {
    assert.equal(lastInLabel("not-a-date", TZ, NOW), "Last in —");
    assert.equal(formatReminderWhen(null, TZ), "—");
    assert.equal(formatReminderWhen(undefined, TZ), "—");
    assert.doesNotThrow(() => lastInLabel("2026-04-21T12:00:00Z", "Not/AZone", NOW));
    assert.match(lastInLabel("2026-04-21T12:00:00Z", "Not/AZone", NOW), /^Last in /);
  });
});
