import { useCallback, useLayoutEffect, useRef, type ChangeEvent } from "react";

/**
 * Keeps the caret where the user had it when a controlled input's `onChange`
 * rewrites what they typed (upper-casing a registration, say). React resets a
 * controlled input's caret to the end whenever the value it writes back differs
 * from what the DOM already holds, so typing one character in the middle of the
 * field sent the cursor to the far right. The formatter must keep the length of
 * the text unchanged for the restored position to be meaningful.
 */
export function useFormattedChange(
  format: (raw: string) => string,
  commit: (formatted: string, index: number) => void,
) {
  const pending = useRef<{ el: HTMLInputElement; start: number | null; end: number | null } | null>(
    null,
  );

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (p.start === null || p.end === null || document.activeElement !== p.el) return;
    try {
      p.el.setSelectionRange(p.start, p.end);
    } catch {
      // Inputs of some types (email, number) refuse selection APIs; nothing to restore.
    }
  });

  return useCallback(
    (index: number) => (event: ChangeEvent<HTMLInputElement>) => {
      const el = event.target;
      const formatted = format(el.value);
      if (formatted !== el.value) {
        pending.current = { el, start: el.selectionStart, end: el.selectionEnd };
      }
      commit(formatted, index);
    },
    [format, commit],
  );
}
