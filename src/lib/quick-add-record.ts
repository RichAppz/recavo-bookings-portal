/**
 * Pure helpers behind the linked-record forms (vehicle quick-add in Add booking,
 * the full record dialog). Kept free of React so the rules — which fields to ask
 * for, how typed text becomes a record, when the form counts as "something typed"
 * — can be unit tested.
 */

export type LinkedRecordField = {
  fieldKey: string;
  label: string;
  helpText?: string | null;
  dataType: string;
  required: boolean;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    options?: { value: string; label: string }[];
    maxItems?: number;
  };
  displayOrder?: number;
  status?: string;
};

/** Field types we can't yet edit from the dynamic forms (uploads, cross-record refs, multi-select). */
export const UNSUPPORTED_FIELD_TYPES = new Set(["image", "file", "reference", "multi_select"]);

/** Turns a raw string/boolean input into the typed value the API expects, or undefined when blank. */
export function coerceFieldValue(field: LinkedRecordField, raw: unknown): unknown {
  if (field.dataType === "boolean") return Boolean(raw);
  if (raw === "" || raw === undefined || raw === null) return undefined;
  if (field.dataType === "integer") {
    const n = parseInt(String(raw), 10);
    return Number.isNaN(n) ? undefined : n;
  }
  if (field.dataType === "decimal") {
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }
  return String(raw);
}

/**
 * The handful of fields worth asking for when the customer is standing at the
 * counter: everything required, then the first optional short-text fields, three
 * at most. For the vehicle template that's Registration, Make, Model.
 */
export function quickAddFields(fields: LinkedRecordField[]): LinkedRecordField[] {
  const usable = fields.filter((f) => !UNSUPPORTED_FIELD_TYPES.has(f.dataType));
  const required = usable.filter((f) => f.required);
  const optional = usable.filter((f) => !f.required && f.dataType === "short_text");
  return [...required, ...optional].slice(0, Math.max(3, required.length));
}

/** True when anything non-blank has been typed into the quick-add row. */
export function hasQuickAddInput(values: Record<string, string | undefined>): boolean {
  return Object.values(values).some((v) => (v ?? "").trim() !== "");
}

export type QuickAddRecord =
  /** Nothing typed — there is no record to make. */
  | { kind: "empty" }
  /** A required field is blank; `errors` is keyed by fieldKey. */
  | { kind: "invalid"; errors: Record<string, string> }
  /** The body to POST. */
  | { kind: "ok"; displayLabel: string; values: Record<string, unknown> };

/**
 * Turns what was typed into the quick-add row into a create-record body.
 *
 * The label reads "Ford Focus · AB12 CDE" rather than following field order: the
 * identifier is whatever's required, or failing that the first (searched) field,
 * and the descriptive fields go in front of it.
 */
export function buildQuickAddRecord(
  quick: LinkedRecordField[],
  values: Record<string, string | undefined>,
  term: string,
): QuickAddRecord {
  const errors: Record<string, string> = {};
  const payload: Record<string, unknown> = {};
  for (const f of quick) {
    const coerced = coerceFieldValue(f, values[f.fieldKey]?.trim());
    if (f.required && (coerced === undefined || coerced === "")) {
      errors[f.fieldKey] = "Required";
      continue;
    }
    if (coerced !== undefined) payload[f.fieldKey] = coerced;
  }
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors };
  // Nothing is required any more, but a record with nothing in it helps nobody.
  if (Object.keys(payload).length === 0) return { kind: "empty" };

  const identifyingFields = quick.some((f) => f.required)
    ? quick.filter((f) => f.required)
    : quick.slice(0, 1);
  const descriptive = quick
    .filter((f) => !identifyingFields.includes(f))
    .map((f) => payload[f.fieldKey])
    .filter((v) => v !== undefined && v !== "")
    .join(" ");
  const identifying = identifyingFields
    .map((f) => payload[f.fieldKey])
    .filter((v) => v !== undefined && v !== "")
    .join(" ");
  const displayLabel = [descriptive, identifying].filter(Boolean).join(" · ") || term;
  return { kind: "ok", displayLabel, values: payload };
}
