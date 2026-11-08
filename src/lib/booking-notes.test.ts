import assert from "node:assert/strict";
import { test } from "node:test";

import { bookingNotes, bookingNotesLabel, hasBookingNotes } from "./booking-notes.ts";

test("blank and whitespace-only notes count as none", () => {
  for (const booking of [
    {},
    { notesCustomer: null, notesInternal: null },
    { notesCustomer: "   ", notesInternal: "\n\t" },
  ]) {
    const notes = bookingNotes(booking);
    assert.equal(hasBookingNotes(notes), false);
    assert.equal(bookingNotesLabel(notes), null);
  }
});

test("trims the text and keeps the two kinds apart", () => {
  const notes = bookingNotes({ notesCustomer: "  Gate code 4411 ", notesInternal: null });
  assert.deepEqual(notes, { customer: "Gate code 4411", internal: null });
  assert.equal(hasBookingNotes(notes), true);
});

test("the pill says who the note is from", () => {
  assert.equal(
    bookingNotesLabel(bookingNotes({ notesCustomer: "Park round the back" })),
    "Note from the client",
  );
  assert.equal(
    bookingNotesLabel(bookingNotes({ notesInternal: "Bring the ladder" })),
    "Internal note",
  );
  assert.equal(
    bookingNotesLabel(bookingNotes({ notesCustomer: "Dog in the garden", notesInternal: "Cash" })),
    "Notes on this booking",
  );
});
