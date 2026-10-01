import { useEffect } from "react";

/**
 * Keeps a fixed-position dialog tappable after the iOS keyboard goes away.
 *
 * In the WKWebView shell the keyboard does not resize the page; iOS scrolls the
 * window to reveal the focused field, even one inside a `position: fixed` drawer.
 * When the field blurs the window can be left scrolled, and WebKit then paints the
 * fixed drawer in one place and hit-tests it in another — every button looks fine
 * and none of them respond, and with body scroll locked by the dialog there is no
 * way to nudge it back. Scrolling the window home once the keyboard has gone puts
 * paint and hit-testing back in step. Only acts while a dialog is open, so normal
 * page scrolling is untouched.
 */
export function useDialogKeyboardGuard(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dialogOpen = () => document.querySelector('[role="dialog"][data-state="open"]') !== null;
    const settle = () => {
      if (!dialogOpen()) return;
      const vv = window.visualViewport;
      // Never while the keyboard is up: iOS scrolled on purpose to show the field.
      const keyboardClosed = !vv || vv.height >= window.innerHeight - 1;
      if (!keyboardClosed) return;
      const displaced = window.scrollY !== 0 || window.scrollX !== 0 || (vv?.offsetTop ?? 0) !== 0;
      if (displaced) window.scrollTo(0, 0);
    };
    const onFocusOut = () => {
      // The keyboard animates out after blur; check once it has settled.
      window.setTimeout(settle, 350);
    };
    document.addEventListener("focusout", onFocusOut, true);
    window.visualViewport?.addEventListener("resize", settle);
    return () => {
      document.removeEventListener("focusout", onFocusOut, true);
      window.visualViewport?.removeEventListener("resize", settle);
    };
  }, []);
}
