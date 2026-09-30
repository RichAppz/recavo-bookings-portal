/**
 * Platform "log in as" (support sessions), the portal side.
 *
 * The internal console starts a session on the API and opens this app at
 * `/impersonate#token=imp_…&business=…`. The token is the bearer for every API call
 * in this tab; it authenticates as the impersonated member for that one business and
 * the API records the admin on every audit row. It lives in sessionStorage — one tab,
 * gone when the tab closes — and never touches the Supabase session or the persisted
 * query cache the admin's own sign-in on this origin may be using.
 */

export type ImpersonationHandoff = { token: string; businessId: string };

/** What `GET /api/v1/me` adds while the bearer is an `imp_` token. */
export type ImpersonationInfo = {
  sessionId: string;
  businessId: string;
  adminUserId: string;
  startedAt: string;
  expiresAt: string;
};

export const IMPERSONATE_PATH = "/impersonate";
const KEY = "recavo.impersonation";
const TOKEN_PREFIX = "imp_";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readImpersonation(): ImpersonationHandoff | null {
  const raw = storage()?.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationHandoff>;
    if (typeof parsed.token === "string" && typeof parsed.businessId === "string") {
      return { token: parsed.token, businessId: parsed.businessId };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function writeImpersonation(handoff: ImpersonationHandoff): void {
  storage()?.setItem(KEY, JSON.stringify(handoff));
}

export function clearImpersonation(): void {
  storage()?.removeItem(KEY);
}

/** Synchronous check for code paths that must not touch shared storage (persistence, tenant prefs). */
export function isImpersonating(): boolean {
  return readImpersonation() !== null;
}

/** `#token=imp_…&business=…` → handoff, or null when the fragment is not one. */
export function parseImpersonationFragment(hash: string): ImpersonationHandoff | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const token = params.get("token") ?? "";
  const businessId = params.get("business") ?? "";
  if (!token.startsWith(TOKEN_PREFIX) || !businessId) return null;
  return { token, businessId };
}

/**
 * On `/impersonate#…`, take the handoff out of the URL and into sessionStorage. The
 * fragment is replaced straight away so the token is not left in the address bar,
 * history or anything that copies the URL.
 */
export function consumeImpersonationHandoff(): ImpersonationHandoff | null {
  if (typeof window === "undefined") return null;
  if (window.location.pathname !== IMPERSONATE_PATH) return null;
  const handoff = parseImpersonationFragment(window.location.hash);
  if (!handoff) return null;
  writeImpersonation(handoff);
  try {
    window.history.replaceState(null, "", IMPERSONATE_PATH);
  } catch {
    /* ignore */
  }
  return handoff;
}
