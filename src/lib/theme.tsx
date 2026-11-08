import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * The colour scheme follows the OS setting only — there is no in-app toggle.
 * A stored manual preference from the earlier toggle is intentionally ignored
 * so nobody is left stuck in a mode they can no longer change.
 *
 * Client-facing screens (the public booking page, the client sign-in and the
 * account) are the exception: they carry their own palette and pin the scheme
 * with {@link useFixedTheme}, so a client on a dark phone is not handed dark
 * cards inside a page designed light.
 */

export type ColourScheme = "light" | "dark";

type ThemeContextValue = {
  resolvedTheme: ColourScheme;
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline script injected in <head> to set the theme class before paint (no flash).
 * The customer hostname and the account are always light, so they skip the OS
 * setting here too; everything else is corrected after mount if a screen pins
 * its own scheme.
 */
export const themeScript = `(function(){try{var h=location.hostname,p=location.pathname;var c=/^(staging\\.)?book\\./.test(h)||p==='/account'||p.indexOf('/account/')===0;var d=!c&&window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

/** The scheme the mounted screen insists on, if any; the OS setting otherwise. */
let fixedScheme: ColourScheme | null = null;
let onFixedSchemeChange: (() => void) | null = null;

function apply(scheme: ColourScheme): ColourScheme {
  document.documentElement.classList.toggle("dark", scheme === "dark");
  document.documentElement.style.colorScheme = scheme;
  return scheme;
}

function resolve(prefersDark: boolean): ColourScheme {
  return fixedScheme ?? (prefersDark ? "dark" : "light");
}

/**
 * Pins the document's colour scheme while the calling screen is mounted, and
 * hands it back to the OS setting (or the previous pin) on unmount. Layout
 * effect, so the swap lands before the screen is painted.
 */
export function useFixedTheme(scheme: ColourScheme | null) {
  useLayoutEffect(() => {
    if (!scheme) return;
    const previous = fixedScheme;
    fixedScheme = scheme;
    apply(scheme);
    onFixedSchemeChange?.();
    return () => {
      fixedScheme = previous;
      onFixedSchemeChange?.();
    };
  }, [scheme]);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<ColourScheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => setResolvedTheme(apply(resolve(mq.matches)));
    refresh();
    setMounted(true);
    onFixedSchemeChange = refresh;
    mq.addEventListener("change", refresh);
    return () => {
      mq.removeEventListener("change", refresh);
      onFixedSchemeChange = null;
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ resolvedTheme, mounted }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
