import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allDayHolds,
  describeConflict,
  describeHold,
  eventsWithin,
  formatDurationLabel,
  hardClashCopy,
  heldAllDayNote,
  leadName,
  overrideCopy,
  timedClashNote,
  timedJobsWithin,
  timedOverlapNote,
} from "./drop-in.ts";

const TZ = "Europe/London";

const coating = {
  id: "b1",
  // Mon 7 – Wed 9 Sept 2026, all day (local midnights, BST).
  start: "2026-09-06T23:00:00.000Z",
  end: "2026-09-09T23:00:00.000Z",
  allDay: true,
  staffId: "s1",
  status: "confirmed",
  serviceSnapshot: { name: "5 year coating" },
  attendees: [{ name: "Lee Gamble", isLead: true }],
};
const valet = {
  id: "b2",
  start: "2026-09-08T09:00:00.000Z", // Tue 10:00 local
  end: "2026-09-08T10:00:00.000Z",
  allDay: false,
  staffId: "s1",
  status: "confirmed",
  serviceSnapshot: { name: "Mini valet" },
  attendees: [{ name: "Pat", isLead: true }],
};
const cancelled = { ...coating, id: "b3", status: "cancelled_by_customer" };
const someoneElse = { ...coating, id: "b4", staffId: "s2" };
const tuesday = { start: "2026-09-08T00:00:00.000Z", end: "2026-09-09T00:00:00.000Z" };

describe("allDayHolds", () => {
  it("finds live all-day jobs for the staff member covering the window", () => {
    const holds = allDayHolds([coating, valet, cancelled, someoneElse], tuesday, "s1");
    assert.deepEqual(
      holds.map((b) => b.id),
      ["b1"],
    );
  });

  it("counts anyone's holds when no staff member is chosen", () => {
    const holds = allDayHolds([coating, someoneElse], tuesday, null);
    assert.deepEqual(holds.map((b) => b.id).sort(), ["b1", "b4"]);
  });

  it("ignores days the job does not reach", () => {
    const friday = { start: "2026-09-11T00:00:00.000Z", end: "2026-09-12T00:00:00.000Z" };
    assert.deepEqual(allDayHolds([coating], friday, "s1"), []);
  });
});

describe("timedJobsWithin", () => {
  it("finds live timed jobs inside the window, never all-day ones", () => {
    const jobs = timedJobsWithin(
      [coating, valet, { ...valet, id: "b5", status: "expired" }],
      tuesday,
      "s1",
    );
    assert.deepEqual(
      jobs.map((b) => b.id),
      ["b2"],
    );
  });
});

describe("eventsWithin", () => {
  const dentist = {
    id: "e1",
    start: "2026-09-08T09:15:00.000Z",
    end: "2026-09-08T10:15:00.000Z",
    staffId: "s1",
    status: "active",
    title: "Dentist",
  };
  it("finds active events for the staff member inside the window", () => {
    const found = eventsWithin(
      [
        dentist,
        { ...dentist, id: "e2", status: "cancelled" },
        { ...dentist, id: "e3", staffId: "s2" },
      ],
      tuesday,
      "s1",
    );
    assert.deepEqual(
      found.map((e) => e.id),
      ["e1"],
    );
    assert.deepEqual(eventsWithin([dentist], tuesday, "s2").length, 0);
  });
});

describe("hold wording", () => {
  it("names the service and the lead client", () => {
    assert.equal(describeHold(coating), "5 year coating · Lee Gamble");
    assert.equal(describeHold(coating, "L. Gamble"), "5 year coating · L. Gamble");
    assert.equal(describeHold({ ...coating, attendees: [] }), "5 year coating");
  });

  it("does not mistake the 'Lead' placeholder for a name", () => {
    assert.equal(leadName({ attendees: [{ name: "Lead", isLead: true }] }), null);
    assert.equal(describeHold({ ...coating, attendees: [{ name: "Lead" }] }), "5 year coating");
  });

  it("reads as one line however many holds there are", () => {
    assert.equal(heldAllDayNote([]), "Held all day");
    assert.equal(
      heldAllDayNote(["5 year coating · Lee Gamble"]),
      "Held all day by 5 year coating · Lee Gamble",
    );
    assert.equal(heldAllDayNote(["A", "B", "C"]), "Held all day by A and 2 more");
  });
});

describe("timedClashNote", () => {
  it("describes a single timed job by weekday, length and start", () => {
    assert.equal(timedClashNote([valet], TZ), "Tuesday already has a 1-hour job at 10:00");
    assert.equal(
      timedClashNote([{ ...valet, end: "2026-09-08T10:30:00.000Z" }], TZ),
      "Tuesday already has a 1-hr-30-min job at 10:00",
    );
  });

  it("counts several", () => {
    const later = { ...valet, start: "2026-09-08T13:00:00.000Z", end: "2026-09-08T14:00:00.000Z" };
    assert.equal(
      timedClashNote([valet, later], TZ),
      "Tuesday already has 2 timed jobs, the first at 10:00",
    );
    assert.equal(timedClashNote([], TZ), null);
  });

  it("names an event, and counts jobs and events together", () => {
    const dentist = {
      start: "2026-09-08T09:15:00.000Z",
      end: "2026-09-08T10:15:00.000Z",
      kind: "event" as const,
      title: "Dentist",
    };
    assert.equal(timedClashNote([dentist], TZ), "Tuesday already has an event at 10:15 (Dentist)");
    assert.equal(
      timedClashNote([dentist, { ...dentist, title: null }], TZ),
      "Tuesday already has 2 events, the first at 10:15",
    );
    assert.equal(
      timedClashNote([dentist, { ...valet, kind: "job" as const }], TZ),
      "Tuesday already has a timed job and an event, the first at 10:15",
    );
  });
});

