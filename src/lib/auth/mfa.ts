/**
 * Maps a Supabase AAL snapshot and listed TOTP factors to the next MFA step.
 *
 * `proceed` — session is already AAL2.
 * `challenge` — a verified factor exists; raise the session with challenge/verify.
 * `enroll` — no verified factor; show QR then verify to activate it.
 */

export type MfaStep = "proceed" | "enroll" | "challenge";

export type AalSnapshot = {
  currentLevel?: string | null;
  nextLevel?: string | null;
} | null;

export type TotpFactorSnapshot = {
  id: string;
  status?: string | null;
};

export type FactorsSnapshot = {
  totp?: TotpFactorSnapshot[] | null;
} | null;

export function verifiedTotp(factors: FactorsSnapshot): TotpFactorSnapshot | undefined {
  return factors?.totp?.find((factor) => factor.status === "verified");
}

export function mfaStepFor(aal: AalSnapshot, factors: FactorsSnapshot): MfaStep {
  if (aal?.currentLevel === "aal2") return "proceed";
  if (verifiedTotp(factors)) return "challenge";
  return "enroll";
}
