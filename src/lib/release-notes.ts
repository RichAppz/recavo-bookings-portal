/**
 * "What's new" — a hand-written log of what has shipped to businesses.
 *
 * Add an entry at the TOP of `RELEASE_NOTES` in `src/content/release-notes.ts`
 * with every user-facing change. Same-day changes share one entry. Keep to what
 * a business owner can see or do differently; internal work doesn't belong here.
 */

export type ReleaseKind = "new" | "improved" | "fixed";

export type ReleaseItem = {
  kind: ReleaseKind;
  /** One plain-English sentence, present tense, no trailing full stop needed. */
  text: string;
  /** Where to see it, e.g. "Bookings → open a booking". */
  where?: string;
};

export type ReleaseNote = {
  /** ISO date `YYYY-MM-DD`; doubles as the entry's id and the "seen up to" marker. */
  date: string;
  /** Short headline for the day's release. */
  title: string;
  items: ReleaseItem[];
};

export const KIND_LABEL: Record<ReleaseKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

export const LAST_SEEN_KEY = "recavo.whats-new.seen";

/** Fired on `window` after the What's new page records that everything has been seen. */
export const SEEN_EVENT = "recavo:whats-new-seen";

/** Newest entry's date, or "" when there are none. Notes must be newest-first. */
export function latestReleaseDate(notes: readonly ReleaseNote[]): string {
  return notes[0]?.date ?? "";
}

/** How many entries are newer than the date the user last saw. Unknown/blank = all. */
export function unseenReleases(notes: readonly ReleaseNote[], lastSeen: string | null): number {
  if (!lastSeen) return notes.length;
  return notes.filter((n) => n.date > lastSeen).length;
}

/** Entries must be sorted newest-first with unique dates; used by the test. */
export function validateReleaseNotes(notes: readonly ReleaseNote[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) problems.push(`${n.date}: not YYYY-MM-DD`);
    if (seen.has(n.date)) problems.push(`${n.date}: duplicate date`);
    seen.add(n.date);
    const prev = notes[i - 1];
    if (prev && prev.date < n.date) problems.push(`${n.date}: out of order (after ${prev.date})`);
    if (!n.title.trim()) problems.push(`${n.date}: missing title`);
    if (n.items.length === 0) problems.push(`${n.date}: no items`);
    for (const it of n.items) if (!it.text.trim()) problems.push(`${n.date}: empty item`);
  }
  return problems;
}
