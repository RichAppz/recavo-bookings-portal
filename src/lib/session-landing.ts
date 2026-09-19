/**
 * `/` is both the app's front door (cold start, post-login) and the Overview
 * link in the sidebar. Only the former should be steered to the calendar, so
 * the shell notes when the first authenticated page of this browser session
 * has rendered and the home route checks that flag before it decides.
 */
const LANDED_KEY = "recavo.session.landed";

export function isSessionEntry(): boolean {
  try {
    return window.sessionStorage.getItem(LANDED_KEY) === null;
  } catch {
    return false;
  }
}

export function markSessionLanded(): void {
  try {
    window.sessionStorage.setItem(LANDED_KEY, "1");
  } catch {
    // Private mode / storage disabled: every visit counts as entry, which is harmless.
  }
}
