/**
 * The free-text that rides along with a booking: what the client typed when they
 * booked, and what staff wrote for themselves. Both are easy to miss at the bottom
 * of the Details tab, so the drawer flags them up top when either is present.
 */
export interface BookingNotes {
  /** What the client wrote on the booking form; null when blank. */
  customer: string | null;
  /** Staff-only notes; null when blank. */
  internal: string | null;
}

export function bookingNotes(booking: {
  notesCustomer?: string | null;
  notesInternal?: string | null;
}): BookingNotes {
  return {
    customer: clean(booking.notesCustomer),
    internal: clean(booking.notesInternal),
  };
}

export function hasBookingNotes(notes: BookingNotes): boolean {
  return notes.customer !== null || notes.internal !== null;
}

/** "Notes on this booking" / "Note from the client" — the pill text up top. */
export function bookingNotesLabel(notes: BookingNotes): string | null {
  if (notes.customer && notes.internal) return "Notes on this booking";
  if (notes.customer) return "Note from the client";
  if (notes.internal) return "Internal note";
  return null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
