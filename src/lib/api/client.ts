import { ApiError, parseProblemDetails } from "./errors";
import { getAccessToken } from "./token";
import { buildQueryString, type QueryValue } from "./query-string";

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
};

export type ApiResult<T> = {
  data: T;
  requestId?: string;
  status: number;
};

let mfaHandler: ((error: ApiError) => Promise<boolean>) | null = null;

/** Register a handler that challenges TOTP and returns true if the caller should retry. */
export function setMfaHandler(handler: ((error: ApiError) => Promise<boolean>) | null) {
  mfaHandler = handler;
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

export async function request<T>(options: RequestOptions): Promise<ApiResult<T>> {
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
    Accept: "application/json",
    ...extraHeaders,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  if (ifMatch !== undefined && ifMatch !== null) {
    headers["If-Match"] = String(ifMatch);
  }

  let hasAuth = false;
  if (!isPublic) {
    const token = tokenOverride === undefined ? getAccessToken() : tokenOverride;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      hasAuth = true;
    }
  }

  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
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
      body: body === undefined ? undefined : JSON.stringify(body),
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
  const parsed = await parseBody(res);

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
        return request<T>(options);
      }
    }

    throw error;
  }

  return {
    data: parsed as T,
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
};
