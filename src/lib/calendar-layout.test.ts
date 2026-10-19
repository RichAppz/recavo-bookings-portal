import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignLanes,
  dayCountLabel,
  weekSpans,
  fitHourHeight,
  firstName,
  layoutOverlaps,
  listDayHeading,
  periodDays,
  periodInPast,
  periodWord,
  rangeSummary,
  rangeTitle,
  shiftAnchor,
  shortDuration,
  valueLine,
  visibleHourRange,
} from "./calendar-layout.ts";

describe("visibleHourRange", () => {
  it("falls back to 07:00–21:00 with nothing to go on", () => {
    assert.deepEqual(visibleHourRange([], null), { startHour: 7, endHour: 21 });
  });
  it("widens to cover opening hours and sessions, rounded to whole hours", () => {
    const range = visibleHourRange(
      [
        { startMin: 6 * 60 + 30, endMin: 7 * 60 },
        { startMin: 20 * 60, endMin: 21 * 60 + 15 },
      ],
      { openMinute: 9 * 60, closeMinute: 17 * 60 },
    );
    assert.deepEqual(range, { startHour: 6, endHour: 22 });
  });
  it("uses the opening hours alone when sessions sit inside them", () => {
    const range = visibleHourRange([{ startMin: 600, endMin: 660 }], {
      openMinute: 8 * 60,
      closeMinute: 18 * 60,
    });
    assert.deepEqual(range, { startHour: 8, endHour: 18 });
  });
});

describe("fitHourHeight", () => {
  it("fits the range into the space but never under the minimum", () => {
    assert.equal(fitHourHeight({ startHour: 7, endHour: 21 }, 1400), 100);
    assert.equal(fitHourHeight({ startHour: 7, endHour: 21 }, 280), 40);
    assert.equal(fitHourHeight({ startHour: 7, endHour: 21 }, 0), 40);
  });
});

describe("layoutOverlaps", () => {
  const item = (id: string, startMin: number, endMin: number) => ({ id, startMin, endMin });
  it("gives non-overlapping items the full width", () => {
    const { placed, overflow } = layoutOverlaps([item("a", 540, 600), item("b", 600, 660)]);
    assert.deepEqual(
      placed.map((p) => [p.item.id, p.col, p.cols]),
      [
        ["a", 0, 1],
        ["b", 0, 1],
      ],
    );
    assert.equal(overflow.length, 0);
  });
  it("splits a column equally between overlapping items", () => {
    const { placed } = layoutOverlaps([
      item("a", 540, 660),
      item("b", 570, 630),
      item("c", 660, 720),
    ]);
    const byId = Object.fromEntries(placed.map((p) => [p.item.id, [p.col, p.cols]]));
    assert.deepEqual(byId, { a: [0, 2], b: [1, 2], c: [0, 1] });
  });
  it("shows two and a +N block when more than three overlap", () => {
    const { placed, overflow } = layoutOverlaps([
      item("a", 540, 600),
      item("b", 540, 600),
      item("c", 540, 600),
      item("d", 550, 620),
    ]);
    assert.deepEqual(placed.map((p) => p.item.id).sort(), ["a", "b"]);
    assert.deepEqual(overflow, [{ startMin: 540, endMin: 620, count: 2, col: 2, cols: 3 }]);
  });
});

describe("rangeTitle", () => {
  it("writes the week range the way the spec does", () => {
    assert.equal(
      rangeTitle("week", new Date(2026, 9, 19), new Date(2026, 9, 25)),
      "19 to 25 October",
    );
    assert.equal(
      rangeTitle("week", new Date(2026, 8, 28), new Date(2026, 9, 4)),
      "28 Sept to 4 Oct",
    );
    assert.equal(
      rangeTitle("week", new Date(2026, 11, 29), new Date(2027, 0, 4)),
      "29 Dec 2026 to 4 Jan 2027",
    );
    assert.equal(rangeTitle("month", new Date(2026, 9, 1), new Date(2026, 9, 31)), "October 2026");
    assert.equal(
      rangeTitle("day", new Date(2026, 9, 19), new Date(2026, 9, 19)),
      "Monday 19 October",
    );
  });
});

