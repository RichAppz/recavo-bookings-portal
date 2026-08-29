import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQueryString } from "./query-string.ts";
import { ApiError, parseProblemDetails, toFormErrors, newIdempotencyKey } from "./errors.ts";

describe("buildQueryString", () => {
  it("omits nullish values", () => {
    assert.equal(buildQueryString({ a: "1", b: null, c: undefined }), "?a=1");
  });

  it("repeats keys for arrays", () => {
    assert.equal(
      buildQueryString({ tagIds: ["a", "b"], status: "active" }),
      "?tagIds=a&tagIds=b&status=active",
    );
  });

  it("returns empty string when no query", () => {
    assert.equal(buildQueryString(), "");
    assert.equal(buildQueryString({}), "");
  });
});

describe("parseProblemDetails", () => {
  it("parses application/problem+json", () => {
    const err = parseProblemDetails(
      {
        type: "https://api.recavo.example/problems/booking-conflict",
        title: "The selected time is no longer available",
        status: 409,
        code: "BOOKING_CONFLICT",
        detail: "Choose another available time.",
        requestId: "req_abc",
        errors: [{ field: "start", code: "INVALID", message: "bad" }],
      },
      409,
      "hdr_req",
    );
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "BOOKING_CONFLICT");
    assert.equal(err.status, 409);
    assert.equal(err.requestId, "req_abc");
    assert.equal(err.fieldErrors.length, 1);
    assert.equal(err.fieldErrors[0]?.field, "start");
  });

  it("falls back to header request id", () => {
    const err = parseProblemDetails({}, 500, "from-header");
    assert.equal(err.requestId, "from-header");
    assert.equal(err.status, 500);
  });
});

describe("ApiError MFA flags", () => {
  it("treats 403 MFA_REQUIRED as a step-up, not a forbidden", () => {
    const err = new ApiError({ status: 403, code: "MFA_REQUIRED", title: "MFA required" });
    assert.equal(err.isMfaRequired, true);
    assert.equal(err.isMfaUnavailable, false);
    assert.equal(err.isForbidden, false);
  });

  it("treats 503 MFA_UNAVAILABLE as transient", () => {
    const err = new ApiError({
      status: 503,
      code: "MFA_UNAVAILABLE",
      title: "MFA unavailable",
    });
    assert.equal(err.isMfaUnavailable, true);
    assert.equal(err.isMfaRequired, false);
  });
});

describe("toFormErrors", () => {
  it("maps field errors for react-hook-form", () => {
    const err = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      title: "Invalid",
      fieldErrors: [
        { field: "email", code: "INVALID", message: "bad email" },
        { field: "phone", code: "REQUIRED" },
      ],
    });
    const form = toFormErrors(err);
    assert.equal(form.email?.message, "bad email");
    assert.equal(form.phone?.type, "REQUIRED");
  });
});

describe("newIdempotencyKey", () => {
  it("returns a uuid-shaped string", () => {
    const key = newIdempotencyKey();
    assert.match(key, /^[0-9a-f-]{36}$/i);
  });
});
