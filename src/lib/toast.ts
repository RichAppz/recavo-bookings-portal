import type { CSSProperties } from "react";
import type { ExternalToast } from "sonner";

/** How long a toast stays up. Mirrored by the timer bar along its bottom edge (styles.css). */
export const TOAST_DURATION_MS = 5000;

/**
 * Per-toast override for the auto-dismiss time. Sets both the sonner timer and the
 * CSS variable the timer bar animates against, so the two stay in step:
 *
 *   toast.error("…", { description, ...toastDuration(10_000) });
 */
export function toastDuration(ms: number): Pick<ExternalToast, "duration" | "style"> {
  return { duration: ms, style: { "--toast-duration": `${ms}ms` } as CSSProperties };
}

/** Did this event start on a toast (its ×, a swipe, an action button)? */
export function isToastInteraction(target: EventTarget | null | undefined): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null | undefined;
  return typeof el?.closest === "function" && Boolean(el.closest("[data-sonner-toaster]"));
}

/**
 * Radix `onInteractOutside` guard for modal layers (Dialog, Sheet, AlertDialog…).
 * The toast host sits outside every modal, so without this a tap on a toast's × or a
 * swipe to clear it counted as "outside" and closed the dialog underneath — the toast
 * stayed and the person lost their form. Toasts are never a reason to dismiss.
 */
export function keepOpenForToast(event: {
  target: EventTarget | null;
  detail?: { originalEvent?: Event };
  preventDefault: () => void;
}): void {
  if (isToastInteraction(event.target) || isToastInteraction(event.detail?.originalEvent?.target)) {
    event.preventDefault();
  }
}
