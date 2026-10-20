/**
 * One-line description of a linked record, mirroring the API's
 * `summariseLinkedRecord` so what staff pick in the portal is the same text the
 * invoice PDF and email print: the first few inline-friendly, staff-visible
 * values in display order ("EO76 ZWZ · Audi · RS5"), falling back to the
 * display label when the record has no such values.
 */

const SUMMARY_DATA_TYPES: ReadonlySet<string> = new Set([
  "short_text",
  "integer",
  "decimal",
  "single_select",
]);

const SUMMARY_MAX_PARTS = 3;

/**
 * Fields that describe a visit rather than the thing itself: mileage changes every
 * time a car comes in, and a bare "45210" beside the plate reads as anything. Kept
 * in step with the API's list.
 */
export const SUMMARY_SKIPPED_FIELD_KEYS: ReadonlySet<string> = new Set(["mileage"]);

/** "45,210 miles"; null when the value isn't a whole, non-negative number. */
export function mileageLabel(value: unknown): string | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return null;
  return `${n.toLocaleString("en-GB")} ${n === 1 ? "mile" : "miles"}`;
}

export type SummaryField = {
  fieldKey: string;
  dataType: string;
  displayOrder: number;
  status: "active" | "archived";
  staffVisible: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * The definition endpoint hands fields over untyped; keep only what the summary
 * needs and ignore anything malformed rather than guessing at it.
 */
export function summaryFieldsOf(fields: ReadonlyArray<Record<string, unknown>> | undefined) {
  const out: SummaryField[] = [];
  for (const f of fields ?? []) {
    if (typeof f.fieldKey !== "string" || typeof f.dataType !== "string") continue;
    const visibility = isRecord(f.visibility) ? f.visibility : {};
    const constraints = isRecord(f.constraints) ? f.constraints : {};
    const options = Array.isArray(constraints.options)
      ? constraints.options.filter(
          (o): o is { value: string; label: string } =>
            isRecord(o) && typeof o.value === "string" && typeof o.label === "string",
        )
      : [];
    out.push({
      fieldKey: f.fieldKey,
      dataType: f.dataType,
      displayOrder: typeof f.displayOrder === "number" ? f.displayOrder : Number.MAX_SAFE_INTEGER,
      status: f.status === "archived" ? "archived" : "active",
      // Older definitions may omit visibility; the API defaults it to staff-visible.
      staffVisible: visibility.staffVisible !== false,
      options,
    });
  }
  return out;
}

export function summariseLinkedRecord(
  record: { displayLabel: string; values?: Record<string, unknown> | null },
  fields: ReadonlyArray<SummaryField>,
): string {
  const ordered = fields
    .filter(
      (f) =>
        f.status === "active" &&
        f.staffVisible &&
        SUMMARY_DATA_TYPES.has(f.dataType) &&
        !SUMMARY_SKIPPED_FIELD_KEYS.has(f.fieldKey),
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const values = record.values ?? {};
  const parts: string[] = [];
  for (const field of ordered) {
    if (parts.length >= SUMMARY_MAX_PARTS) break;
    const raw = values[field.fieldKey];
    let text: string | null = null;
    if (typeof raw === "string" && raw.trim() !== "") {
      text = raw.trim();
      if (field.dataType === "single_select") {
        text = field.options.find((o) => o.value === text)?.label ?? text;
      }
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      text = String(raw);
    }
    if (text !== null) parts.push(text);
  }
  return parts.length > 0 ? parts.join(" · ") : record.displayLabel;
}
