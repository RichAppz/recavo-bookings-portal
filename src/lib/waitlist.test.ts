import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WaitlistPreferences } from "./api/types.ts";
import {
  addDaysIso,
  clientWindowPhrase,
  dayChips,
  dayDate,
  describeForClient,
  describePreferences,
  displayPhone,
  fitsLabel,
  headerLine,
  historyText,
  parseFits,
  parseWaitlistSearch,
  slotFits,
  slotFreedCopy,
  sourceLine,
  spokenPreferences,
  timeOfDayPhrase,
  waitingSince,
  windowPassed,
  windowPhrase,
} from "./waitlist.ts";

const prefs = (p: Partial<WaitlistPreferences> = {}): WaitlistPreferences => ({
  from: null,
  to: null,
  days: null,
  timeOfDay: "any",
  ...p,
});

describe("windowPhrase", () => {
  it("uses 'to', never a dash", () => {
    assert.equal(windowPhrase(prefs({ from: "2026-10-03", to: "2026-10-11" })), "3 to 11 Oct");
    assert.equal(windowPhrase(prefs({ from: "2026-10-21", to: "2026-11-01" })), "21 Oct to 1 Nov");
    assert.equal(windowPhrase(prefs({ from: "2026-10-24" })), "From 24 Oct");
    assert.equal(windowPhrase(prefs({ to: "2026-10-31" })), "By 31 Oct");
    assert.equal(windowPhrase(prefs({ from: "2026-10-25", to: "2026-10-25" })), "25 Oct");
    assert.equal(windowPhrase(prefs()), "Whenever");
  });

  it("reads 'onwards' for the client", () => {
    assert.equal(clientWindowPhrase(prefs({ from: "2026-10-25" })), "25 Oct onwards");
    assert.equal(clientWindowPhrase(prefs()), "As soon as possible");
  });
});

describe("preference copy", () => {
  it("chips days and time of day", () => {
    assert.deepEqual(dayChips(prefs({ days: [6, 7] })), ["Sat", "Sun"]);
    assert.deepEqual(dayChips(prefs({ days: [1, 2, 3, 4, 5, 6, 7] })), ["Any day"]);
    assert.deepEqual(dayChips(prefs()), ["Any day"]);
    assert.equal(timeOfDayPhrase(prefs({ timeOfDay: "morning" })), "Mornings only");
    assert.equal(timeOfDayPhrase(prefs()), "Any time");
  });

  it("describes the whole preference in one line", () => {
    const p = prefs({ from: "2026-10-21", to: "2026-11-01", days: [6, 7], timeOfDay: "morning" });
    assert.equal(describePreferences(p), "21 Oct to 1 Nov · Sat, Sun · mornings");
    assert.equal(describePreferences(prefs()), "Whenever");
    assert.equal(
      describeForClient(prefs({ from: "2026-10-25", days: [6, 7], timeOfDay: "morning" })),
      "25 Oct onwards · Sat, Sun · mornings",
    );
    assert.equal(spokenPreferences(p), "21 October to 1 November, Saturdays and Sundays, mornings");
  });

  it("flags a window that has passed", () => {
    assert.equal(windowPassed(prefs({ to: "2026-10-10" }), "2026-10-21"), true);
    assert.equal(windowPassed(prefs({ to: "2026-10-21" }), "2026-10-21"), false);
    assert.equal(windowPassed(prefs(), "2026-10-21"), false);
  });
});

describe("who and when", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  it("says how long they've waited", () => {
    assert.equal(waitingSince("2026-10-21T08:00:00.000Z", now), "Added today");
    assert.equal(waitingSince("2026-10-18T08:00:00.000Z", now), "Waiting 3 days");
    assert.equal(waitingSince("2026-10-05T08:00:00.000Z", now), "Waiting 2 weeks");
  });

  it("names the source", () => {
    const staff = {
      source: "staff" as const,
      createdByUserId: "u1",
      createdBy: { id: "u1", name: "Rich Mucha" },
      createdAt: "2026-10-18T08:00:00.000Z",
    };
    assert.equal(sourceLine(staff, "u1"), "Added by you");
    assert.equal(sourceLine(staff, "u2"), "Added by Rich");
    assert.equal(
      sourceLine({ source: "public", createdBy: null, createdByUserId: null }, "u1"),
      "Booking page",
    );
    assert.equal(headerLine(staff, "u2", now), "Waiting 3 days · added by Rich on 18 Oct");
    assert.equal(
      headerLine({ ...staff, source: "public", createdBy: null, createdByUserId: null }, "u1", now),
      "Waiting 3 days · joined from your booking page",
    );
  });

  it("writes history lines", () => {
    const rich = { id: "u1", name: "Rich Mucha" };
    assert.equal(historyText({ kind: "added", actor: rich, changes: [] }), "Added by Rich");
    assert.equal(
      historyText({ kind: "added", actor: rich, changes: [] }, { myUserId: "u1" }),
      "Added by you",
    );
    assert.equal(
      historyText({ kind: "edited", actor: rich, changes: ["window", "days", "timeOfDay"] }),
      "Changed dates, days and time of day by Rich",
    );
    assert.equal(
      historyText(
        { kind: "edited", actor: null, changes: ["linkedRecord"] },
        { recordLabel: "Vehicle" },
      ),
      "Changed vehicle",
    );
    assert.equal(
      historyText({ kind: "left", actor: null, changes: [] }),
      "Left from their account",
    );
    assert.equal(
      historyText({ kind: "notified", actor: rich, changes: ["sms", "email"] }),
      "Sent them a confirmation text",
    );
  });
});

