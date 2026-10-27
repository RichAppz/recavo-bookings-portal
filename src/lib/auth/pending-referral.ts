/**
 * Referral codes are only accepted at POST /api/v1/businesses. Google OAuth
 * returns to the origin and drops `?ref=`, and the email-confirmation link can
 * open in a fresh tab, so stash the code in localStorage as soon as the landing
 * URL is seen. Cleared once the business is created.
 */
const KEY = "recavo.pendingReferral";

/**
 * As it was shared: a minted code keeps its hyphen (ABCD-EFGH), one a business chose has
 * none (SHINECARS). No hyphen is added, since "SPARKLES" is a word and not "SPAR-KLES";
 * the API ignores hyphens anyway.
 */
export function displayReferralCode(code: string): string {
  return code.replace(/\s/g, "").toUpperCase();
}

export function stashPendingReferral(raw: string): void {
  const normalised = displayReferralCode(raw);
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
