import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicCataloguePlan } from "@/lib/api/types";
import {
  areaText,
  directionsUrl,
  hoursSummary,
  kindOf,
  lookupPostcode,
  nextOpening,
  planLine,
  planSeat,
  rangeError,
  rangesText,
  tidyPostcode,
  timezoneLabel,
  todayState,
  weekBounds,
  whereText,
} from "./locations.ts";

const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  openMinute: 480,
  closeMinute: 1020,
}));

describe("hours text", () => {
  it("uses 'to', never a dash, and joins several ranges", () => {
    assert.equal(
      rangesText([
        { openMinute: 780, closeMinute: 1020 },
        { openMinute: 480, closeMinute: 720 },
      ]),
      "08:00 to 12:00, 13:00 to 17:00",
    );
  });

  it("groups runs of days with the same hours", () => {
    assert.equal(
      hoursSummary([...weekdays, { dayOfWeek: 6, openMinute: 540, closeMinute: 780 }]),
      "Mon to Fri 08:00 to 17:00 · Sat 09:00 to 13:00",
    );
    assert.equal(
      hoursSummary([
        { dayOfWeek: 1, openMinute: 480, closeMinute: 1020 },
        { dayOfWeek: 2, openMinute: 480, closeMinute: 1020 },
        { dayOfWeek: 4, openMinute: 480, closeMinute: 1020 },
      ]),
      "Mon, Tue 08:00 to 17:00 · Thu 08:00 to 17:00",
    );
    assert.equal(hoursSummary([]), "Open when the team works");
  });
});

describe("todayState", () => {
  const loc = { openingHours: weekdays, timezone: "Europe/London" };
  // Wednesday 22 Oct 2025, BST (UTC+1).
  const at = (hhmm: string) => new Date(`2025-10-22T${hhmm}:00+01:00`);

  it("is open until closing time during the day", () => {
    assert.deepEqual(todayState(loc, at("10:00")), {
      tone: "green",
      pill: "Open until 17:00",
      line: "08:00 to 17:00",
      open: true,
    });
  });

  it("opens later before opening time", () => {
    const s = todayState(loc, at("07:15"));
    assert.equal(s.pill, "Opens at 08:00");
    assert.equal(s.open, false);
  });

  it("is closed after hours with the next opening", () => {
    const s = todayState(loc, at("18:30"));
    assert.equal(s.tone, "grey");
    assert.equal(s.pill, "Closed now");
    assert.equal(s.line, "Opens tomorrow at 08:00");
  });

  it("is closed all day at the weekend and says when it opens", () => {
    const s = todayState(loc, new Date("2025-10-25T12:00:00+01:00"));
    assert.equal(s.pill, "Closed today");
    assert.equal(s.line, "Opens Mon at 08:00");
    assert.equal(nextOpening(weekdays, 5), "Opens Mon at 08:00");
  });

  it("reads the location's own time zone", () => {
    // 07:30 in London is 08:30 in Paris.
    const paris = { openingHours: weekdays, timezone: "Europe/Paris" };
    assert.equal(todayState(paris, at("07:30")).pill, "Open until 17:00");
  });

  it("says staff hours decide when there are none", () => {
    const s = todayState({ openingHours: [], timezone: "Europe/London" });
    assert.equal(s.pill, "Team hours");
    assert.equal(s.line, "Open when the team works");
  });
});

describe("where", () => {
  it("shows the address for premises and the area for mobile", () => {
    assert.equal(
      whereText({
        type: "physical",
        address: {
          line1: "4 Riverside Way",
          line2: null,
          town: "Leeds",
          postcode: "LS1 4AB",
          lat: null,
          lng: null,
        },
        serviceArea: null,
        travelMinutes: 0,
      }),
      "4 Riverside Way, Leeds, LS1 4AB",
    );
    assert.equal(kindOf({ type: "service_area" }), "mobile");
    assert.equal(
      areaText({ basePostcode: "LS1 4AB", radiusMiles: 15, lat: null, lng: null }, 30),
      "Within 15 miles of LS1 4AB · adds 30 min travel",
    );
    assert.equal(
      whereText({ type: "physical", address: null, serviceArea: null, travelMinutes: 0 }),
      "No address yet",
    );
  });

  it("links directions by coordinates when known", () => {
    assert.equal(
      directionsUrl({
        line1: "1 High St",
        line2: null,
        town: null,
        postcode: "LS1 1AA",
        lat: 53.8,
        lng: -1.5,
      }),
      "https://www.google.com/maps/dir/?api=1&destination=53.8%2C-1.5",
    );
  });

  it("names time zones in plain words", () => {
    assert.equal(timezoneLabel("Europe/London"), "UK time");
    assert.equal(timezoneLabel("America/New_York"), "New York time");
  });

  it("tidies UK postcodes", () => {
    assert.equal(tidyPostcode(" ls14ab "), "LS1 4AB");
    assert.equal(tidyPostcode("sw1a 1aa"), "SW1A 1AA");
    assert.equal(tidyPostcode("D02 X285"), "D02 X285");
  });
});

describe("rangeError", () => {
  it("catches backwards and overlapping ranges", () => {
    assert.equal(
      rangeError([{ openMinute: 600, closeMinute: 540 }]),
      "Close time must be after open time.",
    );
    assert.equal(
      rangeError([
        { openMinute: 480, closeMinute: 720 },
        { openMinute: 700, closeMinute: 900 },
      ]),
      "These times overlap.",
    );
    assert.equal(
      rangeError([
        { openMinute: 480, closeMinute: 720 },
        { openMinute: 720, closeMinute: 900 },
      ]),
      null,
    );
  });
});

describe("plan seats", () => {
  const plan = (code: "solo" | "business" | "growth", name: string, n: number) =>
    ({ code, name, limits: { "locations.active": n } }) as unknown as PublicCataloguePlan;
  const plans = [
    plan("growth", "Growth", 5),
    plan("solo", "Solo", 1),
    plan("business", "Business", 2),
  ];

  it("states usage and the next plan up", () => {
    const seat = planSeat(plans[2], plans, 1);
    assert.equal(planLine(seat), "1 of 2 locations on Business");
    assert.equal(seat.atLimit, false);
    assert.equal(seat.next?.name, "Growth");
    const full = planSeat(plans[0], plans, 5);
    assert.equal(planLine(full), "5 of 5 on Growth");
    assert.equal(full.next, null);
  });
});

describe("weekBounds", () => {
  it("runs Monday to Monday", () => {
    const { from, to } = weekBounds(new Date(2025, 9, 22, 15));
    assert.equal(from.getDay(), 1);
    assert.equal(from.getDate(), 20);
    assert.equal(to.getDate(), 27);
    assert.equal(weekBounds(new Date(2025, 9, 26, 15)).from.getDate(), 20);
  });
});

describe("lookupPostcode", () => {
  it("returns the town and coordinates, or null for an unknown postcode", async () => {
    const calls: string[] = [];
    const ok = (async (url: string) => {
      calls.push(url);
      return Response.json({
        result: { postcode: "LS1 4AB", latitude: 53.79, longitude: -1.54, admin_district: "Leeds" },
      });
    }) as unknown as typeof fetch;
    assert.deepEqual(await lookupPostcode("ls1 4ab", ok), {
      postcode: "LS1 4AB",
      town: "Leeds",
      lat: 53.79,
      lng: -1.54,
    });
    assert.deepEqual(calls, ["https://api.postcodes.io/postcodes/ls14ab"]);
    const missing = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    assert.equal(await lookupPostcode("ZZ1 1ZZ", missing), null);
    assert.equal(await lookupPostcode("nope"), null);
  });
});
