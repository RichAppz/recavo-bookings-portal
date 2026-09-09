import { useSmsCredits, type SmsCreditBundle, type SmsCredits } from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format";

/** Balance at or below which the UI nudges the owner to top up (matches the API's emails at 20 / 10 / 0). */
export const SMS_LOW_BALANCE = 20;

/** "100 texts (£5)" — always from the API's bundle, never hard-coded. */
export function bundleLabel(bundle: SmsCreditBundle): string {
  return `${bundle.credits} texts (${formatMoney(bundle.unitAmountMinor, bundle.currency, { compact: true })})`;
}

export type SmsCreditsLevel = "unlimited" | "ok" | "low" | "empty" | "unknown";

export function smsCreditsLevel(credits: SmsCredits | undefined): SmsCreditsLevel {
  if (!credits) return "unknown";
  if (credits.unlimited) return "unlimited";
  if (credits.balance <= 0) return "empty";
  if (credits.balance <= SMS_LOW_BALANCE) return "low";
  return "ok";
}

/**
 * One line explaining what picking "SMS" means on this plan right now (ADR 0020).
 * Texting is allowed on every tier; whether a given message actually goes by text
 * is settled at send time from the credit balance, so the copy says so.
 */
export function smsChannelNote(credits: SmsCredits | undefined): string {
  switch (smsCreditsLevel(credits)) {
    case "unlimited":
      return "Texts are included in your plan.";
    case "empty":
      return "You have no text credits left — anything set to SMS is currently sent by email until you buy a bundle.";
    case "low":
    case "ok":
      return `Texts use your credit balance (${credits!.balance} left). When you run out, messages are sent by email instead.`;
    default:
      return "Texts use your prepaid credit balance. When you run out, messages are sent by email instead.";
  }
}

/** Convenience: the balance summary plus the level, for channel pickers and the resend menu. */
export function useSmsCreditsSummary() {
  const query = useSmsCredits();
  const credits = query.data;
  const level = smsCreditsLevel(credits);
  return {
    credits,
    level,
    /** True when a text sent right now would actually go by SMS (unlimited or balance > 0). */
    canText: level === "unlimited" || level === "ok" || level === "low",
    note: smsChannelNote(credits),
    isLoading: query.isLoading,
  };
}
