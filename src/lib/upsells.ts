/**
 * Upsell editor rows: the form holds text so a half-typed price never bounces back;
 * these convert to and from the API shape and validate before saving.
 */
import type { ServiceUpsell } from "@/lib/api/types";
import { MAX_UPSELL_PITCH_LENGTH } from "@/lib/api/upsells";
import type { UpsellItemInput } from "@/lib/api/upsells";
import { parseMoneyToMinor } from "@/lib/format";

export type UpsellRow = {
  upsellServiceId: string;
  /** Major units as typed ("45", "45.00"); empty = the add-on's own price. */
  price: string;
  pitch: string;
};

export function rowsFromUpsells(items: readonly ServiceUpsell[]): UpsellRow[] {
  return items.map((u) => ({
    upsellServiceId: u.upsellServiceId,
    price: u.priceMinor === null ? "" : String(u.priceMinor / 100),
    pitch: u.pitch ?? "",
  }));
}

/** Validates the rows; on failure names the first bad row so the editor can flag it. */
export function rowsToUpsellItems(
  rows: readonly UpsellRow[],
): { ok: true; items: UpsellItemInput[] } | { ok: false; index: number; message: string } {
  const items: UpsellItemInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (!row.upsellServiceId) return { ok: false, index: i, message: "Pick a service." };
    if (seen.has(row.upsellServiceId)) {
      return { ok: false, index: i, message: "That service is already listed." };
    }
    seen.add(row.upsellServiceId);
    let priceMinor: number | null = null;
    if (row.price.trim()) {
      try {
        priceMinor = parseMoneyToMinor(row.price.trim());
      } catch {
        return { ok: false, index: i, message: "Enter a price like 45 or 45.50." };
      }
      if (priceMinor < 0) return { ok: false, index: i, message: "Price can't be negative." };
    }
    const pitch = row.pitch.trim();
    if (pitch.length > MAX_UPSELL_PITCH_LENGTH) {
      return {
        ok: false,
        index: i,
        message: `Keep the pitch under ${MAX_UPSELL_PITCH_LENGTH} characters.`,
      };
    }
    items.push({ upsellServiceId: row.upsellServiceId, priceMinor, pitch: pitch || null });
  }
  return { ok: true, items };
}
