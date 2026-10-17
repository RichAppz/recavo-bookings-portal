/**
 * The booking page a client was last on, so the sign-in page can offer
 * "Back to {business}". Kept for the tab only: a bookmark opened next week is
 * not "coming from" anywhere.
 */
export type CameFrom = { slug: string; name: string };

const KEY = "recavo:came-from";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function tabStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    // Private mode on some browsers throws on access.
    return null;
  }
}

export function rememberCameFrom(from: CameFrom, storage: StorageLike | null = tabStorage()) {
  try {
    storage?.setItem(KEY, JSON.stringify(from));
  } catch {
    // Full or blocked storage just means no back link.
  }
}

export function recallCameFrom(storage: StorageLike | null = tabStorage()): CameFrom | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as CameFrom).slug === "string" &&
      (parsed as CameFrom).slug.length > 0 &&
      typeof (parsed as CameFrom).name === "string" &&
      (parsed as CameFrom).name.length > 0
    ) {
      return { slug: (parsed as CameFrom).slug, name: (parsed as CameFrom).name };
    }
    return null;
  } catch {
    return null;
  }
}
