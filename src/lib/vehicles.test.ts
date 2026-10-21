import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  autoLabel,
  defaultDistanceUnit,
  detailFields,
  dueByRecord,
  duplicateGroups,
  formatPlateInput,
  formatRegistration,
  inVehiclesView,
  isAutoLabel,
  makesOnFile,
  matchesVehicleSearch,
  normaliseRegistration,
  sortVehicles,
  toKm,
  toMiles,
  vehicleJobStatus,
  vehicleJobs,
  vehiclePill,
  vehiclePillLabel,
  vehiclesSummary,
  vehiclesViewCounts,
  vehicleStatsById,
  vehicleSubline,
  vehicleTitle,
  yearError,
  EMPTY_VEHICLE_STATS,
  type VehicleField,
  type VehicleStats,
} from "./vehicles.ts";

const TZ = "Europe/London";
const NOW = new Date("2026-10-20T12:00:00Z");
const NOW_MS = NOW.getTime();

const FIELDS: VehicleField[] = [
  { fieldKey: "registration", label: "Registration", dataType: "short_text" },
  { fieldKey: "make", label: "Make", dataType: "short_text" },
  { fieldKey: "model", label: "Model", dataType: "short_text" },
  { fieldKey: "year", label: "Year", dataType: "integer" },
  { fieldKey: "mileage", label: "Mileage", dataType: "integer" },
  { fieldKey: "colour", label: "Colour", dataType: "short_text" },
  {
    fieldKey: "fuel_type",
    label: "Fuel type",
    dataType: "single_select",
    constraints: {
      options: [
        { value: "petrol", label: "Petrol" },
        { value: "diesel", label: "Diesel" },
      ],
    },
  },
  { fieldKey: "condition_notes", label: "Condition notes", dataType: "long_text" },
  { fieldKey: "photos", label: "Photos", dataType: "image" },
  { fieldKey: "trim", label: "Trim", dataType: "short_text" },
];

const PET_FIELDS: VehicleField[] = [
  { fieldKey: "name", label: "Name", dataType: "short_text" },
  { fieldKey: "breed", label: "Breed", dataType: "short_text" },
];

const BMW = {
  registration: "ya18aek",
  make: "BMW",
  model: "M340i",
  year: 2018,
  colour: "Blue",
  fuel_type: "petrol",
  mileage: 42000,
};

describe("number plates", () => {
  it("normalises for matching", () => {
    assert.equal(normaliseRegistration(" ya18 aek "), "YA18AEK");
    assert.equal(normaliseRegistration(null), "");
  });
  it("adds the standard space to current UK plates and leaves others as typed", () => {
    assert.equal(formatRegistration("ya18aek"), "YA18 AEK");
    assert.equal(formatRegistration("YA18 AEK"), "YA18 AEK");
    assert.equal(formatRegistration("a1  rch"), "A1 RCH");
    assert.equal(formatRegistration("B-123-XY"), "B-123-XY");
  });
  it("spaces the plate input once a current plate passes four characters", () => {
    assert.equal(formatPlateInput("ya18"), "YA18");
    assert.equal(formatPlateInput("ya18a"), "YA18 A");
    assert.equal(formatPlateInput("ya18aek"), "YA18 AEK");
    assert.equal(formatPlateInput("a1 rch"), "A1 RCH");
  });
});

