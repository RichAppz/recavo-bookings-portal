import { useEffect, useState } from "react";

/**
 * Live answer to a CSS media query. False on the server and on the first client
 * render (there is no window to ask yet), then tracks changes — rotating a phone
 * or resizing a window flips it without a reload.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Below Tailwind's `sm` breakpoint (640px): a phone, or a very narrow window. */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 639.98px)");
}
