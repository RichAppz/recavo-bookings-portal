import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BookingSettlementLine, Payment } from "./api/types.ts";
import {
  availableTabs,
  bookingFilterCounts,
  bookingPaidView,
  bookingStatusView,
  buildTimeline,
  comingUpPill,
  creditsSummary,
  dayLabel,
  defaultBookingFilter,
  groupByMonth,
  ledgerEntryView,
  moneyRows,
  notificationText,
  profilePill,
  profileSummary,
  resolveProfileTab,
  sessionsSubline,
  sortBookingsFor,
  splitE164,
} from "./client-profile.ts";

const TZ = "Europe/London";
const NOW = new Date("2026-10-20T12:00:00Z");
const NOW_MS = NOW.getTime();
const daysBefore = (n: number) => new Date(NOW_MS - n * 86_400_000).toISOString();
const daysAfter = (n: number) => new Date(NOW_MS + n * 86_400_000).toISOString();
const money = (minor: number) => `£${minor / 100}`;

type MB = Parameters<typeof moneyRows>[0]["bookings"][number];
const booking = (over: Partial<MB>): MB => ({
  id: Math.random().toString(36).slice(2),
  start: daysBefore(3),
  status: "completed",
  attendanceStatus: "attended",
  paymentMethod: "none",
  priceMinor: 4500,
  paidMinor: 0,
  leadCustomerId: "c1",
  serviceSnapshot: { name: "Valet" } as MB["serviceSnapshot"],
  lineItems: [],
  currency: "GBP",
  seatCount: 1,
  ...over,
});

const payment = (over: Partial<Payment>): Payment =>
  ({
    id: Math.random().toString(36).slice(2),
    bookingId: null,
    packageId: null,
    packagePurchaseId: null,
    amountMinor: 1000,
    amountRefundedMinor: 0,
    currency: "GBP",
    state: "succeeded",
    receiptUrl: null,
    providerPaymentId: "pi_1",
    createdAt: daysBefore(1),
    ...over,
  }) as Payment;

const ALL = { money: true, linked: true, anonymised: false };

describe("resolveProfileTab", () => {
  it("defaults to Overview", () => {
    assert.deepEqual(resolveProfileTab(undefined, ALL), { tab: "overview" });
  });

  it("redirects every old tab name", () => {
    const cases: Record<string, unknown> = {
      profile: { tab: "details" },
      upcoming: { tab: "overview" },
      packages: { tab: "money" },
      payments: { tab: "money" },
      invoices: { tab: "money" },
      notes: { tab: "notes" },
      files: { tab: "notes" },
      consents: { tab: "details", section: "privacy" },
      tags: { tab: "details", section: "tags" },
      portal: { tab: "details", section: "portal" },
      privacy: { tab: "details", section: "privacy" },
      messages: { tab: "messages" },
      notifications: { tab: "messages" },
      linked: { tab: "linked" },
    };
    for (const [raw, expected] of Object.entries(cases)) {
      assert.deepEqual(resolveProfileTab(raw, ALL), expected, raw);
    }
  });

  it("falls back when the tab isn't available", () => {
    assert.deepEqual(resolveProfileTab("payments", { ...ALL, money: false }), { tab: "overview" });
    assert.deepEqual(resolveProfileTab("linked", { ...ALL, linked: false }), { tab: "overview" });
    assert.deepEqual(resolveProfileTab("nonsense", ALL), { tab: "overview" });
  });

  it("gives anonymised clients Bookings and Money only", () => {
    const a = { ...ALL, anonymised: true };
    assert.deepEqual(availableTabs(a), ["bookings", "money"]);
    assert.deepEqual(resolveProfileTab("profile", a), { tab: "bookings" });
    assert.deepEqual(availableTabs({ ...a, money: false }), ["bookings"]);
  });
});

