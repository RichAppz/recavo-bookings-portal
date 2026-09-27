import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/**
 * `useState` that remembers its value in localStorage, so a control comes back the
 * way the user last left it (calendar view, filters…). Pass `allowed` to reject stale
 * stored values — e.g. a filter pointing at a service that has since been deleted.
 */
export function useStoredState<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[],
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      const stored = raw as T;
      return allowed && !allowed.includes(stored) ? fallback : stored;
    } catch {
      return fallback;
    }
  });

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        try {
          window.localStorage.setItem(key, resolved);
        } catch {
          // Storage unavailable (private mode quota etc.) — state still updates in memory.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
