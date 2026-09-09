import { ApiError, parseProblemDetails } from "./errors";
import { getAccessToken } from "./token";
import { buildQueryString, type QueryValue } from "./query-string";
import { filenameFromDisposition } from "./content-disposition";

export type { QueryValue };
export { buildQueryString };

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** When provided, sent as Idempotency-Key. */
  idempotencyKey?: string;
  /** When provided, sent as If-Match. */
  ifMatch?: number | string;
  /** Skip Authorization header (public routes). */
  public?: boolean;
  /** Override bearer token for this call. */
  accessToken?: string | null;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Internal: marks the post-refresh replay of a 401 so it can't loop. */
  authRetried?: boolean;
};

export type ApiResult<T> = {
  data: T;
  requestId?: string;
  status: number;
};

let mfaHandler: ((error: ApiError) => Promise<boolean>) | null = null;

/** Register a handler that enrols or challenges TOTP and returns true if the caller should retry. */
export function setMfaHandler(handler: ((error: ApiError) => Promise<boolean>) | null) {
  mfaHandler = handler;
}

let authRetryHandler: ((staleToken: string) => Promise<boolean>) | null = null;

/**
 * Register a handler for expired sessions: given the bearer token a 401 was sent
 * with, refresh the session and return true once a newer token is in place so the
 * request should be replayed. Wired up by the auth store (module-level, like the
 * MFA handler, so this client stays free of React).
 */
export function setAuthRetryHandler(handler: ((staleToken: string) => Promise<boolean>) | null) {
  authRetryHandler = handler;
}

export function getApiBaseUrl(): string {
  // In the browser during dev, use a relative base so requests hit the Vite
  // dev proxy (same-origin "/api/*") and avoid the API's missing CORS headers.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return "";
  }
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!raw) {
    // Dev-friendly default; production must set VITE_API_BASE_URL.
    return "http://localhost:3000";
  }
  return raw.replace(/\/$/, "");
}

