import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dayCountLabel,
  fitHourHeight,
  firstName,
  layoutOverlaps,
  listDayHeading,
  periodInPast,
  periodWord,
  rangeSummary,
  rangeTitle,
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