describe("summaries", () => {
  const money = (m: number) => `£${m / 100}`;
  it("counts sessions and expected value", () => {
    assert.equal(rangeSummary(9, 48600, "session", money), "9 sessions · £486 expected");
    assert.equal(rangeSummary(1, 5400, "session", money), "1 session · £54 expected");
  });
  it("writes the phone value line per view", () => {
    assert.equal(valueLine("day", 3, "session"), "today · 3 sessions");
    assert.equal(valueLine("week", 9, "session"), "this week · 9 sessions");
    assert.equal(valueLine("list", 9, "session"), "this week · 9 sessions");
    assert.equal(valueLine("month", 1, "session"), "this month · 1 session");
    assert.equal(valueLine("day", 2, "session", "tomorrow"), "tomorrow · 2 sessions");
  });
  it("names the period relative to today once paged away", () => {
    const today = new Date(2026, 9, 19); // Mon 19 Oct
    const d = (day: number, month = 9) => new Date(2026, month, day);
    assert.equal(periodWord("day", d(19), d(19), d(19), today), "today");
    assert.equal(periodWord("day", d(20), d(20), d(20), today), "tomorrow");
    assert.equal(periodWord("day", d(18), d(18), d(18), today), "yesterday");
    assert.equal(periodWord("day", d(3, 10), d(3, 10), d(3, 10), today), "on Tue 3 Nov");
    assert.equal(periodWord("week", d(21), d(19), d(25), today), "this week");
    assert.equal(periodWord("week", d(26), d(26), d(1, 10), today), "next week");
    assert.equal(periodWord("list", d(12), d(12), d(18), today), "last week");
    assert.equal(periodWord("week", d(2, 10), d(2, 10), d(8, 10), today), "w/c Mon 2 Nov");
    assert.equal(periodWord("month", d(1), d(28, 8), d(8, 10), today), "this month");
    assert.equal(periodWord("month", d(1, 10), d(26), d(6, 11), today), "in November");
    assert.equal(
      periodWord("month", new Date(2027, 0, 1), d(28, 11), new Date(2027, 1, 7), today),
      "in January 2027",
    );
  });
  it("knows when the whole visible period is behind us", () => {
    const today = new Date(2026, 9, 19, 13, 0); // Mon 19 Oct, 13:00
    const d = (day: number, month = 9) => new Date(2026, month, day);
    assert.equal(periodInPast("day", d(18), d(18), today), true);
    assert.equal(periodInPast("day", d(19), d(19), today), false);
    assert.equal(periodInPast("day", d(20), d(20), today), false);
    assert.equal(periodInPast("week", d(14), d(18), today), true);
    assert.equal(periodInPast("week", d(21), d(25), today), false);
    assert.equal(periodInPast("list", d(26), d(1, 10), today), false);
    assert.equal(periodInPast("month", d(1, 8), d(4, 9), today), true);
    assert.equal(periodInPast("month", d(1), d(8, 10), today), false);
    assert.equal(periodInPast("month", new Date(2025, 11, 1), d(4, 0), today), true);
  });
  it("labels a day's rows", () => {
    assert.equal(dayCountLabel(3, 0, "session"), "3 sessions");
    assert.equal(dayCountLabel(1, 1, "session"), "1 session, 1 event");
    assert.equal(dayCountLabel(0, 2, "session"), "2 events");
  });
  it("heads list days relative to today", () => {
    const today = new Date(2026, 9, 19);
    assert.equal(listDayHeading(new Date(2026, 9, 19), today), "Today, Mon 19");
    assert.equal(listDayHeading(new Date(2026, 9, 20), today), "Tomorrow, Tue 20");
    assert.equal(listDayHeading(new Date(2026, 9, 22), today), "Thu 22");
  });
  it("shortens durations and names", () => {
    assert.equal(shortDuration(60), "1 hr");
    assert.equal(shortDuration(90), "1 hr 30 min");
    assert.equal(shortDuration(30), "30 min");
    assert.equal(firstName("Sam Taylor"), "Sam");
    assert.equal(firstName(null), "");
  });
});

