/**
 * The dashboard menu's shape (dashboard-refresh spec): Overview on its own, then
 * Favourites, then four sections grouped by job. Pure helpers so the arrangement,
 * favourites and badge counting can be tested without React.
 */

export type MenuSectionKey = "schedule" | "clients" | "offer" | "money";

export const MENU_SECTIONS: ReadonlyArray<{ key: MenuSectionKey; heading: string }> = [
  { key: "schedule", heading: "Schedule" },
  { key: "clients", heading: "Clients" },
  { key: "offer", heading: "What you offer" },
  { key: "money", heading: "Money" },
];

/** Which section a route belongs to. Overview belongs to none (it sits on top). */
export const MENU_SECTION_OF: Readonly<Record<string, MenuSectionKey>> = {
  "/calendar": "schedule",
  "/bookings": "schedule",
  "/events": "schedule",
  "/waitlist": "schedule",
  "/clients": "clients",
  "/vehicles": "clients",
  "/follow-ups": "clients",
  "/messages": "clients",
  "/referrals": "clients",
  "/services": "offer",
  "/consumables": "offer",
  "/packages": "offer",
  "/offer-links": "offer",
  "/locations": "offer",
  "/team": "offer",
  "/booking-page": "offer",
  "/payments": "money",
  "/invoices": "money",
  "/reports": "money",
};

export interface MenuEntry {
  to: string;
  label: string;
}

export interface ArrangedMenu<T extends MenuEntry> {
  overview: T | null;
  favourites: T[];
  sections: { key: MenuSectionKey; heading: string; items: T[] }[];
}

/**
 * Splits the visible items into Overview, Favourites (in the saved order) and the
 * sections. A favourited item leaves its section so it never appears twice; a
 * favourite that is no longer visible (permission removed, feature hidden) is
 * simply skipped. Empty sections are dropped.
 */
export function arrangeMenu<T extends MenuEntry>(
  items: readonly T[],
  saved: readonly string[],
): ArrangedMenu<T> {
  // Staff became Team; a favourite saved under the old path keeps its place.
  const favourites = saved.map((to) => (to === "/staff" ? "/team" : to));
  const byRoute = new Map(items.map((item) => [item.to, item]));
  const starred = new Set(favourites);
  const overview = byRoute.get("/") ?? null;
  const favouriteItems = favourites
    .map((to) => byRoute.get(to))
    .filter((item): item is T => Boolean(item) && item!.to !== "/");
  const sections = MENU_SECTIONS.map((section) => ({
    ...section,
    items: items.filter(
      (item) =>
        item.to !== "/" && MENU_SECTION_OF[item.to] === section.key && !starred.has(item.to),
    ),
  })).filter((section) => section.items.length > 0);
  return { overview, favourites: favouriteItems, sections };
}

export function toggleFavourite(favourites: readonly string[], to: string): string[] {
  return favourites.includes(to) ? favourites.filter((f) => f !== to) : [...favourites, to];
}

/** Moves a favourite one place up or down; out-of-range moves are no-ops. */
export function moveFavourite(
  favourites: readonly string[],
  to: string,
  direction: "up" | "down",
): string[] {
  const from = favourites.indexOf(to);
  if (from === -1) return [...favourites];
  const target = direction === "up" ? from - 1 : from + 1;
  if (target < 0 || target >= favourites.length) return [...favourites];
  const next = [...favourites];
  next.splice(from, 1);
  next.splice(target, 0, to);
  return next;
}

/** Drops a favourite in at the position of another (drag and drop). */
export function placeFavourite(
  favourites: readonly string[],
  moving: string,
  before: string,
): string[] {
  if (moving === before) return [...favourites];
  const without = favourites.filter((f) => f !== moving);
  const at = without.indexOf(before);
  if (at === -1) return [...favourites];
  without.splice(at, 0, moving);
  return without;
}

export type BadgeTone = "amber" | "mint" | "grey";

export interface MenuBadge {
  tone: BadgeTone;
  text: string;
  /** Draw a small dot instead of the text; `text` is still read out. */
  dot?: boolean;
}

/**
 * The amber bubble on the closed More button: how many rows inside need
 * attention (amber). Mint (new) and grey (information) badges wait until the
 * group is opened.
 */
export function alertCount(badges: ReadonlyArray<MenuBadge | null | undefined>): number {
  return badges.filter((b) => b?.tone === "amber").length;
}