describe("fits and the URL", () => {
  it("parses a day with an optional time", () => {
    assert.deepEqual(parseFits("2026-10-25"), { date: "2026-10-25", time: null });
    assert.deepEqual(parseFits("2026-10-25T09:00"), { date: "2026-10-25", time: "09:00" });
    assert.equal(parseFits("2026-10-25T9"), null);
    assert.equal(parseFits("tomorrow"), null);
    assert.equal(parseFits("2026-10-25T09:00T1"), null);
    assert.equal(parseFits(""), null);
    assert.equal(dayDate("2026-10-25"), "Sun 25 Oct");
    assert.equal(fitsLabel({ date: "2026-10-25", time: "09:00" }), "Sun 25 Oct, 09:00");
  });

  it("maps old links", () => {
    assert.deepEqual(parseWaitlistSearch({ date: "2026-10-25" }), { fits: "2026-10-25" });
    assert.deepEqual(parseWaitlistSearch({ from: "2026-10-25", to: "2026-10-25" }), {
      fits: "2026-10-25",
    });
    assert.deepEqual(parseWaitlistSearch({ from: "2026-10-21", to: "2026-10-25" }), {
      from: "2026-10-21",
      to: "2026-10-25",
    });
    assert.deepEqual(
      parseWaitlistSearch({ tab: "booked", q: " sam ", page: "2", fits: "bad", entry: "e1" }),
      { tab: "booked", q: "sam", page: 2, entry: "e1" },
    );
    assert.deepEqual(parseWaitlistSearch({ tab: "nope", week: "1" }), { week: true });
  });

  it("describes freed slots in the business's time", () => {
    const base = {
      id: "ev1",
      bookingId: "b1",
      end: "2026-10-25T11:00:00.000Z",
      timezone: "Europe/London",
      allDay: false,
      location: null,
      staffId: null,
      createdAt: "2026-10-21T08:00:00.000Z",
    };
    const one = {
      ...base,
      start: "2026-10-25T09:00:00.000Z",
      serviceName: "Full valet",
      fitCount: 3,
    };
    // 25 Oct 2026 is after the clocks go back: 09:00Z is 09:00 in London.
    assert.equal(slotFits(one), "2026-10-25T09:00");
    assert.deepEqual(slotFreedCopy([one]), {
      lead: "A Full valet on Sun 25 Oct at 09:00 was cancelled.",
      rest: "3 people waiting could take it.",
    });
    const summer = { ...one, start: "2026-10-24T08:00:00.000Z", serviceName: null, fitCount: 1 };
    assert.equal(slotFits(summer), "2026-10-24T09:00");
    assert.deepEqual(slotFreedCopy([summer]), {
      lead: "A booking on Sat 24 Oct at 09:00 was cancelled.",
      rest: "1 person waiting could take it.",
    });
    assert.deepEqual(slotFreedCopy([one, summer]), {
      lead: "2 slots freed this week.",
      rest: "4 people waiting could take one.",
    });
    assert.equal(slotFits({ ...one, allDay: true }), "2026-10-25");
  });

  it("adds days across a month end", () => {
    assert.equal(addDaysIso("2026-10-29", 6), "2026-11-04");
  });

  it("writes UK numbers the way people do", () => {
    assert.equal(displayPhone("+447700900103"), "07700 900103");
    assert.equal(displayPhone("+353861234567"), "+353861234567");
    assert.equal(displayPhone(null), null);
  });
});
