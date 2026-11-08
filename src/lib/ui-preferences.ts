/**
 * Console layout choices saved per person (dashboard-refresh spec): menu collapsed
 * or not, which sections are folded, favourites and their order, whether the More
 * group is open. The API keeps the document so it follows the person across
 * devices; a copy in localStorage gives the first paint on this device the right
 * shape before the network answers.
 */
export interface UiPreferences {
  menuCollapsed?: boolean;
  moreOpen?: boolean;
  closedSections?: string[];
  favourites?: string[];
}

export const UI_PREFERENCES_KEY = "recavo.ui-preferences";

const MAX_SECTIONS = 20;
const MAX_FAVOURITES = 40;

function stringList(value: unknown, max: number, test: (s: string) => boolean): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string" && v.length > 0 && test(v) && !out.includes(v)) out.push(v);
    if (out.length === max) break;
  }
  return out;
}

/** Keeps only what the API accepts, so a stale or hand-edited copy cannot break the shell. */
export function parseUiPreferences(value: unknown): UiPreferences {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const out: UiPreferences = {};
  if (typeof v.menuCollapsed === "boolean") out.menuCollapsed = v.menuCollapsed;
  if (typeof v.moreOpen === "boolean") out.moreOpen = v.moreOpen;
  const sections = stringList(v.closedSections, MAX_SECTIONS, (s) => s.length <= 40);
  if (sections.length) out.closedSections = sections;
  const favourites = stringList(
    v.favourites,
    MAX_FAVOURITES,
    (s) => s.startsWith("/") && s.length <= 120,
  );
  if (favourites.length) out.favourites = favourites;
  return out;
}

/** Applies a change on top of the current document, dropping keys set to undefined. */
export function withPreference(current: UiPreferences, patch: UiPreferences): UiPreferences {
  const next: UiPreferences = { ...current };
  for (const [key, value] of Object.entries(patch) as [keyof UiPreferences, unknown][]) {
    if (value === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
  }
  return parseUiPreferences(next);
}

export function samePreferences(a: UiPreferences, b: UiPreferences): boolean {
  return JSON.stringify(parseUiPreferences(a)) === JSON.stringify(parseUiPreferences(b));
}
