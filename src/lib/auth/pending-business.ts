/**
 * Register collects a business name + industry, but the account is created first
 * and the business is provisioned after sign-in (CreateFirstBusiness). We stash
 * the choice in sessionStorage so onboarding can prefill it instead of discarding
 * what the user just typed.
 */
const KEY = "recavo.pendingBusiness";

export type PendingBusiness = {
  legalName: string;
  industryTemplateKey: string;
};

export function stashPendingBusiness(value: PendingBusiness): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // sessionStorage unavailable (SSR / privacy mode) — prefill is best-effort.
  }
}

export function readPendingBusiness(): PendingBusiness | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingBusiness) : null;
  } catch {
    return null;
  }
}

export function clearPendingBusiness(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
