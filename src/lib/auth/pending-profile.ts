/**
 * Register collects a name before the API user exists. Stash it so we can PATCH
 * /api/v1/me once the session is authenticated (immediate signup or after email
 * verification).
 *
 * localStorage (not sessionStorage) so it survives the email-confirmation link
 * opening in a fresh tab. Cleared once the name is applied to the profile.
 */
const KEY = "recavo.pendingProfile";

export type PendingProfile = {
  name: string;
};

export function stashPendingProfile(value: PendingProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // localStorage unavailable (SSR / privacy mode) — best-effort.
  }
}

export function readPendingProfile(): PendingProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingProfile) : null;
  } catch {
    return null;
  }
}

export function clearPendingProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}

/** Read and clear in one step. */
export function takePendingProfile(): PendingProfile | null {
  const value = readPendingProfile();
  if (value) clearPendingProfile();
  return value;
}
