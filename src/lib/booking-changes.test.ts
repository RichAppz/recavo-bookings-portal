import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeBookingChange, summariseBookingChanges } from "./booking-changes.ts";

const terms = { staff: "Detailer", linkedRecord: "Vehicle" };

describe("describeBookingChange", () => {
  it("reads a service swap and its re-price in plain English", () => {
    assert.equal(
      describeBookingChange({ field: "services", from: ["Level 1"], to: ["Level 2"] }, terms),
      "Service: Level 1 → Level 2",
    );
    assert.equal(
      describeBookingChange(
        { field: "services", from: ["Level 1"], to: ["Level 2", "Wax · Ceramic"] },
        terms,
      ),
      "Services: Level 1 → Level 2 + Wax · Ceramic",
    );
    assert.equal(
      describeBookingChange({ field: "price", from: 35000, to: 75000, currency: "GBP" }, terms),
      "Price: £350.00 → £750.00",
    );
  });

  it("uses the vertical's nouns for people and records", () => {
    assert.equal(
      describeBookingChange(
        { field: "staff", from: { id: "a", label: "Sam" }, to: { id: "b", label: "Jo" } },
        terms,
      ),
      "Detailer: Sam → Jo",
    );
    assert.equal(
      describeBookingChange(
        { field: "linkedRecord", from: null, to: { id: "v", label: "AB12 CDE" } },
        terms,
      ),
      "Vehicle added: AB12 CDE",
    );
    assert.equal(
      describeBookingChange(
        { field: "linkedRecord", from: { id: "v", label: "AB12 CDE" }, to: null },
        terms,
      ),
      "Vehicle removed: AB12 CDE",
    );
  });

  it("does not leak internal note text into the history line", () => {
    assert.equal(
      describeBookingChange({ field: "notesInternal", from: null, to: "Gate code 1234" }, terms),
      "Internal note added",
    );
    assert.equal(
      describeBookingChange({ field: "notesInternal", from: "a", to: "b" }, terms),
      "Internal note updated",
    );
  });

  it("labels payment methods and durations", () => {
    assert.equal(
      describeBookingChange({ field: "paymentMethod", from: "none", to: "pay_later" }, terms),
      "Payment: pay up front → pay after the job",
    );
    assert.equal(
      describeBookingChange(
        { field: "duration", from: 60, to: 120, end: "2026-01-01T12:00:00Z" },
        terms,
      ),
      "Duration: 1 hour → 2 hours",
    );
  });

  it("reads a quiet date correction in the booking's time zone", () => {
    assert.equal(
      describeBookingChange(
        {
          field: "when",
          from: "2026-09-29T08:00:00Z",
          to: "2026-09-30T09:30:00Z",
          end: "2026-09-30T11:30:00Z",
          allDay: false,
        },
        terms,
        "Europe/London",
      ),
      "When: Tue 29 Sept, 09:00 → Wed 30 Sept, 10:30",
    );
    assert.equal(
      describeBookingChange(
        {
          field: "when",
          from: "2026-09-28T23:00:00Z",
          to: "2026-09-27T23:00:00Z",
          end: "2026-09-30T23:00:00Z",
          allDay: true,
        },
        terms,
        "Europe/London",
      ),
      "When: Tue 29 Sept → Mon 28 – Wed 30 Sept 2026",
    );
  });

  it("still says something for a field it has never seen", () => {
    assert.equal(
      describeBookingChange({ field: "seatCount", from: 1, to: 2 }, terms),
      "Seat count changed",
    );
  });
});

describe("summariseBookingChanges", () => {
  it("headlines what kind of edit happened", () => {
    assert.equal(
      summariseBookingChanges([{ field: "notesInternal" }], terms),
      "Internal note edited",
    );
    assert.equal(
      summariseBookingChanges(
        [{ field: "services" }, { field: "price" }, { field: "duration" }],
        terms,
      ),
      "Booking edited — services and price",
    );
    assert.equal(
      summariseBookingChanges(
        [{ field: "staff" }, { field: "linkedRecord" }, { field: "notesInternal" }],
        terms,
      ),
      "Booking edited — detailer and vehicle",
    );
  });

  it("reads a consumables change as materials, staff-only", () => {
    assert.equal(
      describeBookingChange(
        {
          field: "consumables",
          from: ["1 bottle Ceramic coat"],
          to: ["1 bottle Ceramic coat", "2 pad Foam pad"],
        },
        terms,
      ),
      "Consumables: 1 bottle Ceramic coat → 1 bottle Ceramic coat + 2 pad Foam pad",
    );
    assert.equal(
      describeBookingChange({ field: "consumables", from: [], to: ["2 pad Foam pad"] }, terms),
      "Consumables: none → 2 pad Foam pad",
    );
    assert.equal(summariseBookingChanges([{ field: "consumables" }], terms), "Consumables updated");
    assert.equal(
      summariseBookingChanges([{ field: "price" }, { field: "consumables" }], terms),
      "Booking edited — price and consumables",
    );
  });

  it("headlines a date correction as a fix, not a reschedule", () => {
    assert.equal(summariseBookingChanges([{ field: "when" }], terms), "Date corrected by staff");
    assert.equal(
      summariseBookingChanges([{ field: "when" }, { field: "staff" }], terms),
      "Date corrected by staff",
    );
  });
});
