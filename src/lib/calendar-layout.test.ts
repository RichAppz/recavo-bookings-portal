import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dayCountLabel,
  fitHourHeight,
  firstName,
  layoutOverlaps,
  listDayHeading,
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
