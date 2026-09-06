import { getSupabase } from "@/lib/supabase";

/**
 * Register collects a business name + industry, but the account is created first
 * and the business is provisioned after sign-in (CreateFirstBusiness). We stash
 * the choice so onboarding can auto-provision it instead of discarding what the
 * user just typed.
 *
 * localStorage (not sessionStorage) so it survives the email-confirmation link
 * opening in a fresh tab. Cleared as soon as the business is created.
 *
 * localStorage still dies when the confirmation happens somewhere else — sign up
 * on a laptop, open the code email on a phone days later. So email/password
 * sign-up also writes the choice into Supabase `user_metadata`
 * ({@link pendingBusinessFromMetadata} reads it back), which rides on the account
 * itself and survives any device/browser hop. The stash stays as the primary
 * source because Google OAuth sign-up can't carry metadata.
 */
const KEY = "recavo.pendingBusiness";

export type PendingBusiness = {
  legalName: string;
  industryTemplateKey: string;
};

export function stashPendingBusiness(value: PendingBusiness): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // localStorage unavailable (SSR / privacy mode) — prefill is best-effort.
  }
}

export function readPendingBusiness(): PendingBusiness | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingBusiness) : null;
  } catch {
    return null;
  }
}

export function clearPendingBusiness(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}

/**
 * The business captured at sign-up, as carried by Supabase `user_metadata`
 * (set via `signUp(..., { business_name, industry_template_key })`). Client-set
 * and untrusted — only ever used to prefill/auto-submit the same form the user
 * could type into; the API validates the real request.
 */
export function pendingBusinessFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): PendingBusiness | null {
  if (!metadata) return null;
  const legalName = typeof metadata.business_name === "string" ? metadata.business_name.trim() : "";
  const industryTemplateKey =
    typeof metadata.industry_template_key === "string" ? metadata.industry_template_key : "";
  if (!legalName || !industryTemplateKey) return null;
  return { legalName, industryTemplateKey };
}

/**
 * Remove the sign-up business from `user_metadata` once it has been consumed
 * (business created, or creation failed and we fell back to the manual form) so
 * a later visit doesn't auto-provision from stale data. Best-effort.
 */
export async function clearSignUpBusinessMetadata(): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.auth.updateUser({
      data: { business_name: null, industry_template_key: null },
    });
  } catch {
    // Metadata is only a prefill hint; failing to clear it is harmless enough.
  }
}
