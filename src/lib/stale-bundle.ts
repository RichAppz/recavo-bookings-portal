/**
 * Every deploy replaces the hashed page bundles, so an app left open across a
 * deploy (the iOS app can stay alive for days) asks for files that no longer
 * exist the next time it opens a page it hasn't loaded yet. A full reload picks
 * up the new version.
 *
 * TanStack's own reload keys on the error message, which Safari words the same
 * for every module ("Importing a module script failed."), so it only ever fires
 * once per session. This guard is time-based instead: at most one reload in
 * RELOAD_COOLDOWN_MS, which still stops a loop if the new version is broken too.
 */

const STORAGE_KEY = "recavo.staleBundleReloadAt";
export const RELOAD_COOLDOWN_MS = 30_000;

const PATTERNS = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
  "Unable to preload CSS",
  "is not a valid JavaScript MIME type",
];

export function isStaleBundleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return PATTERNS.some((p) => message.includes(p));
}

export function shouldReload(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > RELOAD_COOLDOWN_MS;
}

/** Reloads onto the latest deploy unless one was just tried. Returns whether it reloaded. */
export function reloadForNewVersion(): boolean {
  if (typeof window === "undefined") return false;
  let last: number | null = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    last = raw ? Number(raw) : null;
  } catch {
    // Storage blocked: fall through and reload once; the cooldown can't be kept.
  }
  const now = Date.now();
  if (!shouldReload(Number.isFinite(last) ? last : null, now)) return false;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // ignore
  }
  window.location.reload();
  return true;
}
