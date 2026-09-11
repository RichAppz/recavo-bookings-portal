/**
 * Settings → Message templates helpers. The API owns the one and only renderer — the
 * same code that sends a message renders the settings preview (`POST
 * …/notification-templates/preview`) — so nothing here renders wording. These helpers
 * only flag placeholders the message will not fill and size a text message.
 */
import type { components } from "@/lib/api/schema";

export type MessageTemplate = components["schemas"]["MessageTemplate"];
export type TemplatePlaceholder = MessageTemplate["placeholders"][number];
export type TemplateChannel = components["schemas"]["MessageTemplateChannel"];
export type TemplatePreview = components["schemas"]["MessageTemplatePreview"];

/** `{{First_Name}}` → `firstname`, the shape the API resolves tokens by. */
export function canonicalToken(token: string): string {
  return token
    .replace(/[{}\s]/g, "")
    .replace(/_/g, "")
    .toLowerCase();
}

const TOKEN_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

/** Tokens in `text` that none of the placeholders (or their aliases) recognise. */
export function unknownPlaceholders(
  text: string,
  placeholders: readonly TemplatePlaceholder[],
): string[] {
  const known = new Set<string>();
  for (const p of placeholders) {
    known.add(canonicalToken(p.token));
    for (const alias of p.aliases) known.add(canonicalToken(alias));
  }
  const out: string[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const raw = match[1] ?? "";
    if (!known.has(canonicalToken(raw)) && !out.includes(`{{${raw}}}`)) out.push(`{{${raw}}}`);
  }
  return out;
}

/**
 * A text over this many characters (as sent, link included) is flagged in the editor:
 * the API caps texts at 306 characters (two GSM-7 segments) and truncates the wording
 * beyond that, so anything close to the cap risks being cut.
 */
export const SMS_WARN_LENGTH = 300;

/** The API refuses text wording longer than this. */
export const SMS_TEMPLATE_MAX_LENGTH = 600;

/** GSM-7 segments a text of this length bills as (160 single, then 153 per part). */
export function smsSegments(length: number): number {
  if (length <= 160) return 1;
  return Math.ceil(length / 153);
}

/** "1 segment" / "2 segments" — what the text costs the business to send. */
export function describeSmsSize(length: number): string {
  const segments = smsSegments(length);
  return `${length} characters · ${segments} ${segments === 1 ? "segment" : "segments"}`;
}