describe("booking filters", () => {
  const list = [
    booking({ start: daysAfter(2), status: "confirmed", attendanceStatus: "unknown" }),
    booking({ start: daysBefore(2) }),
    booking({ start: daysBefore(5), status: "no_show", attendanceStatus: "no_show" }),
    booking({ start: daysBefore(9), status: "cancelled_by_customer" }),
    booking({ start: daysBefore(12), status: "late_cancelled" }),
  ];

  it("counts each filter", () => {
    assert.deepEqual(bookingFilterCounts(list, NOW_MS), {
      upcoming: 1,
      past: 2,
      cancelled: 2,
      no_show: 1,
      all: 5,
    });
  });

  it("opens on Upcoming when there is one, else Past", () => {
    assert.equal(defaultBookingFilter(bookingFilterCounts(list, NOW_MS)), "upcoming");
    assert.equal(defaultBookingFilter(bookingFilterCounts(list.slice(1), NOW_MS)), "past");
  });

  it("sorts upcoming soonest first and the rest newest first", () => {
    const a = booking({ start: daysAfter(1) });
    const b = booking({ start: daysAfter(5) });
    assert.deepEqual(sortBookingsFor([b, a], "upcoming"), [a, b]);
    assert.deepEqual(sortBookingsFor([a, b], "past"), [b, a]);
  });
});

describe("bookingStatusView", () => {
  it("names each state", () => {
    assert.equal(bookingStatusView(booking({}), NOW_MS).label, "Attended");
    assert.equal(
      bookingStatusView(booking({ status: "no_show", attendanceStatus: "no_show" }), NOW_MS).label,
      "No-show",
    );
    assert.deepEqual(bookingStatusView(booking({ status: "cancelled_by_business" }), NOW_MS), {
      label: "Cancelled",
      tone: "grey",
      faded: true,
    });
    assert.equal(
      bookingStatusView(booking({ status: "late_cancelled" }), NOW_MS).label,
      "Late cancelled",
    );
    assert.equal(
      bookingStatusView(
        booking({ start: daysAfter(1), status: "confirmed", attendanceStatus: "unknown" }),
        NOW_MS,
      ).label,
      "Upcoming",
    );
  });
});

describe("bookingPaidView", () => {
  const line = (over: Partial<BookingSettlementLine>): BookingSettlementLine => ({
    id: "s1",
    paymentId: null,
    method: "cash",
    kind: "payment",
    amountMinor: 4500,
    currency: "GBP",
    occurredAt: daysBefore(3),
    ...over,
  });

  it("names the method when paid in full", () => {
    assert.deepEqual(bookingPaidView(booking({ paidMinor: 4500 }), [line({})], NOW_MS, money), {
      label: "Paid · cash",
      tone: "green",
    });
    assert.equal(
      bookingPaidView(
        booking({ paidMinor: 4500 }),
        [line({ method: "card_online" })],
        NOW_MS,
        money,
      ).label,
      "Paid · card",
    );
    assert.equal(
      bookingPaidView(booking({ paidMinor: 4500 }), undefined, NOW_MS, money).label,
      "Paid",
    );
  });

  it("shows part payments, money due and refunds", () => {
    assert.deepEqual(bookingPaidView(booking({ paidMinor: 1500 }), [], NOW_MS, money), {
      label: "£15 of £45",
      tone: "amber",
    });
    assert.deepEqual(bookingPaidView(booking({}), [], NOW_MS, money), {
      label: "£45 due",
      tone: "red",
    });
    assert.equal(
      bookingPaidView(
        booking({ paidMinor: 4500 }),
        [line({}), line({ id: "s2", kind: "refund" })],
        NOW_MS,
        money,
      ).label,
      "Refunded",
    );
  });

  it("handles credit bookings", () => {
    const credit = booking({ paymentMethod: "credit" });
    assert.equal(bookingPaidView(credit, [], NOW_MS, money).label, "Credit used");
    assert.equal(
      bookingPaidView(
        { ...credit, status: "no_show", attendanceStatus: "no_show" },
        [],
        NOW_MS,
        money,
      ).label,
      "Credit kept",
    );
    assert.equal(
      bookingPaidView({ ...credit, status: "cancelled_by_customer" }, [], NOW_MS, money).label,
      "Credit returned",
    );
  });

  it("gives Coming up rows one pill", () => {
    assert.equal(comingUpPill(booking({ paymentMethod: "credit" }), money)?.label, "Credit");
    assert.equal(comingUpPill(booking({ paidMinor: 2000 }), money)?.label, "£25 due");
    assert.equal(comingUpPill(booking({ status: "held" }), money)?.label, "Held");
    assert.equal(comingUpPill(booking({ priceMinor: 0 }), money), null);
  });
});