describe("labels", () => {
  it("builds the auto label from make, model and plate", () => {
    assert.equal(autoLabel(BMW, FIELDS, "Vehicle"), "BMW M340i · YA18 AEK");
    assert.equal(autoLabel({ registration: "ya18aek" }, FIELDS, "Vehicle"), "YA18 AEK");
    assert.equal(autoLabel({}, FIELDS, "Vehicle"), "Vehicle");
    assert.equal(autoLabel({ name: "Rex", breed: "Collie" }, PET_FIELDS, "Pet"), "Rex Collie");
  });
  it("treats generated and legacy labels as auto, and anything else as renamed", () => {
    assert.ok(isAutoLabel("BMW M340i · YA18 AEK", BMW, FIELDS, "Vehicle"));
    assert.ok(isAutoLabel("", BMW, FIELDS, "Vehicle"));
    assert.ok(isAutoLabel("ya18aek — BMW", BMW, FIELDS, "Vehicle"));
    assert.ok(!isAutoLabel("Dad's car", BMW, FIELDS, "Vehicle"));
  });
  it("titles a vehicle by make and model, falling back to the label without the plate", () => {
    assert.equal(vehicleTitle({ displayLabel: "x", values: BMW }, FIELDS), "BMW M340i");
    assert.equal(
      vehicleTitle({ displayLabel: "Van · YA18 AEK", values: { registration: "YA18AEK" } }, FIELDS),
      "Van",
    );
    assert.equal(vehicleTitle({ displayLabel: "Rex", values: {} }, PET_FIELDS), "Rex");
  });
  it("writes the year, colour and fuel line, with mileage on request", () => {
    assert.equal(vehicleSubline(BMW, FIELDS), "2018 · Blue · Petrol");
    assert.equal(
      vehicleSubline(BMW, FIELDS, { mileage: true }),
      "2018 · Blue · Petrol · 42,000 miles",
    );
    assert.equal(vehicleSubline({}, FIELDS), "");
  });
  it("orders the details section and drops plate, condition and uploads", () => {
    assert.deepEqual(
      detailFields(FIELDS).map((f) => f.fieldKey),
      ["make", "model", "year", "colour", "fuel_type", "mileage", "trim"],
    );
  });
});

describe("form helpers", () => {
  it("validates the year", () => {
    assert.equal(yearError("", NOW), null);
    assert.equal(yearError("2018", NOW), null);
    assert.equal(yearError("2027", NOW), null);
    assert.equal(yearError("2028", NOW), "Enter a year like 2018.");
    assert.equal(yearError("18", NOW), "Enter a year like 2018.");
    assert.equal(yearError("1899", NOW), "Enter a year like 2018.");
  });
  it("converts distances and picks a default unit", () => {
    assert.equal(toMiles(160934), 100000);
    assert.equal(toKm(100), 161);
    assert.equal(defaultDistanceUnit("GB"), "miles");
    assert.equal(defaultDistanceUnit("IE"), "km");
    assert.equal(defaultDistanceUnit(null), "miles");
  });
});

const booking = (over: Record<string, unknown>) =>
  ({
    id: Math.random().toString(36),
    linkedRecordId: "v1",
    start: "2026-09-01T09:00:00Z",
    allDay: false,
    status: "completed",
    attendanceStatus: null,
    paidMinor: 8500,
    serviceSnapshot: { name: "Full valet" },
    ...over,
  }) as never;

describe("stats", () => {
  const bookings = [
    booking({ start: "2026-08-01T09:00:00Z", serviceSnapshot: { name: "Wash" }, paidMinor: 4000 }),
    booking({ start: "2026-09-01T09:00:00Z" }),
    booking({ start: "2026-09-15T09:00:00Z", status: "cancelled_by_customer", paidMinor: 1000 }),
    booking({ start: "2026-10-25T09:00:00Z", status: "confirmed", paidMinor: 0 }),
    booking({ start: "2026-11-25T09:00:00Z", status: "confirmed", paidMinor: 0 }),
    booking({ linkedRecordId: null }),
  ];
  const stats = vehicleStatsById(bookings, NOW_MS).get("v1")!;
  it("counts completed jobs, the last one, the next booking and money taken", () => {
    assert.equal(stats.jobs, 2);
    assert.equal(stats.lastJob?.at, "2026-09-01T09:00:00Z");
    assert.equal(stats.lastJob?.service, "Full valet");
    assert.equal(stats.nextBooking?.at, "2026-10-25T09:00:00Z");
    assert.equal(stats.spentMinor, 12500);
  });
  it("labels and orders a vehicle's jobs", () => {
    const jobs = vehicleJobs(bookings, "v1", NOW_MS);
    assert.deepEqual(
      jobs.map((b) => (b as { start: string }).start),
      [
        "2026-10-25T09:00:00Z",
        "2026-11-25T09:00:00Z",
        "2026-09-15T09:00:00Z",
        "2026-09-01T09:00:00Z",
        "2026-08-01T09:00:00Z",
      ],
    );
    assert.equal(vehicleJobStatus(jobs[0] as never, NOW_MS), "booked");
    assert.equal(vehicleJobStatus(jobs[2] as never, NOW_MS), "cancelled");
    assert.equal(vehicleJobStatus(jobs[3] as never, NOW_MS), "done");
    assert.equal(
      vehicleJobStatus({ status: "no_show", attendanceStatus: null, start: "" } as never, NOW_MS),
      "no_show",
    );
  });
  it("keeps the earliest open follow-up per vehicle", () => {
    const due = dueByRecord([
      { id: "a", linkedRecordId: "v1", status: "scheduled", dueAt: "2026-12-01" },
      { id: "b", linkedRecordId: "v1", status: "sent", dueAt: "2026-11-01" },
      { id: "c", linkedRecordId: "v1", status: "dismissed", dueAt: "2026-10-01" },
      { id: "d", linkedRecordId: null, status: "scheduled", dueAt: "2026-10-01" },
    ] as never);
    assert.equal(due.get("v1")?.id, "b");
    assert.equal(due.size, 1);
  });
});

