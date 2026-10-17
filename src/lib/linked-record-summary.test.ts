import assert from "node:assert/strict";
import { test } from "node:test";

import { summariseLinkedRecord, summaryFieldsOf } from "./linked-record-summary.ts";

const vehicleFields = summaryFieldsOf([
  { fieldKey: "registration", dataType: "short_text", displayOrder: 0, status: "active" },
  { fieldKey: "make", dataType: "short_text", displayOrder: 1, status: "active" },
  { fieldKey: "model", dataType: "short_text", displayOrder: 2, status: "active" },
  { fieldKey: "year", dataType: "integer", displayOrder: 3, status: "active" },
  { fieldKey: "condition_notes", dataType: "long_text", displayOrder: 4, status: "active" },
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
