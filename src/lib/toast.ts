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
