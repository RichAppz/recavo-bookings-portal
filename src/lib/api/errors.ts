import type { FieldErrors } from "react-hook-form";
import { toast } from "sonner";

export type ProblemFieldError = {
  field: string;
  code: string;
  message?: string;
};

export type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  requestId?: string;
  errors?: ProblemFieldError[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly requestId?: string;
  readonly fieldErrors: ProblemFieldError[];
  readonly type?: string;

  constructor(input: {
    status: number;
    code?: string;
    title?: string;
    detail?: string;
    requestId?: string;
    fieldErrors?: ProblemFieldError[];
    type?: string;
  }) {
    const title = input.title ?? "Something went wrong";
    super(input.detail ? `${title}: ${input.detail}` : title);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code ?? "INTERNAL";
    this.title = title;
    this.detail = input.detail;
    this.requestId = input.requestId;
    this.fieldErrors = input.fieldErrors ?? [];
    this.type = input.type;
  }

  get isMfaRequired() {
    return this.status === 403 && this.code === "MFA_REQUIRED";
  }

  get isUnauthenticated() {
    return this.status === 401 || this.code === "UNAUTHENTICATED";
  }

  get isForbidden() {
    return this.status === 403 && this.code !== "MFA_REQUIRED";
  }

  get isConflict() {
    return this.status === 409;
  }

  /** Subscription access_state blocks the action (RECA-157). Show an upgrade CTA, not a generic error. */
  get isBillingRequired() {
    return this.status === 402;
  }

  /** Plan doesn't include this feature (e.g. `exports.data`). Distinct from a plain permission denial. */
  get isFeatureNotAvailable() {
    return this.status === 403 && this.code === "FEATURE_NOT_AVAILABLE";
  }
}

export function parseProblemDetails(body: unknown, status: number, requestId?: string): ApiError {
  if (body && typeof body === "object") {
    const p = body as ProblemDetails;
    return new ApiError({
      status: typeof p.status === "number" ? p.status : status,
      code: typeof p.code === "string" ? p.code : undefined,
      title: typeof p.title === "string" ? p.title : undefined,
      detail: typeof p.detail === "string" ? p.detail : undefined,
      requestId: (typeof p.requestId === "string" ? p.requestId : undefined) ?? requestId,
      fieldErrors: Array.isArray(p.errors) ? p.errors : [],
      type: typeof p.type === "string" ? p.type : undefined,
    });
  }

  return new ApiError({
    status,
    title: status >= 500 ? "Server error" : "Request failed",
    detail: status >= 500 ? "Please try again shortly." : undefined,
    requestId,
  });
}

/** Map problem+json field errors into react-hook-form setError values. */
export function toFormErrors(error: ApiError): FieldErrors {
  const out: FieldErrors = {};
  for (const fe of error.fieldErrors) {
    if (!fe.field) continue;
    out[fe.field] = {
      type: fe.code || "validate",
      message: fe.message || fe.code || "Invalid",
    };
  }
  return out;
}

export function applyFormErrors(
  error: ApiError,
  setError: (name: string, error: { type: string; message?: string }) => void,
) {
  for (const fe of error.fieldErrors) {
    if (!fe.field) continue;
    setError(fe.field, {
      type: fe.code || "validate",
      message: fe.message || fe.code || "Invalid",
    });
  }
}

export function toastApiError(error: unknown, fallback = "Something went wrong") {
  if (error instanceof ApiError) {
    const description = [error.detail, error.requestId ? `Ref: ${error.requestId}` : null]
      .filter(Boolean)
      .join(" · ");
    toast.error(error.title || fallback, {
      description: description || undefined,
    });
    return;
  }

  toast.error(fallback);
}

/** Generate a client idempotency key (UUID v4). Reuse per user intent; do not regenerate on RQ retry. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-crypto environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
