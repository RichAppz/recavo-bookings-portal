import assert from "node:assert/strict";
import { test } from "node:test";

import { mileageLabel, summariseLinkedRecord, summaryFieldsOf } from "./linked-record-summary.ts";

const vehicleFields = summaryFieldsOf([
  { fieldKey: "registration", dataType: "short_text", displayOrder: 0, status: "active" },
  { fieldKey: "make", dataType: "short_text", displayOrder: 1, status: "active" },
  { fieldKey: "model", dataType: "short_text", displayOrder: 2, status: "active" },
  { fieldKey: "year", dataType: "integer", displayOrder: 3, status: "active" },
  { fieldKey: "mileage", dataType: "integer", displayOrder: 4, status: "active" },
  { fieldKey: "condition_notes", dataType: "long_text", displayOrder: 5, status: "active" },
]);

test("reads reg · make · model from the record's values, not its display label", () => {
  assert.equal(
    summariseLinkedRecord(
      {
        displayLabel: "Audi Rs5",
        values: { registration: "EO76 ZWZ", make: "Audi", model: "Rs5", year: 2023 },
      },
      vehicleFields,
    ),
    "EO76 ZWZ · Audi · Rs5",
  );
});

test("skips blank values and stops at three parts", () => {
  assert.equal(
    summariseLinkedRecord(
      {
        displayLabel: "Audi",
        values: { registration: "  ", make: "Audi", model: "Rs5", year: 2023 },
      },
      vehicleFields,
    ),
    "Audi · Rs5 · 2023",
  );
});

test("falls back to the display label when nothing inline is filled in", () => {
  assert.equal(
    summariseLinkedRecord({ displayLabel: "Mercedes eqc", values: {} }, vehicleFields),
    "Mercedes eqc",
  );
  assert.equal(summariseLinkedRecord({ displayLabel: "Van", values: null }, []), "Van");
});

test("honours display order, archived fields, staff visibility and select labels", () => {
  const fields = summaryFieldsOf([
    {
      fieldKey: "fuel",
      dataType: "single_select",
      displayOrder: 1,
      status: "active",
      constraints: { options: [{ value: "ev", label: "Electric" }] },
    },
    {
      fieldKey: "secret",
      dataType: "short_text",
      displayOrder: 0,
      status: "active",
      visibility: { staffVisible: false },
    },
    { fieldKey: "old", dataType: "short_text", displayOrder: 0, status: "archived" },
    { fieldKey: "make", dataType: "short_text", displayOrder: 2, status: "active" },
    { fieldKey: "broken" },
  ]);
  assert.equal(
    summariseLinkedRecord(
      { displayLabel: "x", values: { secret: "hidden", old: "gone", fuel: "ev", make: "Tesla" } },
      fields,
    ),
    "Electric · Tesla",
  );
});

test("never describes a car by its mileage", () => {
  assert.equal(
    summariseLinkedRecord(
      { displayLabel: "Audi", values: { registration: "EO76 ZWZ", make: "Audi", mileage: 45210 } },
      vehicleFields,
    ),
    "EO76 ZWZ · Audi",
  );
});

test("mileageLabel reads as miles and ignores anything that isn't a mileage", () => {
  assert.equal(mileageLabel(45210), "45,210 miles");
  assert.equal(mileageLabel("1200"), "1,200 miles");
  assert.equal(mileageLabel(1), "1 mile");
  assert.equal(mileageLabel(-3), null);
  assert.equal(mileageLabel("lots"), null);
  assert.equal(mileageLabel(null), null);
});
