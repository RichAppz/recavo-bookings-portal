import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalToken,
  fallbackTemplates,
  fillPlaceholders,
  unknownPlaceholders,
  type TemplatePlaceholder,
} from "./message-templates.ts";

const PLACEHOLDERS: TemplatePlaceholder[] = [
  { token: "{{first_name}}", aliases: ["{{customer}}"], description: "", sample: "Sam" },
  { token: "{{staff}}", aliases: ["{{trainer}}", "{{detailer}}"], description: "", sample: "Alex" },
  { token: "{{service}}", aliases: [], description: "", sample: "Full valet" },
  { token: "{{vehicle}}", aliases: ["{{linked_record}}"], description: "", sample: "AB12 CDE" },
];

describe("canonicalToken", () => {
  it("ignores braces, case and underscores", () => {
    assert.equal(canonicalToken("{{First_Name}}"), "firstname");
    assert.equal(canonicalToken("firstName"), "firstname");
    assert.equal(canonicalToken("{{ staff }}"), "staff");
  });
});

describe("fillPlaceholders", () => {
  it("fills tokens and their aliases from the sample values", () => {
    assert.equal(
      fillPlaceholders(
        "Hi {{first_name}}, your {{service}} with {{trainer}} for {{vehicle}}.",
        PLACEHOLDERS,
      ),
      "Hi Sam, your Full valet with Alex for AB12 CDE.",
    );
  });

  it("is forgiving about spelling, like the API", () => {
    assert.equal(
      fillPlaceholders("{{FirstName}} {{FIRST_NAME}} {{Detailer}}", PLACEHOLDERS),
      "Sam Sam Alex",
    );
  });

  it("blanks unknown tokens and smooths the punctuation left behind", () => {
    assert.equal(fillPlaceholders("Hi {{nope}}, see you.", PLACEHOLDERS), "Hi, see you.");
  });
});

describe("unknownPlaceholders", () => {
  it("lists the tokens the message will not fill, once each", () => {
    assert.deepEqual(
      unknownPlaceholders("{{first_name}} {{gym}} {{trainer}} {{gym}} {{Workout}}", PLACEHOLDERS),
      ["{{gym}}", "{{Workout}}"],
    );
  });

  it("is empty when everything is recognised", () => {
    assert.deepEqual(unknownPlaceholders("Hi {{customer}}", PLACEHOLDERS), []);
  });
});

describe("fallbackTemplates", () => {
  it("words labels, defaults and placeholder help from the tenant's terminology", () => {
    const auto = fallbackTemplates({
      staff: "Staff member",
      service: "Service",
      booking: "Job",
      linkedRecord: "Vehicle",
    });
    const confirmation = auto.find((t) => t.key === "booking_confirmation");
    assert.ok(confirmation);
    assert.equal(confirmation.label, "Job confirmation");
    assert.match(confirmation.defaultBodyRegion, /your job with \{\{business\}\}/);
    assert.equal(confirmation.customised, false);
    const staff = confirmation.placeholders.find((p) => p.token === "{{staff}}");
    assert.equal(staff?.description, "Staff member's name");
    assert.deepEqual(staff?.aliases, ["{{staff_member}}", "{{trainer}}"]);
    const vehicle = confirmation.placeholders.find((p) => p.token === "{{vehicle}}");
    assert.equal(vehicle?.sample, "AB12 CDE");
  });

  it("keeps {{trainer}} working for a PT without listing it twice", () => {
    const pt = fallbackTemplates({
      staff: "Trainer",
      service: "Session type",
      booking: "Session",
      linkedRecord: "Record",
    });
    const staff = pt[0]?.placeholders.find((p) => p.token === "{{staff}}");
    assert.equal(staff?.description, "Trainer's name");
    assert.deepEqual(staff?.aliases, ["{{trainer}}"]);
    assert.match(pt[0]?.defaultBodyRegion ?? "", /your session with/);
  });
});
