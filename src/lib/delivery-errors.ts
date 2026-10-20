/**
 * Plain wording for a reminder that didn't go out. The API passes the provider's
 * own reason through, e.g. "The payment reminder could not be sent: email
 * (Postmark delivery failed: You tried to send to recipient(s) that have been
 * marked as inactive…)", which means nothing to a business owner.
 */

export type DeliveryFailure = {
  /** What happened, naming the client. */
  readonly message: string;
  /** True when the fix is on the client's profile (address blocked or missing). */
  readonly checkProfile: boolean;
};

type Channel = "email" | "sms";

const BLOCKED = /inactive|hard bounce|spam complaint|suppress/i;
const BAD_ADDRESS = /invalid (email|address|recipient)|not a valid|malformed/i;
const BAD_NUMBER = /invalid (phone|number|mobile)|not a valid (phone|mobile)|unreachable|landline/i;
const NO_CREDITS = /text credits?|sms credits?|insufficient credit/i;

/** Splits "email (reason), text message (reason)" into one entry per channel. */
function failures(detail: string): { channel: Channel; reason: string }[] {
  const single =
    /^The (email|text message) could not be sent(?:\s*[(:]\s*([\s\S]*?)\)?)?\.?$/i.exec(
      detail.trim(),
    );
  if (single) {
    return [{ channel: /email/i.test(single[1]!) ? "email" : "sms", reason: single[2] ?? "" }];
  }
  const body = detail.replace(/^[^:]*could not be sent:\s*/i, "");
  const out: { channel: Channel; reason: string }[] = [];
  const re = /(email|text message)(?:\s*\(([\s\S]*?)\))?(?=,\s*(?:email|text message)\b|$)/gi;
  for (const m of body.matchAll(re)) {
    out.push({ channel: /email/i.test(m[1]!) ? "email" : "sms", reason: m[2] ?? "" });
  }
  return out;
}

function sentence(channel: Channel, reason: string, name: string): string {
  if (channel === "email") {
    if (BLOCKED.test(reason)) {
      return `Emails to ${name} are blocked because an earlier one bounced or was marked as spam.`;
    }
    if (BAD_ADDRESS.test(reason)) return `${name}'s email address doesn't look right.`;
    return `The email to ${name} didn't go through.`;
  }
  if (NO_CREDITS.test(reason)) return "You have no text credits left, so it couldn't go by text.";
  if (BAD_NUMBER.test(reason)) return `${name}'s mobile number couldn't be texted.`;
  return `The text to ${name} didn't go through.`;
}

/**
 * Null when the detail isn't a delivery failure (cooldown, nothing owed…), so the
 * caller can show the API's own sentence, which is already plain.
 */
export function deliveryFailure(
  detail: string | null | undefined,
  clientName: string | null,
): DeliveryFailure | null {
  if (!detail || !/could not be sent/i.test(detail)) return null;
  const parts = failures(detail);
  if (parts.length === 0) return null;
  const name = clientName || "this client";
  const lines = parts.map((p) => sentence(p.channel, p.reason, name));
  const profileFix = parts.some(
    (p) =>
      (p.channel === "email" && (BLOCKED.test(p.reason) || BAD_ADDRESS.test(p.reason))) ||
      (p.channel === "sms" && BAD_NUMBER.test(p.reason)),
  );
  const onlyEmail = parts.every((p) => p.channel === "email");
  if (profileFix) {
    lines.push(
      onlyEmail
        ? "Check their email address, or add a mobile number so it can go by text."
        : "Check their contact details on their profile.",
    );
  }
  return { message: lines.join(" "), checkProfile: profileFix };
}
