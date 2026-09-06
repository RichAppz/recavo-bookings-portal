import { useEffect } from "react";
import type { OnboardingStepKey } from "@/lib/api/types";

/**
 * Contextual setup prompts.
 *
 * The setup checklist stays collapsed while someone is just looking around. When
 * they try to do something that needs a step they haven't done yet (book with no
 * services, sell a package with no packages…), the gate that stops them calls
 * `requestSetup(step)` so the checklist opens with that step highlighted.
 *
 * Every route wraps itself in AppShell, so the checklist remounts on navigation
 * and a plain event fired just before a route change would be lost. The request is
 * therefore also parked in sessionStorage and consumed by the next mount.
 */

const EVENT = "recavo:setup-prompt";
const PENDING_KEY = "recavo.setup.pending";

export type SetupPrompt = { step: OnboardingStepKey | null };

export function requestSetup(step?: OnboardingStepKey): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_KEY, step ?? "");
  } catch {
    // Storage can be unavailable (private mode quotas); the live event still fires.
  }
  window.dispatchEvent(new CustomEvent<SetupPrompt>(EVENT, { detail: { step: step ?? null } }));
}

export function consumePendingSetupPrompt(): SetupPrompt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (raw === null) return null;
    window.sessionStorage.removeItem(PENDING_KEY);
    return { step: raw ? (raw as OnboardingStepKey) : null };
  } catch {
    return null;
  }
}

/** Subscribe to prompts fired while this component is mounted. */
export function useSetupPromptListener(onPrompt: (prompt: SetupPrompt) => void): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SetupPrompt>).detail;
      // The live event handles it; clear the parked copy so the next mount doesn't replay it.
      try {
        window.sessionStorage.removeItem(PENDING_KEY);
      } catch {
        // ignore
      }
      onPrompt(detail ?? { step: null });
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [onPrompt]);
}
