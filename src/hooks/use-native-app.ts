import { useSyncExternalStore } from "react";
import { isNativeApp, saasPurchasesAllowedInApp } from "@/lib/native";

const noop = () => () => {};

/**
 * `isNativeApp()` for server-rendered pages. The Capacitor bridge only exists
 * in the browser, so the server (and the hydration pass) answer "browser" and
 * the real value lands on the first client render — no hydration mismatch.
 * Pages that only render after a client-side query has resolved can call
 * `isNativeApp()` directly.
 */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(
    noop,
    () => isNativeApp(),
    () => false,
  );
}

/** Hydration-safe `saasPurchasesAllowedInApp()`; see that function for the rule. */
export function useSaasPurchasesAllowed(): boolean {
  return saasPurchasesAllowedInApp(useIsNativeApp());
}
