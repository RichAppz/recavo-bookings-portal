import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Booking, Dashboard } from "./api/types.ts";
import {
  attendanceSplit,
  attendanceToMark,
  attendedRate,
  attentionItems,
  attentionSummary,
  attentionTotal,
  busiestWeekday,
  countdownLabel,
  DEFAULT_PREFS,
  firstName,
  greetingFor,
  groupOrder,
  hasHistory,
  hourIn,
  legacyHiddenCards,
  LEFT_COLUMN,
  maskedMoney,
  moneySplit,
  moveItem,
  moveTo,
  nounFor,
  nowLineIndex,
  parseOverviewPrefs,
  paymentPhrase,
  paymentsToCollect,
  percentDelta,
  percentLabel,
  periodWindow,
  phoneOrder,
  phoneTodayWindow,
  PHONE_CARD_ORDER,
  pickUpNext,
  placesRate,
  pointsDelta,
  shortDayLabel,
  todayPill,
  todayPillLabel,
  trendBuckets,
  weekStart,
} from "./overview.ts";

const TZ = "Europe/London";
// Monday 19 Oct 2026, 10:18 in London (BST, UTC+1).
const NOW = new Date("2026-10-19T09:18:00.000Z");

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: "b1",
    status: "confirmed",
    attendanceStatus: "unknown",
    start: "2026-10-19T10:00:00.000Z",
    end: "2026-10-19T11:00:00.000Z",
    priceMinor: 2500,
    paidMinor: 2500,
    depositMinor: null,
    paymentMethod: "none",
    allDay: false,
    ...over,
  } as Booking;
}

describe("greeting", () => {
  it("follows the time of day", () => {
    assert.equal(greetingFor(5), "Good morning");
    assert.equal(greetingFor(11), "Good morning");
    assert.equal(greetingFor(12), "Good afternoon");
    assert.equal(greetingFor(17), "Good afternoon");
    assert.equal(greetingFor(18), "Good evening");
    assert.equal(greetingFor(4), "Good evening");
    assert.equal(greetingFor(0), "Good evening");
  });

  it("reads the hour in the business's zone", () => {
    assert.equal(hourIn(TZ, NOW), 10);
    assert.equal(hourIn("UTC", NOW), 9);
  });

  it("uses the first name only", () => {
    assert.equal(firstName("Rich Mucha"), "Rich");
    assert.equal(firstName("  Maya  "), "Maya");
    assert.equal(firstName(""), null);
    assert.equal(firstName(null), null);
  });

  it("speaks the trade's noun", () => {
    assert.equal(nounFor("Job", 1), "job");
    assert.equal(nounFor("Job", 3), "jobs");
    assert.equal(nounFor("Session", 0), "sessions");
    assert.equal(nounFor("", 2), "bookings");
  });
});

describe("countdownLabel", () => {
  const at = (startUtc: string, endUtc: string, allDay = false) => ({
    start: startUtc,
    end: endUtc,
    allDay,
  });

  it("counts minutes, then hours and minutes", () => {
    assert.equal(
      countdownLabel(at("2026-10-19T09:23:00Z", "2026-10-19T10:00:00Z"), NOW, TZ),
      "In 5 min",
    );
    assert.equal(
      countdownLabel(at("2026-10-19T10:00:00Z", "2026-10-19T11:00:00Z"), NOW, TZ),
      "In 42 min",
    );
    assert.equal(
      countdownLabel(at("2026-10-19T10:38:00Z", "2026-10-19T11:00:00Z"), NOW, TZ),
      "In 1 hr 20 min",
    );
    assert.equal(
      countdownLabel(at("2026-10-19T11:18:00Z", "2026-10-19T12:00:00Z"), NOW, TZ),
      "In 2 hr",
    );
  });

  it("says when a session in progress ends", () => {
    assert.equal(
      countdownLabel(at("2026-10-19T09:00:00Z", "2026-10-19T11:00:00Z"), NOW, TZ),
      "On now · ends 12:00",
    );
    assert.equal(
      countdownLabel(at("2026-10-18T23:00:00Z", "2026-10-19T23:00:00Z", true), NOW, TZ),
      "On now · all day",
    );
  });

  it("names tomorrow and later days", () => {
    assert.equal(
      countdownLabel(at("2026-10-20T07:00:00Z", "2026-10-20T08:00:00Z"), NOW, TZ),
      "Tomorrow 08:00",
    );
    assert.equal(
      countdownLabel(at("2026-10-21T07:00:00Z", "2026-10-21T08:00:00Z"), NOW, TZ),
      "Wed 08:00",
    );
  });
});

