/**
 * Settings → Message templates helpers. The API owns the real renderer; these mirror
 * its placeholder rules closely enough to show an owner a live preview as they type,
 * and to keep the editor usable against an API that predates the list endpoint.
 */

export interface TemplatePlaceholder {
  /** As the owner types it, braces included, e.g. `{{first_name}}`. */
  token: string;
  aliases: string[];
  description: string;
  sample: string;
}

export interface MessageTemplate {
  key: string;
  label: string;
  description: string;
  defaultBodyRegion: string;
  bodyRegion: string;
  customised: boolean;
  placeholders: TemplatePlaceholder[];
}

export interface TemplateTerminology {
  staff: string;
  service: string;
  booking: string;
  linkedRecord: string;
}

/** `{{First_Name}}` → `firstname`, the shape the API resolves tokens by. */
export function canonicalToken(token: string): string {
  return token
    .replace(/[{}\s]/g, "")
    .replace(/_/g, "")
    .toLowerCase();
}

const TOKEN_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Preview substitution: fills each `{{token}}` from the placeholder samples (token
 * and aliases alike), case- and underscore-insensitively. Unknown tokens render
 * empty, as they do in the real message, and a missing greeting name is smoothed
 * ("Hi , your" → "Hi, your").
 */
export function fillPlaceholders(
  text: string,
  placeholders: readonly TemplatePlaceholder[],
): string {
  const lookup = new Map<string, string>();
  for (const p of placeholders) {
    lookup.set(canonicalToken(p.token), p.sample);
    for (const alias of p.aliases) lookup.set(canonicalToken(alias), p.sample);
  }
  return tidy(
    text.replace(TOKEN_PATTERN, (_m, raw: string) => lookup.get(canonicalToken(raw)) ?? ""),
  );
}

function tidy(text: string): string {
  return text.replace(/ +([,.;:!?])/g, "$1").replace(/ {2,}/g, " ");
}

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

function possessive(noun: string): string {
  return /s$/i.test(noun) ? `${noun}'` : `${noun}'s`;
}

/**
 * Editor content for an API that has no `GET …/notification-templates` yet: the same
 * keys and placeholder list the API exposes, worded from the tenant's terminology, with
 * no saved wording known (so the boxes start on the default). Kept minimal on purpose;
 * the API is the source of truth once it is live.
 */
export function fallbackTemplates(t: TemplateTerminology): MessageTemplate[] {
  const booking = t.booking.toLowerCase();
  const staffAlias = `{{${t.staff.replace(/\s+/g, "_").toLowerCase()}}}`;
  const recordToken = `{{${t.linkedRecord.replace(/\s+/g, "_").toLowerCase()}}}`;
  const bookingPlaceholders: TemplatePlaceholder[] = [
    { token: "{{first_name}}", aliases: [], description: "Customer's first name", sample: "Sam" },
    { token: "{{business}}", aliases: [], description: "Your business name", sample: "Northside" },
    { token: "{{service}}", aliases: [], description: `${t.service} name`, sample: "Full valet" },
    {
      token: "{{staff}}",
      aliases: Array.from(new Set([staffAlias, "{{trainer}}"])).filter((a) => a !== "{{staff}}"),
      description: `${possessive(t.staff)} name`,
      sample: "Alex",
    },
    {
      token: "{{date}}",
      aliases: [],
      description: `${t.booking} date`,
      sample: "Thursday 3 September",
    },
    { token: "{{time}}", aliases: [], description: `${t.booking} start time`, sample: "10:00 am" },
    { token: "{{location}}", aliases: [], description: "Location name", sample: "Main site" },
    {
      token: "{{reference}}",
      aliases: [],
      description: `${t.booking} reference`,
      sample: "BK-4821",
    },
    {
      token: recordToken,
      aliases: recordToken === "{{linked_record}}" ? [] : ["{{linked_record}}"],
      description: `${t.linkedRecord} on the ${booking} (empty if none)`,
      sample: t.linkedRecord.toLowerCase() === "vehicle" ? "AB12 CDE" : "Record 1",
    },
  ];
  const make = (
    key: string,
    label: string,
    description: string,
    defaultBodyRegion: string,
  ): MessageTemplate => ({
    key,
    label,
    description,
    defaultBodyRegion,
    bodyRegion: defaultBodyRegion,
    customised: false,
    placeholders: bookingPlaceholders,
  });
  return [
    make(
      "booking_confirmation",
      `${t.booking} confirmation`,
      `Sent when a ${booking} is confirmed.`,
      `Hi {{first_name}}, your ${booking} with {{business}} is confirmed. Here are the details.`,
    ),
    make(
      "reminder",
      `${t.booking} reminder`,
      `Sent before each ${booking}, at the times set in your reminder rules.`,
      `Hi {{first_name}}, a quick reminder about your upcoming ${booking}.`,
    ),
    make(
      "reschedule",
      `${t.booking} moved`,
      `Sent when a ${booking} is moved to a new time.`,
      `Hi {{first_name}}, your ${booking} has been moved. The new details are below.`,
    ),
    make(
      "cancellation",
      `${t.booking} cancelled`,
      `Sent when a ${booking} is cancelled.`,
      `Hi {{first_name}}, this ${booking} is no longer going ahead. Nothing further is needed from you.`,
    ),
  ];
}
