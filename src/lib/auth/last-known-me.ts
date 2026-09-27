import type { User } from "@/lib/api/types";

/**
 * The account profile from the last successful sign-in, kept on the device so
 * the app can open without signal.
 *
 * Bootstrapping normally confirms the Supabase session against `GET /api/v1/me`.
 * With no network that call can't happen; rather than bounce someone with a
 * perfectly good local session to the login screen, the store falls back to
 * this copy (for the same user id only) and re-confirms once a request gets
 * through. Cleared on sign-out.
 */
const KEY = "recavo.auth.lastKnownMe";

type Stored = { userId: string; me: User; at: string };

export function rememberMe(userId: string, me: User): void {
  try {
    const value: Stored = { userId, me, at: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable — offline boot just won't be possible on this device.
  }
}

export function recallMe(userId: string): User | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    return stored.userId === userId ? stored.me : null;
  } catch {
    return null;
  }
}

export function forgetMe(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