describe("periodDays / shiftAnchor (the page beside the current one)", () => {
  it("draws a day from local midnight, a Monday-first week, and six weeks for a month", () => {
    const anchor = new Date(2026, 9, 19, 14, 30); // Mon 19 Oct, mid-afternoon
    const day = periodDays("day", anchor);
    assert.equal(day.length, 1);
    assert.equal(day[0]!.getHours(), 0);
    assert.equal(day[0]!.getDate(), 19);
    const week = periodDays("week", new Date(2026, 9, 22)); // a Thursday
    assert.deepEqual(
      week.map((d) => d.getDate()),
      [19, 20, 21, 22, 23, 24, 25],
    );
    assert.equal(periodDays("list", new Date(2026, 9, 22)).length, 7);
    const month = periodDays("month", new Date(2026, 9, 19));
    assert.equal(month.length, 42);
    // October 2026 starts on a Thursday, so the grid opens on Mon 28 Sep.
    assert.equal(month[0]!.getMonth(), 8);
    assert.equal(month[0]!.getDate(), 28);
    assert.equal(month[41]!.getMonth(), 10);
    assert.equal(month[41]!.getDate(), 8);
  });
  it("pages a day, a week or a month either way", () => {
    const anchor = new Date(2026, 9, 31, 9);
    assert.equal(shiftAnchor("day", anchor, 1).getDate(), 1);
    assert.equal(shiftAnchor("day", anchor, -1).getDate(), 30);
    assert.equal(shiftAnchor("week", anchor, 1).getDate(), 7);
    assert.equal(shiftAnchor("list", anchor, -1).getDate(), 24);
    // From the 31st, next month lands on the 1st rather than skipping November.
    const next = shiftAnchor("month", anchor, 1);
    assert.equal(next.getMonth(), 10);
    assert.equal(next.getDate(), 1);
    const back = shiftAnchor("month", new Date(2026, 0, 15), -1);
    assert.equal(back.getFullYear(), 2025);
    assert.equal(back.getMonth(), 11);
  });
  it("the next page's days start where this page's end", () => {
    for (const view of ["day", "week", "month"] as const) {
      const anchor = new Date(2026, 9, 19);
      const here = periodDays(view, anchor);
      const there = periodDays(view, shiftAnchor(view, anchor, 1));
      if (view === "month") {
        assert.equal(there[0]!.getMonth() <= 10, true);
        assert.equal(
          there.some((d) => d.getMonth() === 10 && d.getDate() === 1),
          true,
        );
      } else {
        const last = here[here.length - 1]!;
        const expected = new Date(last);
        expected.setDate(expected.getDate() + 1);
        assert.equal(there[0]!.getTime(), expected.getTime());
      }
    }
  });
});

/** Six Monday-first weeks from Mon 28 Sept 2026, as the October month grid draws. */
const octoberGrid = Array.from({ length: 42 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 28 + i));
  return d.toISOString().slice(0, 10);
});
const run = (from: string, days: number) =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

