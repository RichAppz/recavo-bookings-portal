import { useEffect } from "react";

const OPEN_LAYER = '[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]';

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
    const dialogOpen = () => document.querySelector(OPEN_LAYER) !== null;
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

  useStuckOverlayWatchdog();
}

/**
 * Frees the page if a closing dialog never finishes closing.
 *
 * Radix keeps a dialog mounted until its exit animation fires `animationend`, and
 * while mounted it keeps `pointer-events: none` on the body. If that event never
 * arrives (WebKit can drop it when the app is backgrounded mid-animation or the
 * compositor stalls on a full-screen filtered overlay) the dimmed overlay stays and
 * nothing on the page responds — the only way out is to kill the app. When the body
 * has been locked for a while with no open layer to justify it, hand the stranded
 * layers the event they are waiting for so Radix unmounts them.
 */
function useStuckOverlayWatchdog(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lockedSince: number | null = null;
    const tick = () => {
      const locked = document.body.style.pointerEvents === "none";
      if (!locked || document.querySelector(OPEN_LAYER)) {
        lockedSince = null;
        return;
      }
      lockedSince ??= Date.now();
      if (Date.now() - lockedSince < 1200) return;
      // Closed-but-mounted dialog contents, plus the overlays portalled beside them.
      const stranded = new Set<HTMLElement>();
      for (const content of document.querySelectorAll<HTMLElement>(
        '[role="dialog"][data-state="closed"], [role="alertdialog"][data-state="closed"]',
      )) {
        stranded.add(content);
        // The overlay sits beside the content, or beside a positioning wrapper
        // around it (the phone bottom sheet), so look one and two levels up.
        for (const scope of [content.parentElement, content.parentElement?.parentElement]) {
          for (const sibling of scope?.children ?? []) {
            if (sibling instanceof HTMLElement && sibling.dataset.state === "closed") {
              stranded.add(sibling);
            }
          }
        }
      }
      for (const node of stranded) {
        const animationName = getComputedStyle(node).animationName;
        if (!animationName || animationName === "none") continue;
        for (const name of animationName.split(",")) {
          node.dispatchEvent(
            new AnimationEvent("animationend", { animationName: name.trim(), bubbles: false }),
          );
        }
      }
      // Belt and braces: if nothing was listening, the lock itself is stale.
      window.setTimeout(() => {
        if (
          document.body.style.pointerEvents === "none" &&
          !document.querySelector(OPEN_LAYER) &&
          !document.querySelector('[data-state="closed"][role="dialog"]')
        ) {
          document.body.style.pointerEvents = "";
        }
      }, 100);
      lockedSince = null;
    };
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, []);
}
