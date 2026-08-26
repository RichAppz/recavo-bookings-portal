import type { OnboardingStepKey } from "@/lib/api/types";

const dismissKey = (businessId: string) => `recavo:onboarding:dismissed:${businessId}`;
const skipKey = (businessId: string) => `recavo:onboarding:skipped:${businessId}`;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isOnboardingDismissedLocally(businessId: string): boolean {
  return readJson<boolean>(dismissKey(businessId), false);
}

export function setOnboardingDismissedLocally(businessId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(dismissKey(businessId), JSON.stringify(true));
}

export function getSkippedStepsLocally(businessId: string): OnboardingStepKey[] {
  return readJson<OnboardingStepKey[]>(skipKey(businessId), []);
}

export function skipOnboardingStepLocally(businessId: string, key: OnboardingStepKey): void {
  if (typeof window === "undefined") return;
  const next = new Set(getSkippedStepsLocally(businessId));
  next.add(key);
  window.localStorage.setItem(skipKey(businessId), JSON.stringify([...next]));
}