describe("weekSpans", () => {
  it("a job inside one week is one bar, rounded at both ends", () => {
    // Mon 5 – Wed 7 Oct: row 1, columns 0–2.
    assert.deepEqual(weekSpans(run("2026-10-05", 3), octoberGrid), [
      { week: 1, startCol: 0, endCol: 2, roundStart: true, roundEnd: true },
    ]);
  });
  it("a job over the weekend boundary is a bar per row, square where they meet", () => {
    // Fri 9 – Tue 13 Oct.
    assert.deepEqual(weekSpans(run("2026-10-09", 5), octoberGrid), [
      { week: 1, startCol: 4, endCol: 6, roundStart: true, roundEnd: false },
      { week: 2, startCol: 0, endCol: 1, roundStart: false, roundEnd: true },
    ]);
  });
  it("a long job cuts both ends of the rows it passes straight through", () => {
    // Sat 3 – Tue 20 Oct: rows 0, 1, 2, 3.
    const spans = weekSpans(run("2026-10-03", 18), octoberGrid);
    assert.deepEqual(
      spans.map((s) => [s.week, s.startCol, s.endCol, s.roundStart, s.roundEnd]),
      [
        [0, 5, 6, true, false],
        [1, 0, 6, false, false],
        [2, 0, 6, false, false],
        [3, 0, 1, false, true],
      ],
    );
  });
  it("a job that skips days becomes separate rounded bars", () => {
    // Working days Thu 8, Fri 9, then Mon 12 Oct: the weekend is not worked.
    assert.deepEqual(weekSpans(["2026-10-08", "2026-10-09", "2026-10-12"], octoberGrid), [
      { week: 1, startCol: 3, endCol: 4, roundStart: true, roundEnd: true },
      { week: 2, startCol: 0, endCol: 0, roundStart: true, roundEnd: true },
    ]);
  });
  it("days outside the grid are dropped but still cut the visible end", () => {
    // Started Fri 25 Sept, runs to Tue 29 Sept: only Mon 28 – Tue 29 are on the grid.
    assert.deepEqual(weekSpans(run("2026-09-25", 5), octoberGrid), [
      { week: 0, startCol: 0, endCol: 1, roundStart: false, roundEnd: true },
    ]);
    assert.deepEqual(weekSpans(run("2026-11-10", 3), octoberGrid), []);
  });
  it("unsorted or repeated days are tolerated", () => {
    assert.deepEqual(
      weekSpans(["2026-10-07", "2026-10-05", "2026-10-06", "2026-10-06"], octoberGrid),
      [{ week: 1, startCol: 0, endCol: 2, roundStart: true, roundEnd: true }],
    );
  });
});

describe("assignLanes", () => {
  it("bars that do not overlap share the top lane", () => {
    const { placed, laneCount } = assignLanes([
      { id: "a", startCol: 0, endCol: 1 },
      { id: "b", startCol: 2, endCol: 4 },
      { id: "c", startCol: 5, endCol: 6 },
    ]);
    assert.equal(laneCount, 1);
    assert.deepEqual(
      placed.map((p) => [p.id, p.lane]),
      [
        ["a", 0],
        ["b", 0],
        ["c", 0],
      ],
    );
  });
  it("overlapping bars stack, longer first when they start together", () => {
    const { placed, laneCount } = assignLanes([
      { id: "short", startCol: 1, endCol: 2 },
      { id: "long", startCol: 1, endCol: 5 },
      { id: "late", startCol: 2, endCol: 6 },
    ]);
    assert.equal(laneCount, 3);
    const lane = Object.fromEntries(placed.map((p) => [p.id, p.lane]));
    assert.deepEqual(lane, { long: 0, short: 1, late: 2 });
  });
  it("a freed lane is reused by the next bar that fits", () => {
    const { placed, laneCount } = assignLanes([
      { id: "a", startCol: 0, endCol: 3 },
      { id: "b", startCol: 0, endCol: 1 },
      { id: "c", startCol: 2, endCol: 2 },
      { id: "d", startCol: 4, endCol: 6 },
    ]);
    assert.equal(laneCount, 2);
    const lane = Object.fromEntries(placed.map((p) => [p.id, p.lane]));
    assert.deepEqual(lane, { a: 0, b: 1, c: 1, d: 0 });
  });
  it("ties keep the order given", () => {
    const { placed } = assignLanes([
      { id: "first", startCol: 0, endCol: 2 },
      { id: "second", startCol: 0, endCol: 2 },
    ]);
    assert.deepEqual(
      placed.map((p) => [p.id, p.lane]),
      [
        ["first", 0],
        ["second", 1],
      ],
    );
  });
  it("nothing in, nothing out", () => {
    assert.deepEqual(assignLanes([]), { placed: [], laneCount: 0 });
  });
});
