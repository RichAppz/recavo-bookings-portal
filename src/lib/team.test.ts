import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookableStatus,
  copyMondayToAll,
  dateRangeText,
  feedWhen,
  filterPeople,
  hoursText,
  nextColour,
  nextFreeText,
  PALETTE,
  presetSameAs,
  roleAccess,
  signInLine,
  slotsError,
  slotWarning,
  takesBookings,
  timeAwayAddedText,
  timeAwayShades,
  type ListPerson,
} from "./team.ts";

const LONDON = "Europe/London";

describe("bookableStatus", () => {
  it("names the reason and the one fix", () => {
    const s = bookableStatus("no_hours", "Ben Carter");
    assert.equal(s.tone, "amber");
    assert.equal(s.line, "No working hours");
    assert.equal(s.fixLabel, "Set hours");
    assert.equal(s.reason, "Ben has no working hours set.");
  });

  it("is grey with no fix when the person doesn't take bookings", () => {
    const s = bookableStatus("not_bookable", "Sara");
    assert.equal(s.tone, "grey");
    assert.equal(s.fix, null);
  });

  it("shows next free when bookable", () => {
    assert.equal(
      bookableStatus("bookable", "Sara", "Next free Thu 08:00").line,
      "Next free Thu 08:00",
    );
  });
});

describe("nextFreeText", () => {
  const now = new Date("2026-10-26T10:00:00Z"); // Monday
  it("says today, tomorrow or the weekday", () => {
    assert.equal(nextFreeText("2026-10-26T14:30:00Z", LONDON, now), "Next free today 14:30");
    assert.equal(nextFreeText("2026-10-27T08:00:00Z", LONDON, now), "Next free tomorrow 08:00");
    assert.equal(nextFreeText("2026-10-29T08:00:00Z", LONDON, now), "Next free Thu 08:00");
  });
  it("is fully booked without a slot", () => {
    assert.equal(nextFreeText(null, LONDON, now), "Fully booked for 2 weeks");
  });
});

describe("signInLine", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  it("reads a recent sign-in", () => {
    const line = signInLine(
      { status: "active", roleKeys: ["staff"], lastLoginAt: "2026-10-26T08:00:00Z", email: null },
      null,
      true,
      now,
    );
    assert.equal(line.line, "Signed in today");
    assert.equal(line.roleKey, "staff");
  });
  it("shows a pending and an expired invite", () => {
    const base = {
      expiresAt: "2026-11-01T10:00:00Z",
      sentAt: null,
      createdAt: "2026-10-25T10:00:00Z",
      roleKeys: ["reception"],
      email: "a@b.co",
    };
    assert.equal(
      signInLine(null, { ...base, state: "pending" }, false, now).line,
      "Invite sent · expires 1 Nov",
    );
    const expired = signInLine(
      null,
      { ...base, state: "expired", expiresAt: "2026-10-20T10:00:00Z" },
      false,
      now,
    );
    assert.equal(expired.line, "Invite expired 20 Oct");
    assert.equal(expired.tone, "red");
  });
  it("is diary only without a sign-in", () => {
    assert.equal(signInLine(null, null, true, now).line, "Diary only");
  });
});

describe("roles", () => {
  it("compares access from the permission bundles", () => {
    assert.equal(roleAccess("staff").Calendar, "Own");
    assert.equal(roleAccess("staff").Clients, "View");
    assert.equal(roleAccess("reception").Payments, "View");
    assert.equal(roleAccess("administrator").Team, "All");
    assert.equal(roleAccess("restricted_staff").Clients, "·");
  });
});

describe("colours", () => {
  it("gives the next unused preset", () => {
    assert.equal(nextColour([]), PALETTE[0]);
    assert.equal(nextColour([PALETTE[0].toUpperCase(), null]), PALETTE[1]);
  });
});

describe("hours", () => {
  it("formats weekly hours", () => {
    assert.equal(hoursText(0), "No hours");
    assert.equal(hoursText(38 * 60), "38 hrs");
    assert.equal(hoursText(450), "7.5 hrs");
  });

  it("catches overlaps and backwards slots", () => {
    assert.equal(
      slotsError([{ startMinute: 600, endMinute: 540 }]),
      "Finish time must be after start time.",
    );
    assert.equal(
      slotsError([
        { startMinute: 540, endMinute: 720 },
        { startMinute: 700, endMinute: 800 },
      ]),
      "These times overlap.",
    );
    assert.equal(
      slotsError([
        { startMinute: 540, endMinute: 720 },
        { startMinute: 780, endMinute: 1020 },
      ]),
      null,
    );
  });

  it("copies Monday to the days that are on", () => {
    const rules = [
      { dayOfWeek: 1, startMinute: 480, endMinute: 720, locationId: null },
      { dayOfWeek: 1, startMinute: 780, endMinute: 1020, locationId: null },
      { dayOfWeek: 2, startMinute: 600, endMinute: 660, locationId: null },
    ];
    const out = copyMondayToAll(rules, [1, 2, 3]);
    assert.equal(out.filter((r) => r.dayOfWeek === 2).length, 2);
    assert.equal(out.filter((r) => r.dayOfWeek === 3).length, 2);
    assert.equal(out.filter((r) => r.dayOfWeek === 4).length, 0);
  });

  it("copies a location's opening hours", () => {
    const out = presetSameAs(
      { id: "loc", openingHours: [{ dayOfWeek: 2, openMinute: 480, closeMinute: 1020 }] },
      true,
    );
    assert.deepEqual(out, [{ dayOfWeek: 2, startMinute: 480, endMinute: 1020, locationId: "loc" }]);
  });

  it("warns when a slot starts before the location opens", () => {
    const studio = {
      id: "s",
      name: "Studio",
      openingHours: [{ dayOfWeek: 1, openMinute: 480, closeMinute: 1020 }],
    };
    assert.equal(
      slotWarning({ dayOfWeek: 1, startMinute: 420, endMinute: 1020, locationId: "s" }, [studio]),
      "Studio opens 08:00, 1 hour won't be bookable",
    );
    assert.equal(
      slotWarning({ dayOfWeek: 1, startMinute: 480, endMinute: 1020, locationId: "s" }, [studio]),
      null,
    );
    assert.equal(
      slotWarning({ dayOfWeek: 2, startMinute: 480, endMinute: 600, locationId: "s" }, [studio]),
      "Studio is closed on Tuesdays, 2 hours won't be bookable",
    );
  });

  it("never warns for a location open whenever the team works", () => {
    assert.equal(
      slotWarning({ dayOfWeek: 1, startMinute: 0, endMinute: 60, locationId: null }, [
        { id: "x", name: "Van", openingHours: [] },
      ]),
      null,
    );
  });
});