describe("pickUpNext", () => {
  it("prefers the session in progress, then the next to start", () => {
    const later = booking({
      id: "later",
      start: "2026-10-19T11:00:00Z",
      end: "2026-10-19T12:00:00Z",
    });
    const onNow = booking({
      id: "now",
      start: "2026-10-19T09:00:00Z",
      end: "2026-10-19T10:00:00Z",
    });
    assert.equal(pickUpNext([later, onNow], NOW)?.id, "now");
    assert.equal(pickUpNext([later], NOW)?.id, "later");
  });

  it("skips finished, cancelled and marked sessions", () => {
    const done = booking({
      id: "done",
      start: "2026-10-19T07:00:00Z",
      end: "2026-10-19T08:00:00Z",
    });
    const cancelled = booking({ id: "c", status: "cancelled_by_customer" });
    const marked = booking({
      id: "m",
      start: "2026-10-19T09:00:00Z",
      end: "2026-10-19T10:00:00Z",
      attendanceStatus: "attended",
    });
    assert.equal(pickUpNext([done, cancelled, marked], NOW), null);
  });
});

describe("one pill per Today row", () => {
  it("asks for attendance once an unmarked session has ended, ahead of money", () => {
    const ended = booking({
      start: "2026-10-19T07:00:00Z",
      end: "2026-10-19T08:00:00Z",
      paidMinor: 0,
    });
    assert.equal(todayPill(ended, NOW), "mark_attendance");
  });

  it("shows Unpaid for a session today with money due", () => {
    assert.equal(todayPill(booking({ paidMinor: 0 }), NOW), "unpaid");
    assert.equal(todayPill(booking({ paidMinor: 1000 }), NOW), "unpaid");
    assert.equal(todayPill(booking({ status: "awaiting_payment", paidMinor: 0 }), NOW), "unpaid");
  });

  it("then No-show, Attended, Upcoming", () => {
    assert.equal(
      todayPill(booking({ status: "no_show", attendanceStatus: "no_show" }), NOW),
      "no_show",
    );
    assert.equal(
      todayPill(booking({ status: "completed", attendanceStatus: "attended" }), NOW),
      "attended",
    );
    assert.equal(todayPill(booking(), NOW), "upcoming");
    assert.equal(todayPill(booking({ status: "cancelled_by_business" }), NOW), "cancelled");
  });

  it("is never Unpaid on a credit or free booking", () => {
    assert.equal(todayPill(booking({ paidMinor: 0, paymentMethod: "credit" }), NOW), "upcoming");
    assert.equal(todayPill(booking({ priceMinor: 0, paidMinor: 0 }), NOW), "upcoming");
  });

  it("uses detailer wording for the mark pill", () => {
    assert.equal(todayPillLabel("mark_attendance", { detailer: false }), "Mark attendance");
    assert.equal(todayPillLabel("mark_attendance", { detailer: true }), "Mark done");
  });
});

