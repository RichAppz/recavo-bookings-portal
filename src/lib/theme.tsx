import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * The colour scheme follows the OS setting only — there is no in-app toggle.
 * A stored manual preference from the earlier toggle is intentionally ignored
 * so nobody is left stuck in a mode they can no longer change.
 */

type ThemeContextValue = {
  resolvedTheme: "light" | "dark";
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Inline script injected in <head> to set the theme class before paint (no flash). */
export const themeScript = `(function(){try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

function apply(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setResolvedTheme(apply(mq.matches));
    setMounted(true);
    const onChange = () => setResolvedTheme(apply(mq.matches));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
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
