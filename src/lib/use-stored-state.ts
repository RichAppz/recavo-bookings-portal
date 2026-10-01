import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

function read<T extends string>(key: string, fallback: T, allowed?: readonly T[]): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const stored = raw as T;
    return allowed && !allowed.includes(stored) ? fallback : stored;
  } catch {
    return fallback;
  }
}

/**
 * `useState` that remembers its value in localStorage, so a control comes back the
 * way the user last left it (calendar view, filters…). Pass `allowed` to reject stale
 * stored values — e.g. a filter pointing at a service that has since been deleted.
 *
 * Re-reads when `key` changes: keys are usually scoped to the business, which is not
 * known until memberships load, so a component mounted at app start would otherwise
 * read (and never re-read) an empty key.
 */
export function useStoredState<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[],
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, fallback, allowed));

  // Call sites pass `allowed` as a module constant or an inline literal; a ref keeps
  // the latter from re-running the effect every render.
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const mountedKey = useRef(key);
  useEffect(() => {
    if (mountedKey.current === key) return;
    mountedKey.current = key;
    setValue(read(key, fallbackRef.current, allowedRef.current));
  }, [key]);

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