function resolvePath(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = getApiBaseUrl();
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalised}`;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export type BlobResult = {
  blob: Blob;
  /** From `Content-Disposition: attachment; filename="…"`, when the server sent one. */
  filename: string | null;
  contentType: string | null;
  requestId?: string;
  status: number;
};

export { filenameFromDisposition };

export async function request<T>(options: RequestOptions): Promise<ApiResult<T>> {
  const result = await requestRaw(options, "json");
  return {
    data: result.parsed as T,
    requestId: result.requestId,
    status: result.status,
  };
}

/**
 * Same headers, auth and 401-replay as {@link request}, but the successful body
 * comes back as a Blob — for PDFs and other binaries the JSON path would mangle
 * (it reads the body as text). Errors are still problem+json → {@link ApiError}.
 */
export async function requestBlob(options: RequestOptions): Promise<BlobResult> {
  const result = await requestRaw(options, "blob");
  return {
    blob: result.blob ?? new Blob(),
    filename: filenameFromDisposition(result.headers.get("Content-Disposition")),
    contentType: result.headers.get("Content-Type"),
    requestId: result.requestId,
    status: result.status,
  };
}

type RawResult = {
  parsed?: unknown;
  blob?: Blob;
  headers: Headers;
  requestId?: string;
  status: number;
};

async function requestRaw(options: RequestOptions, mode: "json" | "blob"): Promise<RawResult> {
  const {
    method = "GET",
    path,
    query,
    body,
    idempotencyKey,
    ifMatch,
    public: isPublic,
    accessToken: tokenOverride,
    signal,
    headers: extraHeaders,
  } = options;

  const url = `${resolvePath(path)}${buildQueryString(query)}`;
  const headers: Record<string, string> = {
    Accept: mode === "blob" ? "*/*" : "application/json",
    ...extraHeaders,
  };

  // A Blob/File body is sent as-is (e.g. the branding logo upload takes raw image
  // bytes); everything else is JSON.
  const rawBody = typeof Blob !== "undefined" && body instanceof Blob;
  if (rawBody) {
    if (!headers["Content-Type"]) headers["Content-Type"] = body.type || "application/octet-stream";
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  if (ifMatch !== undefined && ifMatch !== null) {
    headers["If-Match"] = String(ifMatch);
  }

  let hasAuth = false;
  let bearerToken: string | null = null;
  if (!isPublic) {
    bearerToken = tokenOverride === undefined ? getAccessToken() : tokenOverride;
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
      hasAuth = true;
    }
  }

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = () =>
    Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);

  if (import.meta.env.DEV) {
    console.debug(`[api] → ${method} ${url}${hasAuth ? " (auth)" : ""}`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : rawBody ? body : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // AbortSignal.timeout / caller abort both surface as an AbortError whose
    // raw message ("signal timed out") is confusing in a toast — classify it.
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    if (import.meta.env.DEV) {
      console.error(
        `[api] ✗ ${method} ${url} ${aborted ? "TIMEOUT/ABORT" : "NETWORK"} after ${elapsed()}ms`,
        err,
      );
    }
    throw new ApiError({
      status: 0,
      code: aborted ? "TIMEOUT" : "NETWORK_ERROR",
      title: aborted ? "Request timed out" : "Network error",
      detail: aborted
        ? "The API took too long to respond (it may be waking up). Please try again."
        : err instanceof Error
          ? err.message
          : "Unable to reach the server.",
    });
  }

  const requestId = res.headers.get("x-request-id") ?? res.headers.get("X-Request-Id") ?? undefined;
  // A binary success is read as a Blob; anything else (JSON success, or any
  // failure — errors are always problem+json) goes through the text parser.
  const asBlob = mode === "blob" && res.ok;
  const blob = asBlob ? await res.blob() : undefined;
  const parsed = asBlob ? undefined : await parseBody(res);

  if (import.meta.env.DEV) {
    const line = `[api] ← ${res.status} ${method} ${url} in ${elapsed()}ms${requestId ? ` reqId=${requestId}` : ""}`;
    if (res.ok) console.debug(line);
    else console.warn(line, parsed);
  }

  if (!res.ok) {
    const error = parseProblemDetails(parsed, res.status, requestId);

    if (error.isMfaRequired && mfaHandler) {
      const retried = await mfaHandler(error);
      if (retried) {
        return requestRaw(options, mode);
      }
    }

    // An access token that expired while the machine was asleep goes out before
    // supabase-js notices and refreshes it (focus refetches race the refresh).
    // Refresh the session and replay once, instead of surfacing an error the
    // user can only fix by reloading. Explicit token overrides are exempt: the
    // caller chose that token deliberately (e.g. a claim flow).
    if (
      error.isUnauthenticated &&
      hasAuth &&
      bearerToken &&
      tokenOverride === undefined &&
      !options.authRetried &&
      authRetryHandler
    ) {
      const refreshed = await authRetryHandler(bearerToken);
      if (refreshed) {
        return requestRaw({ ...options, authRetried: true }, mode);
      }
    }

    throw error;
  }

  return {
    parsed,
    blob,
    headers: res.headers,
    requestId,
    status: res.status,
  };
}

/** Convenience helpers. */
export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "path" | "body">) =>
    request<T>({ ...opts, method: "GET", path }),
  post: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions, "method" | "path" | "body">,
  ) => request<T>({ ...opts, method: "POST", path, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "path" | "body">) =>
    request<T>({ ...opts, method: "PUT", path, body }),
  patch: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions, "method" | "path" | "body">,
  ) => request<T>({ ...opts, method: "PATCH", path, body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, "method" | "path" | "body">) =>
    request<T>({ ...opts, method: "DELETE", path }),
  /** GET a binary body (PDF etc.) with the usual auth. */
  blob: (path: string, opts?: Omit<RequestOptions, "method" | "path" | "body">) =>
    requestBlob({ ...opts, method: "GET", path }),
};
