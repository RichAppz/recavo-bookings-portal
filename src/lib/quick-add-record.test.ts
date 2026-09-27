import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQuickAddRecord,
  hasQuickAddInput,
  quickAddFields,
  type LinkedRecordField,
} from "./quick-add-record.ts";

const field = (
  fieldKey: string,
  overrides: Partial<LinkedRecordField> = {},
): LinkedRecordField => ({
  fieldKey,
  label: fieldKey[0]!.toUpperCase() + fieldKey.slice(1),
  dataType: "short_text",
  required: false,
  ...overrides,
});

// The vehicle template after registration went optional: nothing required.
const vehicle = [
  field("registration"),
  field("make"),
  field("model"),
  field("colour"),
  field("notes", { dataType: "long_text" }),
  field("photos", { dataType: "image" }),
];

describe("quickAddFields", () => {
  it("asks for required fields first, then the first short-text fields, three at most", () => {
    assert.deepEqual(
      quickAddFields(vehicle).map((f) => f.fieldKey),
      ["registration", "make", "model"],
    );
    const withRequired = [field("make"), field("model", { required: true }), field("colour")];
    assert.deepEqual(
      quickAddFields(withRequired).map((f) => f.fieldKey),
      ["model", "make", "colour"],
    );
  });

  it("never offers fields the row can't edit", () => {
    const keys = quickAddFields([field("photos", { dataType: "image" }), field("make")]).map(
      (f) => f.fieldKey,
    );
    assert.deepEqual(keys, ["make"]);
  });
});

describe("hasQuickAddInput", () => {
  it("is false for an untouched or whitespace-only row", () => {
    assert.equal(hasQuickAddInput({}), false);
    assert.equal(hasQuickAddInput({ registration: "", make: "   " }), false);
    assert.equal(hasQuickAddInput({ make: undefined }), false);
  });

  it("is true as soon as anything is typed", () => {
    assert.equal(hasQuickAddInput({ registration: "", make: "Ford" }), true);
  });
});

describe("buildQuickAddRecord", () => {
  const quick = quickAddFields(vehicle);

  it("makes a record from whatever was typed, labelled description first then plate", () => {
    const built = buildQuickAddRecord(
      quick,
      { registration: " AB12 CDE ", make: "Ford", model: "Focus" },
      "Vehicle",
    );
    assert.deepEqual(built, {
      kind: "ok",
      displayLabel: "Ford Focus · AB12 CDE",
      values: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
    });
  });

  it("copes with a partial row — a car booked in by phone often has no plate yet", () => {
    const built = buildQuickAddRecord(quick, { make: "Ford", model: "Focus" }, "Vehicle");
    assert.deepEqual(built, {
      kind: "ok",
      displayLabel: "Ford Focus",
      values: { make: "Ford", model: "Focus" },
    });
  });

  it("falls back to the term when only the identifier is known", () => {
    const built = buildQuickAddRecord(quick, { registration: "AB12 CDE" }, "Vehicle");
    assert.equal(built.kind, "ok");
    if (built.kind === "ok") assert.equal(built.displayLabel, "AB12 CDE");
  });

  it("refuses an empty record", () => {
    assert.deepEqual(buildQuickAddRecord(quick, {}, "Vehicle"), { kind: "empty" });
    assert.deepEqual(buildQuickAddRecord(quick, { make: "  " }, "Vehicle"), { kind: "empty" });
  });

  it("reports a missing required field by key", () => {
    const strict = quickAddFields([
      field("registration", { required: true }),
      field("make"),
      field("model"),
    ]);
    assert.deepEqual(buildQuickAddRecord(strict, { make: "Ford" }, "Vehicle"), {
      kind: "invalid",
      errors: { registration: "Required" },
    });
  });

  it("coerces numeric fields and drops blanks", () => {
    const fields = [field("make"), field("year", { dataType: "integer" })];
    const built = buildQuickAddRecord(fields, { make: "Ford", year: "2019" }, "Vehicle");
    assert.deepEqual(built, {
      kind: "ok",
      displayLabel: "2019 · Ford",
      values: { make: "Ford", year: 2019 },
    });
  });
});
