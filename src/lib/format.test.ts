import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  endTime,
  formatInTz,
  formatMoney,
  formatTimeInTz,
  initials,
  intervalContains,
  intervalsOverlap,
  isoDate,
  minutesToTime,
  parseMoneyToMinor,
  pct,
  startOfWeek,
  timeToMinutes,
} from "./format.ts";

describe("formatMoney", () => {
  it("renders minor units as currency", () => {
    assert.equal(formatMoney(4500), "£45.00");
    assert.equal(formatMoney(4550, "EUR", { locale: "en-IE" }), "€45.50");
  });

  it("drops the pence in compact mode only when there are none", () => {
    // maximumFractionDigits stays at 2, so £45.50 must not compact to £46.
    assert.equal(formatMoney(4500, "GBP", { compact: true }), "£45");
    assert.equal(formatMoney(4550, "GBP", { compact: true }), "£45.5");
  });

  it("handles zero and refunds", () => {
    assert.equal(formatMoney(0), "£0.00");
    assert.equal(formatMoney(-2500), "-£25.00");
  });
});

describe("parseMoneyToMinor", () => {
  it("takes what someone types into a price field", () => {
    assert.equal(parseMoneyToMinor("45"), 4500);
    assert.equal(parseMoneyToMinor("45.50"), 4550);
    assert.equal(parseMoneyToMinor("£45.50"), 4550);
    assert.equal(parseMoneyToMinor(" 1,250.00 "), 125000);
  });

  it("rounds rather than truncating a third decimal", () => {
    assert.equal(parseMoneyToMinor("45.555"), 4556);
  });

  it("avoids the float error that plain multiplication produces", () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754; unrounded this charges a
    // penny short.
    assert.equal(parseMoneyToMinor("19.99"), 1999);
    assert.equal(parseMoneyToMinor(19.99), 1999);
  });

  it("refuses anything that is not an amount", () => {
    assert.throws(() => parseMoneyToMinor(""), /Invalid amount/);
    assert.throws(() => parseMoneyToMinor("free"), /Invalid amount/);
    assert.throws(() => parseMoneyToMinor(Number.NaN), /Invalid amount/);
    assert.throws(() => parseMoneyToMinor(Number.POSITIVE_INFINITY), /Invalid amount/);
  });
});

describe("timezone formatting", () => {
  it("shows an instant in the studio's own clock, not the viewer's", () => {
    // 08:30 UTC in July is 09:30 in London and 10:30 in Madrid. A studio must
    // read its own local time whichever machine loads the page.
    const iso = "2026-07-14T08:30:00.000Z";
    assert.equal(formatTimeInTz(iso, "Europe/London"), "09:30");
    assert.equal(formatTimeInTz(iso, "Europe/Madrid"), "10:30");
    assert.equal(formatTimeInTz(iso, "UTC"), "08:30");
  });

  it("crosses midnight where the timezone does", () => {
    // 23:30 UTC in January is still the 14th in London but already the 15th in
    // Sydney, so a late session lands on a different day for each studio.
    const iso = "2026-01-14T23:30:00.000Z";
    assert.match(formatInTz(iso, "Europe/London", { dateStyle: "short" }), /14\/01\/2026/);
    assert.match(formatInTz(iso, "Australia/Sydney", { dateStyle: "short" }), /15\/01\/2026/);
  });

  it("follows British Summer Time, so the offset is not fixed", () => {
    // The same wall clock is UTC in winter and UTC+1 in summer; hard-coding
    // either one puts every session an hour out for half the year.
    assert.equal(formatTimeInTz("2026-01-14T12:00:00.000Z", "Europe/London"), "12:00");
    assert.equal(formatTimeInTz("2026-07-14T12:00:00.000Z", "Europe/London"), "13:00");
  });
});

describe("intervals", () => {
  const start = "2026-07-14T09:00:00.000Z";
  const end = "2026-07-14T10:00:00.000Z";

  it("is half-open, so the end instant belongs to the next slot", () => {
    // Back-to-back 09:00 and 10:00 sessions must not both claim 10:00.
    assert.equal(intervalContains(start, end, start), true);
    assert.equal(intervalContains(start, end, "2026-07-14T09:59:59.999Z"), true);
    assert.equal(intervalContains(start, end, end), false);
    assert.equal(intervalContains(start, end, "2026-07-14T08:59:59.999Z"), false);
  });

  it("does not call touching intervals an overlap", () => {
    assert.equal(intervalsOverlap(start, end, end, "2026-07-14T11:00:00.000Z"), false);
    assert.equal(intervalsOverlap(end, "2026-07-14T11:00:00.000Z", start, end), false);
  });

  it("catches a real double booking whichever way round it is passed", () => {
    const overlapping = ["2026-07-14T09:30:00.000Z", "2026-07-14T10:30:00.000Z"] as const;
    assert.equal(intervalsOverlap(start, end, ...overlapping), true);
    assert.equal(intervalsOverlap(...overlapping, start, end), true);
  });

  it("catches one interval wholly inside another", () => {
    assert.equal(
      intervalsOverlap(start, end, "2026-07-14T09:15:00.000Z", "2026-07-14T09:45:00.000Z"),
      true,
    );
  });
});

describe("calendar helpers", () => {
  it("starts the week on Monday", () => {
    // 2026-07-14 is a Tuesday; 2026-07-12 is the Sunday before it, which belongs
    // to the previous week in a UK diary.
    assert.equal(isoDate(startOfWeek(new Date(2026, 6, 14))), "2026-07-13");
    assert.equal(isoDate(startOfWeek(new Date(2026, 6, 13))), "2026-07-13");
    assert.equal(isoDate(startOfWeek(new Date(2026, 6, 12))), "2026-07-06");
  });

  it("pads the date parts", () => {
    assert.equal(isoDate(new Date(2026, 0, 5)), "2026-01-05");
  });
});

describe("time-of-day arithmetic", () => {
  it("round-trips minutes and HH:mm", () => {
    assert.equal(minutesToTime(0), "00:00");
    assert.equal(minutesToTime(540), "09:00");
    assert.equal(minutesToTime(1439), "23:59");
    assert.equal(timeToMinutes("09:30"), 570);
    assert.equal(timeToMinutes(minutesToTime(725)), 725);
  });

  it("adds a duration to a start time", () => {
    assert.equal(endTime("09:00", 45), "09:45");
    assert.equal(endTime("09:30", 45), "10:15");
    assert.equal(endTime("23:00", 30), "23:30");
  });
});

describe("initials", () => {
  it("takes at most two", () => {
    assert.equal(initials("Ada Lovelace"), "AL");
    assert.equal(initials("Mary Ann Evans"), "MA");
    assert.equal(initials("Prince"), "P");
  });
});

describe("pct", () => {
  it("drops a trailing zero but keeps a real decimal", () => {
    assert.equal(pct(80), "80%");
    assert.equal(pct(80.5), "80.5%");
    assert.equal(pct(0), "0%");
  });
});
