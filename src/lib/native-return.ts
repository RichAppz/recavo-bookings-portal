/**
 * Returning from a hosted Stripe flow to the mobile app.
 *
 * The app runs Stripe Checkout, the Billing Portal and Connect onboarding in
 * the system in-app browser sheet (SFSafariViewController / Custom Tab): the
 * only surface Apple supports Apple Pay on, and one that shares nothing with
 * the app's own WebView. Stripe finishes by redirecting the sheet to a page on
 * this origin, where it would otherwise sit — signed out, because the session
 * lives in the app's storage — until the user found the Done button.
 *
 * So the app enters Stripe via public/native/go.html, which drops a marker in
 * the sheet's storage on the way past. Any page on this origin that boots and
 * finds the marker is therefore running inside the sheet, and bounces its own
 * URL to the app (see consumeNativeReturn); the app closes the sheet and
 * navigates itself there with the real session. The marker is single-use and
 * short-lived so a normal browser on the same device is never hijacked.
 */

import { isNativeApp, nativeReturnLink } from "@/lib/native";

/** Written by public/native/go.html. */
const STORAGE_KEY = "recavo.nativeReturn";
/** Long enough for a checkout with 3-D Secure, short enough to be forgotten. */
const MAX_AGE_MS = 60 * 60 * 1000;

/**
 * The URL this page was opened on, captured before any client-side redirect
 * (RequireAuth sending a signed-out visitor to /login, say) can move it.
 */
const LANDED_ON =
  typeof window === "undefined"
    ? ""
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * If this page is running inside the app's browser sheet, clears the marker and
 * returns the deep link that hands the URL it landed on back to the app. Null in
 * the app itself, on the server, and in every ordinary browser tab.
 */
export function consumeNativeReturn(): string | null {
  if (typeof window === "undefined" || isNativeApp()) return null;
  let stamp: string | null = null;
  try {
    stamp = window.localStorage.getItem(STORAGE_KEY);
    if (stamp !== null) window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (stamp === null) return null;
  const setAt = Number(stamp);
  if (!Number.isFinite(setAt) || Date.now() - setAt > MAX_AGE_MS) return null;
  return nativeReturnLink(LANDED_ON);
}