const row = (over: {
  id?: string;
  status?: string;
  createdAt?: string;
  stats?: Partial<VehicleStats>;
  due?: string | null;
}) => ({
  record: {
    id: over.id ?? "v",
    status: over.status ?? "active",
    createdAt: over.createdAt ?? "2025-01-01T00:00:00Z",
  },
  stats: { ...EMPTY_VEHICLE_STATS, ...over.stats },
  due: over.due
    ? {
        id: "f",
        dueAt: over.due,
        lastDoneAt: null,
        serviceId: "s",
        serviceName: "Coat",
        label: null,
      }
    : null,
});

describe("tabs and pills", () => {
  const stale = row({
    stats: { lastJob: { at: "2026-03-01T09:00:00Z", allDay: false, service: "x" } },
  });
  const recent = row({
    stats: { lastJob: { at: "2026-10-01T09:00:00Z", allDay: false, service: "x" } },
  });
  const due = row({ due: "2026-11-05T00:00:00Z" });
  const farDue = row({ due: "2027-03-01T00:00:00Z" });
  const archived = row({ status: "archived", due: "2026-10-25T00:00:00Z" });

  it("puts vehicles in the right tabs", () => {
    assert.ok(inVehiclesView("stale", stale as never, NOW, TZ));
    assert.ok(!inVehiclesView("stale", recent as never, NOW, TZ));
    assert.ok(!inVehiclesView("stale", row({}) as never, NOW, TZ));
    assert.ok(inVehiclesView("due", due as never, NOW, TZ));
    assert.ok(!inVehiclesView("due", farDue as never, NOW, TZ));
    assert.ok(!inVehiclesView("all", archived as never, NOW, TZ));
    assert.ok(!inVehiclesView("due", archived as never, NOW, TZ));
    assert.deepEqual(vehiclesViewCounts([stale, recent, due, farDue, archived] as never, NOW, TZ), {
      all: 4,
      due: 1,
      stale: 1,
      archived: 1,
    });
  });

  it("shows one pill in priority order", () => {
    assert.equal(vehiclePill({ ...archived, duplicateOwners: 2 } as never, NOW), "archived");
    assert.equal(vehiclePill({ ...due, duplicateOwners: 2 } as never, NOW), "owners");
    assert.equal(vehiclePill({ ...due, duplicateOwners: 1 } as never, NOW), "due");
    assert.equal(
      vehiclePill(
        { ...row({ createdAt: "2026-10-10T00:00:00Z" }), duplicateOwners: 1 } as never,
        NOW,
      ),
      "new",
    );
    assert.equal(vehiclePill({ ...recent, duplicateOwners: 1 } as never, NOW), null);
    assert.equal(
      vehiclePillLabel("due", { due: due.due as never, duplicateOwners: 1, timeZone: TZ }),
      "Due 5 Nov",
    );
    assert.equal(
      vehiclePillLabel("owners", { due: null, duplicateOwners: 2, timeZone: TZ }),
      "2 owners",
    );
  });

  it("summarises vehicles, owners and what's due this month", () => {
    const noun = { singular: "Vehicle", plural: "Vehicles" };
    const rows = [
      { ...due, ownerId: "a" },
      { ...farDue, ownerId: "a" },
      { ...stale, ownerId: "b" },
      { ...archived, ownerId: "c" },
    ];
    assert.equal(vehiclesSummary(rows as never, NOW, TZ, noun), "3 vehicles across 2 clients");
    const thisMonth = [{ ...row({ due: "2026-10-28T00:00:00Z" }), ownerId: "a" }];
    assert.equal(
      vehiclesSummary(thisMonth as never, NOW, TZ, noun),
      "1 vehicle across 1 client · 1 due back this month",
    );
  });
});

