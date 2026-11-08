import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countLine,
  durationLabel,
  filterServices,
  mergeDrafts,
  modeChip,
  nextFreeDay,
  optionRowErrors,
  overlappingWindows,
  priceLabel,
  ruleValueLabel,
  serviceNoun,
  summariseWindows,
} from "./services-catalogue.ts";

const base = {
  id: "s1",
  name: "Small group strength",
  description: "Barbell basics",
  category: "Classes",
  durationMinutes: 60,
  basePriceMinor: 1800,
  depositMinor: 0,
  currency: "GBP",
  capacityMax: 1,
  bookingMode: "individual" as const,
  active: true,
  publicVisible: true,
  variants: [] as { name: string; priceMinor?: number | null }[],
};

test("serviceNoun drops 'type' and pluralises", () => {
  assert.deepEqual(serviceNoun("Session type"), {
    noun: "Session",
    lower: "session",
    plural: "Sessions",
    pluralLower: "sessions",
  });
});

test("durationLabel uses the designed units", () => {
  assert.equal(durationLabel(30), "30 min");
  assert.equal(durationLabel(60), "1 hr");
  assert.equal(durationLabel(90), "1.5 hrs");
  assert.equal(durationLabel(1440), "1 day");
  assert.equal(durationLabel(2880), "2 days");
});

test("modeChip names how it's booked", () => {
  assert.equal(modeChip(base, false).label, "1-to-1");
  assert.equal(modeChip(base, true).label, "1 vehicle");
  assert.equal(
    modeChip({ ...base, bookingMode: "lead_pays_party", capacityMax: 2 }, false).label,
    "Bring 1 friend",
  );
  assert.equal(
    modeChip({ ...base, bookingMode: "group", capacityMax: 6 }, false).label,
    "Class of 6",
  );
});

test("priceLabel shows Free, from and the line under", () => {
  assert.deepEqual(priceLabel({ ...base, basePriceMinor: 0 }), { main: "Free", sub: null });
  assert.equal(
    priceLabel({ ...base, variants: [{ name: "90", priceMinor: 2500 }] }).main,
    "from £18",
  );
  assert.equal(priceLabel({ ...base, bookingMode: "group", capacityMax: 6 }).sub, "per person");
  assert.equal(priceLabel({ ...base, depositMinor: 1000 }).sub, "£10 deposit");
});

test("filterServices matches text, category and status", () => {
  const list = [
    base,
    { ...base, id: "s2", name: "Assessment", description: null, category: null, active: false },
    { ...base, id: "s3", name: "Nutrition", description: null, publicVisible: false },
  ];
  assert.deepEqual(
    filterServices(list, { q: "barbell" }).map((s) => s.id),
    ["s1"],
  );
  assert.deepEqual(
    filterServices(list, { category: "__none" }).map((s) => s.id),
    ["s2"],
  );
  assert.deepEqual(
    filterServices(list, { status: "paused" }).map((s) => s.id),
    ["s2"],
  );
  assert.deepEqual(
    filterServices(list, { status: "links" }).map((s) => s.id),
    ["s3"],
  );
});

test("countLine summarises the catalogue", () => {
  assert.equal(
    countLine([base, { ...base, id: "x", category: "PT", active: false }], "session", "sessions"),
    "2 sessions in 2 categories · 1 paused",
  );
});

test("optionRowErrors flags unnamed and duplicate options", () => {
  assert.deepEqual(
    optionRowErrors([
      { name: "", durationValue: "", priceMinor: "" },
      { name: "", durationValue: "90", priceMinor: "" },
      { name: "Large", durationValue: "", priceMinor: "" },
      { name: "large ", durationValue: "", priceMinor: "" },
    ]),
    [null, "Give this option a name.", null, "Each option needs its own name."],
  );
});

test("overlappingWindows finds clashes on the same day", () => {
  const bad = overlappingWindows([
    { dayOfWeek: 1, startMinute: 360, endMinute: 600 },
    { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
    { dayOfWeek: 2, startMinute: 360, endMinute: 600 },
  ]);
  assert.deepEqual([...bad].sort(), [0, 1]);
});

test("summariseWindows joins days with the same times", () => {
  const weekday = (d: number) => [
    { dayOfWeek: d, startMinute: 360, endMinute: 540 },
    { dayOfWeek: d, startMinute: 1020, endMinute: 1200 },
  ];
  assert.deepEqual(
    summariseWindows([
      ...[1, 2, 3, 4, 5].flatMap(weekday),
      { dayOfWeek: 6, startMinute: 480, endMinute: 720 },
    ]),
    ["Mon to Fri · 06:00 to 09:00, 17:00 to 20:00", "Sat · 08:00 to 12:00"],
  );
});

test("nextFreeDay skips days that already have hours", () => {
  assert.equal(nextFreeDay([{ dayOfWeek: 1 }, { dayOfWeek: 2 }]), 3);
});

test("ruleValueLabel covers values outside the presets", () => {
  assert.equal(ruleValueLabel("notice", 120), "2 hours");
  assert.equal(ruleValueLabel("horizon", 90), "90 days");
  assert.equal(ruleValueLabel("buffer", 7), "7 min");
});

test("mergeDrafts takes their changes and reports clashes", () => {
  const result = mergeDrafts(
    { price: "50", name: "PT", deposit: "" },
    { price: "50", name: "PT 1-to-1", deposit: "10" },
    { price: "55", name: "PT one", deposit: "" },
  );
  assert.deepEqual(result.merged, { price: "55", name: "PT 1-to-1", deposit: "10" });
  assert.deepEqual(result.taken, ["price"]);
  assert.deepEqual(result.conflicts, ["name"]);
});
