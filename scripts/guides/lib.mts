/**
 * Shared plumbing for the guide scripts: environment, Supabase sign-in and a thin
 * API client. Nothing here is part of the app bundle.
 *
 * Reads `~/.recavo-guides.env` (or GUIDES_ENV_FILE) with:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, GUIDES_PASSWORD,
 *   GUIDES_PT_EMAIL, GUIDES_AUTO_EMAIL, API_BASE_URL, PORTAL_BASE_URL
 * and optionally GUIDES_DATABASE_URL (owner-role connection to the LOCAL API
 * database, used only to grant the fictional businesses a subscription).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Vertical = "personal_training" | "car_detailing";

export type GuidesEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GUIDES_PASSWORD: string;
  GUIDES_PT_EMAIL: string;
  GUIDES_AUTO_EMAIL: string;
  API_BASE_URL: string;
  PORTAL_BASE_URL: string;
  GUIDES_DATABASE_URL?: string;
};

export function loadEnv(): GuidesEnv {
  const file = process.env.GUIDES_ENV_FILE ?? join(homedir(), ".recavo-guides.env");
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "GUIDES_PASSWORD",
    "GUIDES_PT_EMAIL",
    "GUIDES_AUTO_EMAIL",
    "API_BASE_URL",
    "PORTAL_BASE_URL",
  ]) {
    if (!out[key]) throw new Error(`${file} is missing ${key}`);
  }
  return out as GuidesEnv;
}

export function emailFor(env: GuidesEnv, vertical: Vertical): string {
  return vertical === "personal_training" ? env.GUIDES_PT_EMAIL : env.GUIDES_AUTO_EMAIL;
}

export async function signIn(
  env: GuidesEnv,
  email: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number; user: unknown }> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password: env.GUIDES_PASSWORD }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    user?: unknown;
    error_description?: string;
    msg?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Sign-in failed for ${email}: ${json.error_description ?? json.msg ?? res.status}`,
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresAt: json.expires_at ?? 0,
    user: json.user,
  };
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class Api {
  private base: string;
  private token: string;
  constructor(base: string, token: string) {
    this.base = base;
    this.token = token;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { ifMatch?: number | string; query?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(path, this.base);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${this.token}`,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (method !== "GET") headers["idempotency-key"] = crypto.randomUUID();
    if (options.ifMatch !== undefined) headers["if-match"] = String(options.ifMatch);
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const detail =
        json && typeof json === "object" && "detail" in json
          ? String((json as { detail: unknown }).detail)
          : text.slice(0, 300);
      throw new ApiError(res.status, json, `${method} ${path} → ${res.status}: ${detail}`);
    }
    return json as T;
  }

  get<T>(path: string, query?: Record<string, string>) {
    return this.request<T>("GET", path, undefined, { query });
  }
  post<T>(path: string, body?: unknown, options?: { ifMatch?: number | string }) {
    return this.request<T>("POST", path, body, options);
  }
  patch<T>(path: string, body: unknown, options?: { ifMatch?: number | string }) {
    return this.request<T>("PATCH", path, body, options);
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>("PUT", path, body);
  }
}

export function log(step: string, detail = ""): void {
  console.log(`  ${step.padEnd(44)} ${detail}`);
}