describe("filterPeople", () => {
  const person = (
    id: string,
    name: string,
    extra: Partial<ListPerson["staff"]> = {},
    signIn: ListPerson["signIn"] = null,
  ): ListPerson => ({
    staff: {
      id,
      displayName: name,
      title: null,
      status: "active",
      locationIds: [],
      displayOrder: 0,
      ...extra,
    },
    signIn,
    invitation: null,
  });
  const people = [
    person("1", "Zoe", { displayOrder: 1 }),
    person(
      "2",
      "Ben",
      { displayOrder: 1, locationIds: ["a"] },
      {
        email: "ben@x.co",
        roleKeys: ["reception"],
        status: "active",
      },
    ),
    person("3", "Ann", { status: "suspended" }),
    person("4", "Cal", { displayOrder: 0, locationIds: ["b"] }),
  ];

  it("splits active and archived, ordered by display order then name", () => {
    assert.deepEqual(
      filterPeople(people, { tab: "active", q: "", location: null, role: null }).map(
        (p) => p.staff.id,
      ),
      ["4", "2", "1"],
    );
    assert.deepEqual(
      filterPeople(people, { tab: "archived", q: "", location: null, role: null }).map(
        (p) => p.staff.id,
      ),
      ["3"],
    );
  });

  it("searches by email and filters by location and role", () => {
    assert.deepEqual(
      filterPeople(people, { tab: "active", q: "BEN@", location: null, role: null }).map(
        (p) => p.staff.id,
      ),
      ["2"],
    );
    assert.deepEqual(
      filterPeople(people, { tab: "active", q: "", location: "a", role: null }).map(
        (p) => p.staff.id,
      ),
      ["2", "1"],
    );
    assert.deepEqual(
      filterPeople(people, { tab: "active", q: "", location: null, role: "none" }).map(
        (p) => p.staff.id,
      ),
      ["4", "1"],
    );
  });
});

describe("takesBookings", () => {
  it("drops archived and non-bookable people", () => {
    assert.equal(takesBookings({ status: "active" }), true);
    assert.equal(takesBookings({ status: "active", bookable: false }), false);
    assert.equal(takesBookings({ status: "suspended", bookable: true }), false);
  });
});

describe("time away text", () => {
  it("names the range", () => {
    assert.equal(dateRangeText("2026-11-03", "2026-11-07"), "3 to 7 Nov");
    assert.equal(dateRangeText("2026-10-30", "2026-11-02"), "30 Oct to 2 Nov");
    assert.equal(
      timeAwayAddedText("holiday", "Hannah Lee", "2026-11-03", "2026-11-07"),
      "Holiday added for Hannah, 3 to 7 Nov",
    );
  });

  it("shows the last day an all-day span covers", () => {
    assert.equal(
      feedWhen({ start: "2026-11-03T00:00:00Z", end: "2026-11-08T00:00:00Z", allDay: true }, "UTC"),
      "Tue 3 Nov to Sat 7 Nov",
    );
    assert.equal(
      feedWhen(
        { start: "2026-11-03T09:00:00Z", end: "2026-11-03T12:00:00Z", allDay: false },
        "UTC",
      ),
      "Tue 3 Nov 09:00 to 12:00",
    );
  });
});

describe("timeAwayShades", () => {
  it("bands each day the period touches", () => {
    const out = timeAwayShades(
      [{ start: "2026-11-03T14:00:00Z", end: "2026-11-04T10:00:00Z", label: "Holiday" }],
      ["2026-11-03", "2026-11-04", "2026-11-05"],
      "UTC",
    );
    assert.deepEqual(out.get("2026-11-03"), [{ startMin: 840, endMin: 1440, label: "Holiday" }]);
    assert.deepEqual(out.get("2026-11-04"), [{ startMin: 0, endMin: 600, label: "Holiday" }]);
    assert.equal(out.has("2026-11-05"), false);
  });
});