describe("now line", () => {
  const starts = ["2026-10-19T07:00:00Z", "2026-10-19T09:00:00Z", "2026-10-19T11:00:00Z"];
  it("sits after the last row that has started", () => {
    assert.equal(nowLineIndex(starts, NOW), 2);
    assert.equal(nowLineIndex(starts, new Date("2026-10-19T06:00:00Z")), 0);
    assert.equal(nowLineIndex(starts, new Date("2026-10-19T20:00:00Z")), 3);
  });

  it("phone shows the last finished row and the next three", () => {
    const rows = [
      { start: "2026-10-19T06:00:00Z", end: "2026-10-19T07:00:00Z" },
      { start: "2026-10-19T07:00:00Z", end: "2026-10-19T08:00:00Z" },
      { start: "2026-10-19T10:00:00Z", end: "2026-10-19T11:00:00Z" },
      { start: "2026-10-19T11:00:00Z", end: "2026-10-19T12:00:00Z" },
      { start: "2026-10-19T12:00:00Z", end: "2026-10-19T13:00:00Z" },
      { start: "2026-10-19T13:00:00Z", end: "2026-10-19T14:00:00Z" },
    ];
    assert.deepEqual(phoneTodayWindow(rows, NOW), { from: 1, to: 5 });
    assert.deepEqual(phoneTodayWindow(rows, new Date("2026-10-19T05:00:00Z")), { from: 0, to: 3 });
  });
});

describe("attention", () => {
  it("collects money due in the next 7 days or overdue, oldest first", () => {
    const overdue = booking({
      id: "o",
      start: "2026-10-12T10:00:00Z",
      end: "2026-10-12T11:00:00Z",
      paidMinor: 0,
    });
    const soon = booking({
      id: "s",
      start: "2026-10-22T10:00:00Z",
      end: "2026-10-22T11:00:00Z",
      paidMinor: 0,
    });
    const far = booking({
      id: "f",
      start: "2026-10-30T10:00:00Z",
      end: "2026-10-30T11:00:00Z",
      paidMinor: 0,
    });
    const paid = booking({ id: "p" });
    assert.deepEqual(
      paymentsToCollect([soon, far, paid, overdue], NOW).map((b) => b.id),
      ["o", "s"],
    );
  });

  it("finds finished sessions nobody marked", () => {
    const ended = booking({ id: "e", start: "2026-10-18T10:00:00Z", end: "2026-10-18T11:00:00Z" });
    assert.deepEqual(
      attendanceToMark([booking(), ended], NOW).map((b) => b.id),
      ["e"],
    );
  });

  it("lists only items with something to do, by urgency", () => {
    const items = attentionItems({
      detailer: false,
      bookingNoun: "Session",
      setup: { left: 2, next: "Add your opening hours" },
      sms: { balance: 10, low: true },
      packageRequests: { count: 2, who: ["Rich Mucha · Playwright Offer", "Sam · Ten pack", "x"] },
      attendance: { count: 1, single: "Nutrition consultation, 09:30" },
      payments: { count: 2, who: ["Ben Okafor today", "Priya Kaur Thu"], totalLabel: "£63" },
      waitlist: { count: 0 },
      addOns: { count: 0 },
    });
    assert.deepEqual(
      items.map((i) => i.kind),
      ["payments", "attendance", "package_requests", "sms_low", "setup"],
    );
    assert.equal(items[0]!.title, "2 payments to collect");
    assert.equal(items[0]!.detail, "Ben Okafor today · Priya Kaur Thu · £63");
    assert.equal(items[1]!.detail, "Nutrition consultation, 09:30");
    assert.equal(items[2]!.detail, "Rich Mucha · Playwright Offer · Sam · Ten pack");
    assert.equal(items[3]!.title, "10 texts left");
    assert.equal(items[4]!.title, "Finish setting up · 2 left");
    assert.equal(attentionTotal(items), 2 + 1 + 2 + 1 + 2);
    assert.equal(attentionSummary(items), "2 payments · attendance · 2 packages · texts · set-up");
  });

  it("counts several sessions to mark in the trade's words", () => {
    const [trainer] = attentionItems({
      detailer: false,
      bookingNoun: "Session",
      attendance: { count: 3, single: null },
    });
    assert.equal(trainer!.detail, "3 sessions");
    const [detailer] = attentionItems({
      detailer: true,
      bookingNoun: "Job",
      attendance: { count: 3, single: null },
    });
    assert.equal(detailer!.title, "Mark jobs done");
    assert.equal(detailer!.detail, "3 jobs");
  });

  it("is empty when everything is caught up", () => {
    assert.deepEqual(attentionItems({ detailer: false, bookingNoun: "Session" }), []);
  });

  it("labels days briefly", () => {
    assert.equal(shortDayLabel("2026-10-19", "2026-10-19"), "today");
    assert.equal(shortDayLabel("2026-10-20", "2026-10-19"), "tomorrow");
    assert.equal(shortDayLabel("2026-10-22", "2026-10-19"), "Thu");
    assert.equal(shortDayLabel("2026-10-12", "2026-10-19"), "12 Oct");
  });

  it("describes the payment on Up next", () => {
    const money = (m: number) => `£${m / 100}`;
    assert.equal(paymentPhrase(booking(), money), "Paid");
    assert.equal(paymentPhrase(booking({ paidMinor: 0 }), money), "£25 due");
    assert.equal(
      paymentPhrase(booking({ paidMinor: 1000, depositMinor: 1000 }), money),
      "Deposit paid",
    );
    assert.equal(paymentPhrase(booking({ priceMinor: 0, paidMinor: 0 }), money), null);
  });
});