describe("duplicates", () => {
  const rec = (id: string, reg: string, customerId: string, status = "active") => ({
    record: { id, status, customerId, values: { registration: reg } },
  });
  it("groups registrations on more than one active record", () => {
    const groups = duplicateGroups(
      [
        rec("1", "YA18 AEK", "a"),
        rec("2", "ya18aek", "b"),
        rec("3", "YA18AEK", "b", "archived"),
        rec("4", "GX70 HLM", "c"),
        rec("5", "", "d"),
        rec("6", "", "e"),
      ],
      FIELDS,
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.registration, "YA18AEK");
    assert.equal(groups[0]!.owners, 2);
    assert.equal(groups[0]!.key, "YA18AEK:1,2");
  });
  it("finds nothing without a registration field", () => {
    assert.deepEqual(duplicateGroups([rec("1", "x", "a"), rec("2", "x", "b")], PET_FIELDS), []);
  });
});

describe("search, filters and sort", () => {
  const a = {
    record: { displayLabel: "BMW M340i · YA18 AEK", createdAt: "2026-01-01", values: BMW },
    ownerName: "Oliver Grant",
    stats: {
      ...EMPTY_VEHICLE_STATS,
      jobs: 3,
      lastJob: { at: "2026-09-01", allDay: false, service: "" },
    },
  };
  const b = {
    record: {
      displayLabel: "Audi RS3 · GX70 HLM",
      createdAt: "2026-05-01",
      values: { registration: "GX70HLM", make: "audi", model: "RS3" },
    },
    ownerName: "Amy Zed",
    stats: {
      ...EMPTY_VEHICLE_STATS,
      jobs: 5,
      nextBooking: { at: "2026-11-01", allDay: false, service: "" },
    },
  };
  it("matches registration ignoring spaces, and make, model or owner", () => {
    assert.ok(matchesVehicleSearch(a, "ya18aek", FIELDS));
    assert.ok(matchesVehicleSearch(a, "18 ae", FIELDS));
    assert.ok(matchesVehicleSearch(a, "m340", FIELDS));
    assert.ok(matchesVehicleSearch(a, "oliver", FIELDS));
    assert.ok(!matchesVehicleSearch(a, "audi", FIELDS));
  });
  it("lists makes once each", () => {
    assert.deepEqual(
      makesOnFile([{ values: BMW }, { values: { make: "bmw" } }, { values: { make: "Audi" } }]),
      ["Audi", "BMW"],
    );
  });
  it("sorts by each option", () => {
    const ids = (rows: { ownerName: string }[]) => rows.map((r) => r.ownerName);
    assert.deepEqual(ids(sortVehicles([b, a], "last-job", FIELDS)), ["Oliver Grant", "Amy Zed"]);
    assert.deepEqual(ids(sortVehicles([a, b], "next-booking", FIELDS)), [
      "Amy Zed",
      "Oliver Grant",
    ]);
    assert.deepEqual(ids(sortVehicles([a, b], "reg", FIELDS)), ["Amy Zed", "Oliver Grant"]);
    assert.deepEqual(ids(sortVehicles([a, b], "owner", FIELDS)), ["Amy Zed", "Oliver Grant"]);
    assert.deepEqual(ids(sortVehicles([a, b], "jobs", FIELDS)), ["Amy Zed", "Oliver Grant"]);
    assert.deepEqual(ids(sortVehicles([a, b], "newest", FIELDS)), ["Amy Zed", "Oliver Grant"]);
  });
});
