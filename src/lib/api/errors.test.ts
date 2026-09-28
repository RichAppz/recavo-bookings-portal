import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeFieldErrors, parseProblemDetails } from "./errors.ts";

describe("describeFieldErrors", () => {
  it("uses the API's own sentence when it sent one", () => {
    assert.equal(
      describeFieldErrors([
        {
          field: "amountMinor",
          code: "INVALID",
          message: "amountMinor must be a positive integer",
        },
      ]),
      "amountMinor must be a positive integer",
    );
  });

  it("names the field and the reason in words an owner would use", () => {
    // What a 400 on the edit-booking form actually carries: a field and a code, no
    // sentence. The toast used to show none of this.
    assert.equal(
      describeFieldErrors([{ field: "linkedRecordId", code: "REQUIRED" }]),
      "Vehicle or record is missing",
    );
    assert.equal(
      describeFieldErrors([{ field: "additionalServices", code: "DUPLICATE" }]),
      "Extra services has the same thing twice",
    );
    assert.equal(
      describeFieldErrors([{ field: "serviceId", code: "CURRENCY_MISMATCH" }]),
      "Service is in a different currency",
    );
    assert.equal(
      describeFieldErrors([{ field: "Idempotency-Key", code: "REQUIRED" }]),
      "Request key is missing",
    );
  });

  it("joins several reasons and does not repeat one that failed twice", () => {
    assert.equal(
      describeFieldErrors([
        { field: "serviceId", code: "REQUIRED" },
        { field: "staffId", code: "REQUIRED" },
      ]),
      "Service is missing. Staff member is missing",
    );
    assert.equal(
      describeFieldErrors([
        { field: "start", code: "USE_RESCHEDULE" },
        { field: "end", code: "USE_RESCHEDULE" },
      ]),
      "start must be changed with Reschedule. end must be changed with Reschedule",
    );
  });

  it("falls back to the raw pair for a field or code it has never seen", () => {
    // A deployed portal is older than the API it talks to, so an unknown code must still
    // say something rather than go blank.
    assert.equal(
      describeFieldErrors([{ field: "seatCount", code: "OVER_CAPACITY" }]),
      "seatCount: OVER_CAPACITY",
    );
    assert.equal(describeFieldErrors([{ field: "priceMinor", code: "" }]), "Price: invalid");
  });

  it("is empty when there is nothing to say", () => {
    assert.equal(describeFieldErrors([]), "");
  });
});

describe("parseProblemDetails", () => {
  it("keeps the field errors a validation failure carries", () => {
    const err = parseProblemDetails(
      {
        title: "The request was invalid",
        status: 400,
        code: "VALIDATION_FAILED",
        requestId: "01a0e8f2-c6a5-704b-ad3f-f204cb0de148",
        errors: [{ field: "linkedRecordId", code: "REQUIRED" }],
      },
      400,
    );
    assert.equal(err.code, "VALIDATION_FAILED");
    assert.equal(err.detail, undefined);
    assert.equal(err.fieldErrors.length, 1);
    // The combination the toast now shows: no `detail`, but a reason all the same.
    assert.equal(describeFieldErrors(err.fieldErrors), "Vehicle or record is missing");
    assert.equal(err.requestId, "01a0e8f2-c6a5-704b-ad3f-f204cb0de148");
  });
});