describe("periods", () => {
  it("month to date against the same days of last month", () => {
    const w = periodWindow("month", TZ, NOW);
    assert.equal(w.fromDate, "2026-10-01");
    assert.equal(w.toDate, "2026-10-19");
    assert.equal(w.endDate, "2026-10-31");
    assert.equal(w.title, "How October is going");
    assert.equal(w.compareShort, "vs Sept");
    // 1 Oct 00:00 BST → 30 Sept 23:00 UTC; to = 20 Oct 00:00 BST.
    assert.equal(w.range!.from, "2026-09-30T23:00:00.000Z");
    assert.equal(w.range!.to, "2026-10-19T23:00:00.000Z");
    assert.equal(w.previous!.from, "2026-08-31T23:00:00.000Z");
    assert.equal(w.previous!.to, "2026-09-19T23:00:00.000Z");
  });

  it("clamps the previous month's days (31 March vs 28 Feb)", () => {
    const w = periodWindow("month", "UTC", new Date("2026-03-31T12:00:00Z"));
    assert.equal(w.previous!.to, "2026-03-01T00:00:00.000Z");
  });

  it("week runs from Monday", () => {
    assert.equal(weekStart("2026-10-19"), "2026-10-19");
    assert.equal(weekStart("2026-10-25"), "2026-10-19");
    const w = periodWindow("week", TZ, new Date("2026-10-22T12:00:00Z"));
    assert.equal(w.fromDate, "2026-10-19");
    assert.equal(w.title, "How this week is going");
    assert.equal(w.previous!.from, "2026-10-11T23:00:00.000Z");
    assert.equal(w.previous!.to, "2026-10-15T23:00:00.000Z");
  });

  it("year to date against last year", () => {
    const w = periodWindow("year", "UTC", NOW);
    assert.equal(w.title, "How 2026 is going");
    assert.equal(w.compareShort, "vs 2025");
    assert.equal(w.previous!.from, "2025-01-01T00:00:00.000Z");
    assert.equal(w.previous!.to, "2025-10-20T00:00:00.000Z");
  });

  it("rolling ranges and all time", () => {
    const seven = periodWindow("7d", "UTC", NOW);
    assert.equal(seven.fromDate, "2026-10-13");
    assert.equal(seven.previous!.from, "2026-10-06T00:00:00.000Z");
    const all = periodWindow("all", "UTC", NOW);
    assert.equal(all.range, null);
    assert.equal(all.previous, null);
    assert.equal(all.compareShort, null);
  });

  it("twelve trend buckets ending today", () => {
    const week = trendBuckets("week", "UTC", NOW);
    assert.equal(week.length, 12);
    assert.deepEqual(week[11], { fromDate: "2026-10-19", toDate: "2026-10-19" });
    assert.deepEqual(week[0], { fromDate: "2026-10-08", toDate: "2026-10-08" });

    const month = trendBuckets("month", "UTC", NOW);
    assert.equal(month.length, 12);
    assert.equal(month[0]!.fromDate, "2026-09-20");
    assert.equal(month[11]!.toDate, "2026-10-19");
    for (let i = 1; i < 12; i++) {
      assert.equal(month[i]!.fromDate > month[i - 1]!.toDate, true);
    }

    const year = trendBuckets("year", "UTC", NOW);
    assert.deepEqual(year[11], { fromDate: "2026-10-01", toDate: "2026-10-19" });
    assert.deepEqual(year[0], { fromDate: "2025-11-01", toDate: "2025-11-30" });
  });
});