describe("profileSummary", () => {
  it("counts attended sessions, no-shows, cancellations and money owed", () => {
    const s = profileSummary(
      "c1",
      [
        booking({ start: daysBefore(2), paidMinor: 4500 }),
        booking({ id: "owed-old", start: daysBefore(20) }),
        booking({ id: "owed-new", start: daysBefore(4), paidMinor: 500 }),
        booking({
          start: daysBefore(6),
          status: "no_show",
          attendanceStatus: "no_show",
          priceMinor: 0,
        }),
        booking({ start: daysBefore(8), status: "cancelled_by_customer" }),
        booking({
          id: "next",
          start: daysAfter(3),
          status: "confirmed",
          attendanceStatus: "unknown",
        }),
        booking({ start: daysBefore(1), leadCustomerId: "someone-else" }),
      ],
      [],
      NOW_MS,
    );
    assert.equal(s.attended, 4);
    assert.equal(s.noShows, 1);
    assert.equal(s.cancelled, 1);
    assert.equal(s.nextBooking?.id, "next");
    assert.equal(s.owedMinor, 4500 + 4000);
    assert.deepEqual(s.owedBookingIds, ["owed-old", "owed-new"]);
    assert.equal(sessionsSubline(s), "attended · 1 no-show · 1 cancelled");
    assert.equal(sessionsSubline({ noShows: 0, cancelled: 0 }), "attended");
  });
});

describe("creditsSummary", () => {
  const view = (available: number, issued: number, expiresAt: string) => ({
    entitlement: { expiresAt, status: "active", unitsIssued: issued } as never,
    balance: { available } as never,
  });

  it("adds up in-date credits and flags the soonest expiry", () => {
    const s = creditsSummary(
      [view(6, 10, daysAfter(20)), view(2, 5, daysAfter(200)), view(3, 3, daysBefore(1))],
      NOW_MS,
    );
    assert.equal(s.left, 8);
    assert.equal(s.issued, 15);
    assert.equal(s.activePackages, 2);
    assert.equal(s.soonestExpiry, daysAfter(20));
    assert.equal(s.expiringSoon, true);
  });
});

describe("profilePill", () => {
  const c = (status: "active" | "archived" | "anonymised", created = daysBefore(100)) => ({
    status,
    createdAt: created,
  });
  const none = { owedMinor: 0, creditsLeft: 0, sessions: 3 };

  it("picks one pill in priority order", () => {
    assert.equal(profilePill(c("anonymised"), { ...none, owedMinor: 10 }, NOW_MS), "anonymised");
    assert.equal(profilePill(c("archived"), { ...none, owedMinor: 10 }, NOW_MS), "archived");
    assert.equal(
      profilePill(c("active"), { ...none, owedMinor: 10, creditsLeft: 2 }, NOW_MS),
      "owes",
    );
    assert.equal(profilePill(c("active"), { ...none, creditsLeft: 2 }, NOW_MS), "package");
    assert.equal(profilePill(c("active", daysBefore(3)), { ...none, sessions: 0 }, NOW_MS), "new");
    assert.equal(profilePill(c("active"), none, NOW_MS), null);
  });
});

describe("splitE164", () => {
  it("splits a stored number into dialling code and national number", () => {
    assert.deepEqual(splitE164("+447700900123", ["44", "353", "1"], "44"), {
      code: "44",
      national: "07700900123",
    });
    assert.deepEqual(splitE164("+15551234567", ["44", "1"], "44"), {
      code: "1",
      national: "5551234567",
    });
    assert.deepEqual(splitE164("07700 900123", ["44"], "44"), {
      code: "44",
      national: "07700 900123",
    });
  });
});

