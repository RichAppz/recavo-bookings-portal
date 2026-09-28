import type { ConnectAccount } from "@/lib/api/types";

/**
 * A payout account the provider has turned down, and what the business may be told
 * about it.
 *
 * UK regulation requires a rejection for a terms of service violation or for credit
 * risk to be passed on with its reason, so the business is emailed at the point the
 * rejection lands; this is the same explanation on screen, for anyone who reads the
 * page before the email. Reasons we are not permitted to pass on never reach the
 * client — the API leaves `rejectionReasonCode` null for those — so this only has to
 * cope with the reason being absent, never with deciding whether to hide it.
 */
const REASON_LABELS: Record<string, string> = {
  terms_of_service: "Terms of service violation",
  credit_risk: "Credit risk",
};

export type ConnectRejection = {
  /** Null when no reason was given, or when it is one we cannot pass on. */
  readonly reasonLabel: string | null;
  /** The provider's own wording for the category, when it gave any. */
  readonly detail: string | null;
  readonly rejectedAt: string | null;
};

type RejectableAccount = Pick<
  ConnectAccount,
  "onboardingState" | "rejectionReasonCode" | "rejectionReasonDetail" | "rejectedAt"
>;

export function connectRejection(
  account: RejectableAccount | null | undefined,
): ConnectRejection | null {
  if (!account || account.onboardingState !== "rejected") return null;
  const code = account.rejectionReasonCode?.trim();
  return {
    reasonLabel: (code ? REASON_LABELS[code] : null) ?? null,
    detail: account.rejectionReasonDetail?.trim() || null,
    rejectedAt: account.rejectedAt ?? null,
  };
}

/**
 * Whether restarting onboarding could help. It cannot once an account is rejected —
 * the provider has made a decision, and sending someone back through the same hosted
 * flow only wastes their time.
 */
export function connectOnboardingWorthRetrying(
  account: Pick<ConnectAccount, "onboardingState"> | null | undefined,
): boolean {
  return account?.onboardingState !== "rejected";
}
