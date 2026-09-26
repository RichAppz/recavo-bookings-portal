import { useCallback, useEffect, useState } from "react";

/**
 * Which Overview cards a person has chosen to hide.
 *
 * A detailer who never sells packages doesn't want a credits chart on every
 * open, so each card carries an eye icon and the choice is kept on the device,
 * per business (a user who runs two businesses may want different views).
 * "Today" is never hideable — it is the point of the page.
 */
export type OverviewCardKey = "stats" | "money" | "attendance" | "tasks" | "quick";

export const OVERVIEW_CARDS: readonly OverviewCardKey[] = [
  "stats",
  "money",
  "attendance",
  "tasks",
  "quick",
];

const storageKey = (businessId: string) => `recavo.overview.hidden.${businessId}`;

function read(businessId: string): Set<OverviewCardKey> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(businessId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((k): k is OverviewCardKey => OVERVIEW_CARDS.includes(k as OverviewCardKey))
        : [],
    );
  } catch {
    return new Set();
  }
}

function write(businessId: string, hidden: Set<OverviewCardKey>) {
  try {
    if (hidden.size === 0) localStorage.removeItem(storageKey(businessId));
    else localStorage.setItem(storageKey(businessId), JSON.stringify([...hidden]));
  } catch {
    // Private mode / quota: the choice lasts for this session only.
  }
}

export function useHiddenOverviewCards(businessId: string | null | undefined) {
  const [hidden, setHidden] = useState<Set<OverviewCardKey>>(() => new Set());

  // Read after mount (SSR renders everything) and again if the business changes.
  useEffect(() => {
    setHidden(businessId ? read(businessId) : new Set());
  }, [businessId]);

  const setCardHidden = useCallback(
    (key: OverviewCardKey, value: boolean) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (value) next.add(key);
        else next.delete(key);
        if (businessId) write(businessId, next);
        return next;
      });
    },
    [businessId],
  );

  return {
    isHidden: (key: OverviewCardKey) => hidden.has(key),
    hiddenCount: hidden.size,
    hide: (key: OverviewCardKey) => setCardHidden(key, true),
    show: (key: OverviewCardKey) => setCardHidden(key, false),
    setCardHidden,
  };
}
