/**
 * The lift a client needs once they have dropped their vehicle off — a one-person
 * detailer runs them home or to the station. Mirrors the API's `Booking.clientLift`:
 * null means no lift, otherwise `{ destination, notes }` with either part nullable.
 * Automotive only in the UI (`industryTemplateKey === "car_detailing"`).
 */
export type ClientLift = { destination: string | null; notes: string | null };

/** What the two form fields hold while staff type; blanks become null on send. */
export type ClientLiftDraft = { needed: boolean; destination: string; notes: string };

export const EMPTY_LIFT_DRAFT: ClientLiftDraft = { needed: false, destination: "", notes: "" };

/** Form state for an existing booking's lift, so "Edit booking" opens on what is saved. */
export function draftFromClientLift(lift: ClientLift | null | undefined): ClientLiftDraft {
  if (!lift) return EMPTY_LIFT_DRAFT;
  return { needed: true, destination: lift.destination ?? "", notes: lift.notes ?? "" };
}

/** The API value for a draft: null when the toggle is off, trimmed strings otherwise. */
export function clientLiftFromDraft(draft: ClientLiftDraft): ClientLift | null {
  if (!draft.needed) return null;
  return {
    destination: draft.destination.trim() || null,
    notes: draft.notes.trim() || null,
  };
}

export function sameClientLift(
  a: ClientLift | null | undefined,
  b: ClientLift | null | undefined,
): boolean {
  if (!a || !b) return !a === !b;
  return (
    (a.destination ?? null) === (b.destination ?? null) && (a.notes ?? null) === (b.notes ?? null)
  );
}

/**
 * "Drop client at Train station · back at 5pm" — the one-line detail for the booking
 * panel. Falls back to "Lift needed" when staff have not said where yet.
 */
export function describeClientLift(lift: ClientLift | null | undefined): string | null {
  if (!lift) return null;
  const where = lift.destination?.trim();
  const note = lift.notes?.trim();
  const head = where ? `Drop client at ${where}` : "Lift needed";
  return note ? `${head} · ${lowerFirst(note)}` : head;
}

/** The customer-facing line on their own booking, worded as the confirmation is. */
export function describeClientLiftForCustomer(
  lift: ClientLift | null | undefined,
  recordNoun = "vehicle",
): string | null {
  const where = lift?.destination?.trim();
  if (!where) return null;
  return `We'll drop you at ${where} after you drop your ${recordNoun.toLowerCase()} off.`;
}

/** History line for a `clientLift` change: added / removed / changed, with the destinations. */
export function describeClientLiftChange(from: unknown, to: unknown): string {
  const before = asLift(from);
  const after = asLift(to);
  const label = (lift: ClientLift | null) => lift?.destination?.trim() || "no destination";
  if (!before && after) return `Lift added: ${label(after)}`;
  if (before && !after) return `Lift removed: ${label(before)}`;
  if (before && after && (before.destination ?? null) !== (after.destination ?? null)) {
    return `Lift: ${label(before)} → ${label(after)}`;
  }
  return "Lift note updated";
}

function asLift(value: unknown): ClientLift | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { destination?: unknown; notes?: unknown };
  return {
    destination: typeof v.destination === "string" ? v.destination : null,
    notes: typeof v.notes === "string" ? v.notes : null,
  };
}

function lowerFirst(text: string): string {
  // Keep an intentional proper noun ("Back at 5pm" → "back at 5pm"; "ASAP" stays).
  if (text.length > 1 && text[1] === text[1]!.toUpperCase() && /[A-Z]/.test(text[1]!)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}
