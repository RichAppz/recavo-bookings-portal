import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalToken,
  describeSmsSize,
  SMS_WARN_LENGTH,
  smsSegments,
  unknownPlaceholders,
  type TemplatePlaceholder,
} from "./message-templates.ts";

const PLACEHOLDERS: TemplatePlaceholder[] = [
  { token: "{{first_name}}", aliases: ["{{customer}}"], description: "", sample: "Sam" },
  { token: "{{staff}}", aliases: ["{{trainer}}", "{{detailer}}"], description: "", sample: "Alex" },
  { token: "{{service}}", aliases: [], description: "", sample: "Full valet" },
  { token: "{{vehicle}}", aliases: ["{{linked_record}}"], description: "", sample: "AB12 CDE" },
  { token: "{{link}}", aliases: [], description: "", sample: "https://example.test/x" },
];

describe("canonicalToken", () => {
  it("ignores braces, case and underscores", () => {
    assert.equal(canonicalToken("{{First_Name}}"), "firstname");
    assert.equal(canonicalToken("firstName"), "firstname");
    assert.equal(canonicalToken("{{ staff }}"), "staff");
  });
});

describe("unknownPlaceholders", () => {
  it("lists the tokens the message will not fill, once each", () => {
    assert.deepEqual(
      unknownPlaceholders("{{first_name}} {{gym}} {{trainer}} {{gym}} {{Workout}}", PLACEHOLDERS),
      ["{{gym}}", "{{Workout}}"],
    );
  });

  it("is empty when everything is recognised, optional clauses included", () => {
    assert.deepEqual(unknownPlaceholders("Hi {{customer}}", PLACEHOLDERS), []);
    assert.deepEqual(
      unknownPlaceholders("{{service}}[[ for {{vehicle}}]]. Details: {{link}}", PLACEHOLDERS),
      [],
    );
  });
});

describe("text message sizing", () => {
  it("counts GSM-7 segments the way the API and the gateway do", () => {
    assert.equal(smsSegments(0), 1);
    assert.equal(smsSegments(160), 1);
    assert.equal(smsSegments(161), 2);
    assert.equal(smsSegments(306), 2);
    assert.equal(smsSegments(307), 3);
  });

  it("describes the size in plain words", () => {
    assert.equal(describeSmsSize(120), "120 characters · 1 segment");
    assert.equal(describeSmsSize(200), "200 characters · 2 segments");
  });

  it("warns just under the API's two-segment cap", () => {
    assert.equal(SMS_WARN_LENGTH, 300);
    assert.equal(smsSegments(SMS_WARN_LENGTH), 2);
  });
});
