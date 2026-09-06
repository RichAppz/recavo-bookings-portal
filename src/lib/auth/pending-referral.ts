/**
 * Referral codes are only accepted at POST /api/v1/businesses. Google OAuth
 * returns to the origin and drops `?ref=`, and the email-confirmation link can
 * open in a fresh tab, so stash the code in localStorage as soon as the landing
 * URL is seen. Cleared once the business is created.
 */
const KEY = "recavo.pendingReferral";

/** Crockford-ish alphabet: no 0/O/1/I. Matches the API referral code helper. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Strip hyphens/spaces and upper-case. Returns null when the shape is wrong. */
export function normaliseReferralCode(raw: string): string | null {
  const compact = raw.replace(/[-\s]/g, "").toUpperCase();
  if (compact.length !== 8) return null;
  for (const ch of compact) {
    if (!ALPHABET.includes(ch)) return null;
  }
  return compact;
}

export function displayReferralCode(code: string): string {
  const compact = code.replace(/[-\s]/g, "").toUpperCase();
  if (compact.length !== 8) return code.trim();
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function stashPendingReferral(raw: string): void {
  const normalised = normaliseReferralCode(raw) ?? raw.replace(/[-\s]/g, "").toUpperCase().trim();
  if (!normalised) {
    clearPendingReferral();
    return;
  }
  try {
    localStorage.setItem(KEY, normalised);
  } catch {
    // localStorage unavailable (SSR / privacy mode) — best-effort.
  }
}

export function readPendingReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
