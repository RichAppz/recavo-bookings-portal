import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";
import { ApiError, applyFormErrors, parseProblemDetails, toastApiError } from "./errors.ts";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

beforeEach(() => {
  toastError.mockClear();
});

describe("ApiError classification", () => {
  it("separates an MFA challenge from an ordinary refusal", () => {
    // The client retries one of these after a TOTP prompt and surfaces the
    // other as a permission error, so conflating them either loops or blocks.
    const mfa = new ApiError({ status: 403, code: "MFA_REQUIRED" });
    assert.equal(mfa.isMfaRequired, true);
    assert.equal(mfa.isForbidden, false);

    const forbidden = new ApiError({ status: 403, code: "FORBIDDEN" });
    assert.equal(forbidden.isMfaRequired, false);
    assert.equal(forbidden.isForbidden, true);
  });

  it("does not treat a 401 carrying MFA_REQUIRED as a challenge", () => {
    const expired = new ApiError({ status: 401, code: "MFA_REQUIRED" });
    assert.equal(expired.isMfaRequired, false);
    assert.equal(expired.isUnauthenticated, true);
  });

  it("recognises an expired session by status or code", () => {
    assert.equal(new ApiError({ status: 401 }).isUnauthenticated, true);
    assert.equal(new ApiError({ status: 400, code: "UNAUTHENTICATED" }).isUnauthenticated, true);
  });

  it("flags a conflict, which the booking flow retries differently", () => {
    assert.equal(new ApiError({ status: 409, code: "BOOKING_CONFLICT" }).isConflict, true);
    assert.equal(new ApiError({ status: 422 }).isConflict, false);
  });

  it("builds a message from the title and detail", () => {
    const withDetail = new ApiError({
      status: 409,
      title: "Slot taken",
      detail: "Choose another time.",
    });
    assert.equal(withDetail.message, "Slot taken: Choose another time.");
    assert.equal(new ApiError({ status: 409, title: "Slot taken" }).message, "Slot taken");
  });

  it("falls back to a generic title and code", () => {
    const bare = new ApiError({ status: 500 });
    assert.equal(bare.title, "Something went wrong");
    assert.equal(bare.code, "INTERNAL");
    assert.deepEqual(bare.fieldErrors, []);
  });
});

describe("parseProblemDetails", () => {
  it("prefers the status in the body over the transport status", () => {
    const err = parseProblemDetails({ status: 422, code: "VALIDATION_FAILED" }, 400);
    assert.equal(err.status, 422);
  });

  it("prefers the request id in the body over the header", () => {
    const err = parseProblemDetails({ requestId: "from-body" }, 500, "from-header");
    assert.equal(err.requestId, "from-body");
  });

  it("describes a server error helpfully when the body is not problem+json", () => {
    // Cloudflare and Fly both return plain text on a 502, so this is the shape
    // a real outage produces rather than a hypothetical one.
    const err = parseProblemDetails("Bad gateway", 502);
    assert.equal(err.title, "Server error");
    assert.equal(err.detail, "Please try again shortly.");
  });

  it("stays quiet about the cause of a client error it cannot read", () => {
    const err = parseProblemDetails(undefined, 404);
    assert.equal(err.title, "Request failed");
    assert.equal(err.detail, undefined);
  });

  it("ignores field errors that are not a list", () => {
    const err = parseProblemDetails({ errors: { start: "invalid" } }, 400);
    assert.deepEqual(err.fieldErrors, []);
  });
});

describe("applyFormErrors", () => {
  it("hands each field error to react-hook-form", () => {
    const calls: Array<[string, { type: string; message?: string }]> = [];
    applyFormErrors(
      new ApiError({
        status: 400,
        fieldErrors: [
          { field: "email", code: "INVALID", message: "That email is not valid" },
          { field: "phone", code: "REQUIRED" },
        ],
      }),
      (name, error) => calls.push([name, error]),
    );
    assert.deepEqual(calls, [
      ["email", { type: "INVALID", message: "That email is not valid" }],
      ["phone", { type: "REQUIRED", message: "REQUIRED" }],
    ]);
  });

  it("skips an error with no field to attach to", () => {
    // A form-level problem has no input to highlight; setError("") would throw.
    const calls: string[] = [];
    applyFormErrors(
      new ApiError({ status: 400, fieldErrors: [{ field: "", code: "INVALID" }] }),
      (name) => calls.push(name),
    );
    assert.deepEqual(calls, []);
  });
});

describe("toastApiError", () => {
  it("shows the title with the detail and request id together", () => {
    // The reference is what support asks for first, so it has to survive into
    // the toast rather than staying in the console.
    toastApiError(
      new ApiError({
        status: 409,
        title: "Slot taken",
        detail: "Choose another time.",
        requestId: "req_abc",
      }),
    );
    assert.deepEqual(toastError.mock.calls[0], [
      "Slot taken",
      { description: "Choose another time. · Ref: req_abc" },
    ]);
  });

  it("omits an empty description rather than showing a blank line", () => {
    toastApiError(new ApiError({ status: 500, title: "Server error" }));
    assert.deepEqual(toastError.mock.calls[0], ["Server error", { description: undefined }]);
  });

  it("uses the caller's fallback for anything that is not an ApiError", () => {
    toastApiError(new TypeError("fetch failed"), "Could not save");
    assert.deepEqual(toastError.mock.calls[0], ["Could not save"]);
  });
});
