import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closureAddedText,
  closureDatesText,
  closureInterval,
  closureShades,
  todayWithClosures,
  upcomingClosures,
} from "./closures.ts";
import type { LocationClosure } from "./closures.ts";

const LONDON = "Europe/London";
const location = {
  id: "loc-1",
  timezone: LONDON,
  openingHours: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
    dayOfWeek,
    openMinute: 8 * 60,
    closeMinute: 17 * 60,
  })),
};

function closure(fields: Partial<LocationClosure>): LocationClosure {
  return {
    id: "c1",
    businessId: "b1",
    locationId: "loc-1",
    startsOn: "2026-12-22",
    endsOn: "2026-12-22",
    startMinute: null,
    endMinute: null,
    reason: null,
    source: "manual",
    version: 1,
    ...fields,
  };
}

describe("closureDatesText", () => {
  it("reads whole days and part days without dashes", () => {
    assert.equal(closureDatesText(closure({})), "22 Dec");
    assert.equal(closureDatesText(closure({ endsOn: "2027-01-02" })), "22 Dec to 2 Jan");
    assert.equal(
      closureDatesText(closure({ startMinute: 720, endMinute: 840 })),
      "22 Dec, 12:00 to 14:00",
    );
    assert.equal(
      closureDatesText(closure({ endsOn: "2026-12-23", startMinute: 1020, endMinute: 540 })),
      "22 Dec 17:00 to 23 Dec 09:00",
    );
  });
});

describe("closureInterval", () => {
  it("covers whole local days, across the clocks changing", () => {
    const span = closureInterval(closure({ startsOn: "2026-10-24", endsOn: "2026-10-25" }), LONDON);
    assert.equal(span.start.toISOString(), "2026-10-23T23:00:00.000Z");
    assert.equal(span.end.toISOString(), "2026-10-26T00:00:00.000Z");
  });
});

describe("todayWithClosures", () => {
  it("says closed for the reason on a closed day", () => {
    const now = new Date("2026-12-24T10:00:00Z");
    const state = todayWithClosures(
      location,
      [closure({ endsOn: "2027-01-02", reason: "Christmas" })],
      now,
    );
    assert.equal(state.tone, "grey");
    assert.equal(state.pill, "Closed for Christmas");
    assert.equal(state.line, "Closed until 3 Jan");
  });

  it("says closed until a time during a part-day closure", () => {
    const now = new Date("2026-12-22T12:30:00Z");
    const state = todayWithClosures(
      location,
      [closure({ startMinute: 720, endMinute: 840, reason: "training" })],
      now,
    );
    assert.equal(state.pill, "Closed until 14:00");
  });

  it("mentions a closure coming up soon, and nothing once it's far off or over", () => {
    const soon = todayWithClosures(location, [closure({})], new Date("2026-12-15T10:00:00Z"));
    assert.equal(soon.pill, "Open until 17:00");
    assert.equal(soon.line, "Closure on 22 Dec");
    const far = todayWithClosures(location, [closure({})], new Date("2026-11-01T10:00:00Z"));
    assert.equal(far.line, "08:00 to 17:00");
    const after = todayWithClosures(location, [closure({})], new Date("2026-12-23T10:00:00Z"));
    assert.equal(after.pill, "Open until 17:00");
  });

  it("ignores other locations", () => {
    const state = todayWithClosures(
      location,
      [closure({ locationId: "elsewhere" })],
      new Date("2026-12-22T10:00:00Z"),
    );
    assert.equal(state.pill, "Open until 17:00");
  });
});

describe("upcomingClosures", () => {
  it("drops past closures and sorts the rest", () => {
    const list = upcomingClosures(
      [
        closure({ id: "later", startsOn: "2027-04-03", endsOn: "2027-04-03" }),
        closure({ id: "past", startsOn: "2026-01-01", endsOn: "2026-01-01" }),
        closure({ id: "next" }),
      ],
      location,
      new Date("2026-12-01T10:00:00Z"),
    );
    assert.deepEqual(
      list.map((c) => c.id),
      ["next", "later"],
    );
  });
});

describe("closureShades", () => {
  it("splits a closure into each day it touches", () => {
    const shades = closureShades(
      [
        closure({
          endsOn: "2026-12-23",
          startMinute: 1020,
          endMinute: 540,
          reason: "a deep clean",
        }),
      ],
      LONDON,
      ["2026-12-21", "2026-12-22", "2026-12-23"],
      LONDON,
    );
    assert.equal(shades.get("2026-12-21"), undefined);
    assert.deepEqual(shades.get("2026-12-22"), [
      { startMin: 1020, endMin: 1440, label: "Closed: a deep clean" },
    ]);
    assert.deepEqual(shades.get("2026-12-23"), [
      { startMin: 0, endMin: 540, label: "Closed: a deep clean" },
    ]);
  });
});

describe("closureAddedText", () => {
  it("says what happened to the bookings in the way", () => {
    const c = closure({ endsOn: "2027-01-02" });
    assert.equal(closureAddedText(c, { asked: 0, cancelled: 0 }), "Closed 22 Dec to 2 Jan");
    assert.equal(
      closureAddedText(c, { asked: 3, cancelled: 0 }),
      "Closed 22 Dec to 2 Jan · 3 clients asked to rebook",
    );
  });
});