describe("timedOverlapNote", () => {
  it("names the job or event a hand-set time lands on", () => {
    assert.equal(timedOverlapNote([valet], TZ), "Overlaps Mini valet · Pat · 10:00–11:00");
    assert.equal(
      timedOverlapNote(
        [{ start: valet.start, end: valet.end, kind: "event", title: "Dentist" }, valet],
        TZ,
      ),
      "Overlaps Dentist · 10:00–11:00 and 1 more",
    );
    assert.equal(timedOverlapNote([], TZ), null);
  });
});

describe("hardClashCopy", () => {
  const timedClash = {
    bookingId: "b2",
    kind: "booking" as const,
    reference: null,
    allDay: false,
    start: valet.start,
    end: valet.end,
    serviceName: "Mini valet",
    customerName: "Pat",
  };
  const holiday = {
    bookingId: "e9",
    kind: "block" as const,
    reference: null,
    allDay: false,
    start: "2026-09-06T23:00:00.000Z",
    end: "2026-09-12T23:00:00.000Z",
    serviceName: "Holiday",
    customerName: null,
  };

  it("names the clash and only offers someone else when there is someone", () => {
    const solo = hardClashCopy({
      conflicts: [timedClash],
      who: "Taylor",
      newBookingAllDay: false,
      timeZone: TZ,
      alternative: null,
    });
    assert.equal(solo.kind, "timed");
    assert.equal(solo.title, "That time is already taken");
    assert.equal(
      solo.description,
      "Taylor already has Mini valet · Pat · Tue 10:00–11:00. Pick a different time.",
    );
    const team = hardClashCopy({
      conflicts: [timedClash],
      who: "Taylor",
      newBookingAllDay: false,
      timeZone: TZ,
      alternative: "another detailer",
    });
    assert.match(team.description, /Pick a different time, or another detailer\.$/);
  });

  it("copes with a 409 that named nothing", () => {
    const copy = hardClashCopy({
      conflicts: [],
      who: null,
      newBookingAllDay: false,
      timeZone: TZ,
      alternative: null,
    });
    assert.equal(copy.description, "Pick a different time.");
  });

  it("tells an all-day job blocked by a holiday apart from one blocked by another all-day job", () => {
    const blocked = hardClashCopy({
      conflicts: [holiday],
      who: "Taylor",
      newBookingAllDay: true,
      timeZone: TZ,
      alternative: null,
    });
    assert.equal(blocked.kind, "blocked");
    assert.equal(blocked.title, "Taylor is unavailable then");
    assert.match(blocked.description, /^Holiday · .*Pick a different day\.$/);

    const held = hardClashCopy({
      conflicts: [{ ...timedClash, allDay: true, serviceName: "5 year coating" }],
      who: "Taylor",
      newBookingAllDay: true,
      timeZone: TZ,
      alternative: null,
    });
    assert.equal(held.kind, "all-day-job");
    assert.equal(held.title, "Taylor already has an all-day job then");
    assert.match(held.description, /at a set time alongside it instead\?$/);
  });
});

describe("formatDurationLabel", () => {
  it("prefers whole hours and days", () => {
    assert.equal(formatDurationLabel(60), "1-hour");
    assert.equal(formatDurationLabel(120), "2-hour");
    assert.equal(formatDurationLabel(1440), "1-day");
    assert.equal(formatDurationLabel(45), "45-min");
  });
});

describe("describeConflict", () => {
  it("shows all-day clashes as such and timed ones with their window", () => {
    assert.equal(
      describeConflict(
        {
          bookingId: "b1",
          kind: "booking",
          reference: "RC-1",
          allDay: true,
          start: coating.start,
          end: coating.end,
          serviceName: "5 year coating",
          customerName: "Lee Gamble",
        },
        TZ,
      ),
      "5 year coating · Lee Gamble · all day",
    );
    assert.equal(
      describeConflict(
        {
          bookingId: "b2",
          kind: "booking",
          reference: null,
          allDay: false,
          start: valet.start,
          end: valet.end,
          serviceName: "Mini valet",
          customerName: null,
        },
        TZ,
      ),
      "Mini valet · Tue 10:00–11:00",
    );
    assert.equal(
      describeConflict(
        {
          bookingId: "e1",
          kind: "block",
          reference: null,
          allDay: false,
          start: valet.start,
          end: valet.end,
          serviceName: null,
          customerName: null,
        },
        TZ,
      ),
      "Event · Tue 10:00–11:00",
    );
  });
});

describe("overrideCopy", () => {
  it("asks the right question each way round", () => {
    assert.match(overrideCopy(false).title, /drop-in/i);
    assert.match(overrideCopy(true).title, /whole day/i);
  });
});
