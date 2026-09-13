/**
 * Services carry a free-text `category` ("Polishing", "Valeting") so a long
 * catalogue reads as a few groups rather than one flat list. These helpers keep
 * the grouping and the "whole category" filter consistent everywhere it shows up.
 */

type Categorised = { category: string | null };

export type CategoryGroup<T extends Categorised> = {
  /** Null for services with no category; that group is always listed last. */
  category: string | null;
  items: T[];
};

/** Trimmed category, or null when blank — the two are the same thing to a person. */
export function normaliseCategory(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Group in alphabetical category order, preserving the incoming order within each
 * group. Categories compare case-insensitively so "polishing" and "Polishing"
 * typed on different days land together.
 */
export function groupByCategory<T extends Categorised>(items: readonly T[]): CategoryGroup<T>[] {
  const groups = new Map<string, CategoryGroup<T>>();
  let uncategorised: T[] = [];
  for (const item of items) {
    const category = normaliseCategory(item.category);
    if (!category) {
      uncategorised = [...uncategorised, item];
      continue;
    }
    const key = category.toLowerCase();
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { category, items: [item] });
  }
  const sorted = [...groups.values()].sort((a, b) =>
    a.category!.localeCompare(b.category!, undefined, { sensitivity: "base" }),
  );
  return uncategorised.length > 0 ? [...sorted, { category: null, items: uncategorised }] : sorted;
}

/** Distinct category names, alphabetical — for suggestions when typing a new one. */
export function knownCategories(items: readonly Categorised[]): string[] {
  return groupByCategory(items)
    .map((g) => g.category)
    .filter((c): c is string => c != null);
}

/** True once at least one service has a category, i.e. grouping is worth showing. */
export function hasCategories(items: readonly Categorised[]): boolean {
  return items.some((s) => normaliseCategory(s.category) != null);
}

const CATEGORY_FILTER_PREFIX = "category:";

/** Filter value meaning "every service in this category". */
export function categoryFilterValue(category: string): string {
  return `${CATEGORY_FILTER_PREFIX}${category}`;
}

/**
 * Does a service satisfy a filter value? The value is "all", a service id, or a
 * whole-category token from `categoryFilterValue`.
 */
export function matchesServiceFilter(
  filter: string,
  service: { id: string; category: string | null } | undefined,
): boolean {
  if (filter === "all") return true;
  if (!service) return false;
  if (filter.startsWith(CATEGORY_FILTER_PREFIX)) {
    const wanted = filter.slice(CATEGORY_FILTER_PREFIX.length).toLowerCase();
    return normaliseCategory(service.category)?.toLowerCase() === wanted;
  }
  return service.id === filter;
}

/** Is this filter value still meaningful for the current catalogue? */
export function serviceFilterExists(
  filter: string,
  services: readonly { id: string; category: string | null }[],
): boolean {
  if (filter === "all") return true;
  return services.some((s) => matchesServiceFilter(filter, s));
}