describe("moneyRows", () => {
  it("combines settlements, unsettled card payments, package purchases and credits", () => {
    const paid = booking({ id: "b1", paidMinor: 4500 });
    const credit = booking({ id: "b2", paymentMethod: "credit", start: daysBefore(5) });
    const cardPayment = payment({ id: "p1", bookingId: "b1", amountMinor: 2000 });
    const rows = moneyRows({
      bookings: [paid, credit],
      settlementsByBooking: new Map([
        [
          "b1",
          [
            {
              id: "s1",
              paymentId: "p1",
              method: "card_online",
              kind: "payment",
              amountMinor: 2000,
              currency: "GBP",
              occurredAt: daysBefore(3),
            },
            {
              id: "s2",
              paymentId: null,
              method: "cash",
              kind: "payment",
              amountMinor: 2500,
              currency: "GBP",
              occurredAt: daysBefore(2),
            },
          ],
        ],
      ]),
      payments: [
        cardPayment,
        payment({ id: "p2", packageId: "pk1", amountMinor: 42000, createdAt: daysBefore(30) }),
        payment({ id: "p3", bookingId: "b1", state: "failed", createdAt: daysBefore(4) }),
      ],
      packageName: () => "10 sessions",
      bookingLabel: (b) => b.serviceSnapshot.name,
      nowMs: NOW_MS,
    });
    assert.deepEqual(
      rows.map((r) => [r.method, r.amountMinor, r.status.label, r.forLabel]),
      [
        ["Cash", 2500, "Paid", "Valet"],
        ["Card", 2000, "Paid", "Valet"],
        ["Card", 1000, "Failed", "Valet"],
        ["Package credit", null, "Used", "Valet"],
        ["Card", 42000, "Paid", "10 sessions"],
      ],
    );
  });
});

describe("ledgerEntryView", () => {
  it("signs entries and names manual reasons", () => {
    assert.deepEqual(ledgerEntryView({ type: "consumed", units: 1, reasonCode: "booking" }), {
      label: "Used",
      signed: -1,
    });
    assert.deepEqual(
      ledgerEntryView({ type: "adjusted_positive", units: 2, reasonCode: "manual_add_goodwill" }),
      { label: "Added · Goodwill", signed: 2 },
    );
    assert.equal(ledgerEntryView({ type: "issued", units: 10, reasonCode: "purchase" }).signed, 10);
  });
});

describe("timeline", () => {
  it("merges messages and notifications in time order", () => {
    const items = buildTimeline(
      [
        { id: "m1", createdAt: daysBefore(1) } as never,
        { id: "m2", createdAt: daysBefore(3) } as never,
      ],
      [{ id: "n1", createdAt: daysBefore(2) } as never],
    );
    assert.deepEqual(
      items.map((i) => (i.kind === "message" ? i.message.id : i.notification.id)),
      ["m2", "n1", "m1"],
    );
  });

  it("describes automatic messages, including a text that fell back to email", () => {
    assert.equal(
      notificationText({
        subject: "Your booking is coming up",
        templateKey: "booking.reminder",
        channel: "sms",
        requestedChannel: "sms",
        fallbackReason: null,
        readAt: null,
      }),
      "Your booking is coming up · sent by text",
    );
    assert.equal(
      notificationText({
        subject: "",
        templateKey: "booking.confirmed",
        channel: "email",
        requestedChannel: "sms",
        fallbackReason: "no_credits",
        readAt: daysBefore(1),
      }),
      "Booking confirmed · text failed: no credits, sent by email instead · opened",
    );
  });

  it("labels days", () => {
    assert.equal(dayLabel(NOW.toISOString(), NOW, TZ), "Today");
    assert.equal(dayLabel(daysBefore(1), NOW, TZ), "Yesterday");
    assert.match(dayLabel(daysBefore(2), NOW, TZ), /^Sun 18 Oct$/);
  });

  it("groups by month", () => {
    const groups = groupByMonth(
      ["2026-10-19T10:00:00Z", "2026-10-02T10:00:00Z", "2026-09-30T10:00:00Z"],
      (s) => s,
      TZ,
    );
    assert.deepEqual(
      groups.map((g) => [g.label, g.items.length]),
      [
        ["October 2026", 2],
        ["September 2026", 1],
      ],
    );
  });
});