describe("deltas", () => {
  it("shows the relative change, rounded", () => {
    assert.deepEqual(percentDelta(112, 100, "on September"), {
      tone: "up",
      label: "↑ 12%",
      srLabel: "Up 12 percent on September",
    });
    assert.equal(percentDelta(98, 100, "on September")!.label, "↓ 2%");
  });

  it("reads No change under 1%", () => {
    assert.equal(percentDelta(1005, 1000, "on September")!.label, "No change");
    assert.equal(pointsDelta(0.921, 0.918, "on September")!.tone, "flat");
  });

  it("is hidden with nothing to compare", () => {
    assert.equal(percentDelta(500, 0, "on September"), null);
    assert.equal(pointsDelta(0.9, null, "on September"), null);
  });

  it("uses percentage points for rates", () => {
    assert.deepEqual(pointsDelta(0.92, 0.88, "on September"), {
      tone: "up",
      label: "↑ 4 pts",
      srLabel: "Up 4 percentage points on September",
    });
  });

  it("knows when there is history", () => {
    const empty = { bookings: { count: 0, valueMinor: 0 }, revenue: { grossMinor: 0 } };
    assert.equal(hasHistory(empty as Dashboard), false);
    assert.equal(
      hasHistory({ ...empty, bookings: { count: 1, valueMinor: 0 } } as Dashboard),
      true,
    );
    assert.equal(hasHistory(undefined), false);
  });
});

describe("headline figures", () => {
  it("attended over marked sessions and places filled", () => {
    assert.equal(attendedRate({ attended: 11, noShow: 1 }), 11 / 12);
    assert.equal(attendedRate({ attended: 0, noShow: 0 }), null);
    assert.equal(placesRate({ seats: 105, capacity: 136 }), 105 / 136);
    assert.equal(placesRate({ seats: 0, capacity: 0 }), null);
    assert.equal(percentLabel(105 / 136), "77%");
    assert.equal(percentLabel(null), "—");
  });
});

describe("splits", () => {
  const method = (m: string, grossMinor: number, count = 1, refundedMinor = 0) => ({
    method: m,
    grossMinor,
    refundedMinor,
    disputedMinor: 0,
    netMinor: grossMinor - refundedMinor,
    count,
  });
  const revenue = (byMethod: ReturnType<typeof method>[]) =>
    ({
      grossMinor: byMethod.reduce((s, m) => s + m.grossMinor, 0),
      refundedMinor: 0,
      disputedMinor: 0,
      netMinor: byMethod.reduce((s, m) => s + m.netMinor, 0),
      byMethod,
    }) as Dashboard["revenue"];

  it("merges card methods, colours by method and drops £0 rows", () => {
    const rows = moneySplit(
      revenue([
        method("card_online", 5000, 2),
        method("card_manual", 3000, 3),
        method("cash", 2000, 4),
        method("bank_transfer", 0, 0),
      ]),
    );
    assert.deepEqual(
      rows.map((r) => [r.label, r.colour, r.count, Math.round(r.share * 100)]),
      [
        ["Card", "mint", 5, 80],
        ["Cash", "blue", 4, 20],
      ],
    );
  });

  it("calls a lone card method Card and gives other methods the spare colours", () => {
    const rows = moneySplit(revenue([method("card_online", 1000), method("other", 500)]));
    assert.deepEqual(
      rows.map((r) => [r.label, r.colour]),
      [
        ["Card", "mint"],
        ["Other", "purple"],
      ],
    );
  });

  it("splits attendance into outcomes and still to come", () => {
    const split = attendanceSplit({ booked: 54, attended: 40, noShow: 2, cancelled: 4 });
    assert.equal(split.total, 54);
    assert.deepEqual(
      split.rows.map((r) => [r.key, r.count]),
      [
        ["attended", 40],
        ["to_come", 8],
        ["no_show", 2],
        ["cancelled", 4],
      ],
    );
    assert.deepEqual(attendanceSplit({ booked: 0, attended: 0, noShow: 0, cancelled: 0 }).rows, []);
  });

  it("finds the busiest weekday", () => {
    assert.equal(busiestWeekday(["2026-10-20", "2026-10-27", "2026-10-19"]), "Tuesday");
    assert.equal(busiestWeekday([]), null);
  });
});

describe("saved settings", () => {
  it("defaults to Month with everything shown", () => {
    assert.deepEqual(parseOverviewPrefs(null), DEFAULT_PREFS);
    assert.equal(DEFAULT_PREFS.period, "month");
  });

  it("keeps what is valid and completes the order", () => {
    const prefs = parseOverviewPrefs({
      period: "year",
      hideAmounts: true,
      order: ["money", "bogus", "money", "today"],
      hidden: ["quick", "nope"],
      quickOrder: ["copy_link"],
      quickHidden: ["group"],
      reordered: true,
    });
    assert.equal(prefs.period, "year");
    assert.equal(prefs.hideAmounts, true);
    assert.deepEqual(prefs.order.slice(0, 2), ["money", "today"]);
    assert.equal(prefs.order.length, 7);
    assert.deepEqual(prefs.hidden, ["quick"]);
    assert.equal(prefs.quickOrder[0], "copy_link");
    assert.equal(prefs.quickOrder.length, 9);
    assert.deepEqual(prefs.quickHidden, ["group"]);
    assert.equal(parseOverviewPrefs({ period: "fortnight" }).period, "month");
  });

  it("carries the old eye menu's hidden cards over", () => {
    assert.deepEqual(legacyHiddenCards(["stats", "tasks", "x"]), ["headline", "attention"]);
    assert.deepEqual(legacyHiddenCards("nope"), []);
  });

  it("reorders by one step or by drop", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
    assert.deepEqual(moveItem(["a", "b", "c"], "a", "up"), ["a", "b", "c"]);
    assert.deepEqual(moveItem(["a", "b", "c"], "c", "down"), ["a", "b", "c"]);
    assert.deepEqual(moveTo(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  });

  it("orders columns and the phone from one list", () => {
    const order = parseOverviewPrefs({ order: ["today", "money", "up_next"] }).order;
    assert.deepEqual(groupOrder(order, LEFT_COLUMN), ["today", "up_next"]);
    assert.deepEqual(phoneOrder({ order, reordered: false }), [...PHONE_CARD_ORDER]);
    assert.deepEqual(phoneOrder({ order, reordered: true }), order);
  });

  it("masks amounts", () => {
    assert.equal(maskedMoney("£0.00"), "£•••");
    assert.equal(maskedMoney("€0,00"), "€•••");
  });
});
