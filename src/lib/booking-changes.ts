import { formatDuration, formatMoney } from "./format.ts";

/**
 * One field of the structured diff the API records when staff edit a booking
 * (`kind: "amended"` history entries and the `booking.amended` event). Mirrors
 * the `BookingChange` OpenAPI schema, typed loosely so an unknown future field
 * still renders rather than crashing the history tab.
 */
export type BookingChangeLike = {
  field: string;
  from?: unknown;
  to?: unknown;
  currency?: string;
  end?: string;
};

type Ref = { id?: string; label?: string | null } | null | undefined;

function refLabel(ref: unknown, fallback: string): string {
  if (ref && typeof ref === "object") {
    const label = (ref as { label?: unknown }).label;
    if (typeof label === "string" && label.trim()) return label;
  }
  return fallback;
}

function list(value: unknown): string {
  return Array.isArray(value) && value.length > 0
    ? value.map((v) => String(v)).join(" + ")
    : "none";
}

/** Vertical nouns so the sentence reads "Detailer" / "Vehicle" rather than "Staff" / "Record". */
export type ChangeTerms = { staff: string; linkedRecord: string };

/**
 * Plain-English line for one change, e.g. "Service: Level 1 → Level 2" or
 * "Price: £350.00 → £750.00". `terms` supplies the vertical's nouns.
 */
export function describeBookingChange(change: BookingChangeLike, terms: ChangeTerms): string {
  const currency = change.currency ?? "GBP";
  switch (change.field) {
    case "services": {
      const from = Array.isArray(change.from) ? change.from : [];
      const to = Array.isArray(change.to) ? change.to : [];
      const noun = from.length > 1 || to.length > 1 ? "Services" : "Service";
      return `${noun}: ${list(from)} → ${list(to)}`;
    }
    case "price":
      return `Price: ${formatMoney(Number(change.from ?? 0), currency)} → ${formatMoney(Number(change.to ?? 0), currency)}`;
    case "deposit": {
      const fmt = (v: unknown) => (v == null ? "none" : formatMoney(Number(v), currency));
      return `Deposit: ${fmt(change.from)} → ${fmt(change.to)}`;
    }
    case "staff":
      return `${terms.staff}: ${refLabel(change.from, "unassigned")} → ${refLabel(change.to, "unassigned")}`;
    case "location":
      return `Location: ${refLabel(change.from, "—")} → ${refLabel(change.to, "—")}`;
    case "leadCustomer":
      return `Client: ${refLabel(change.from, "—")} → ${refLabel(change.to, "—")}`;
    case "linkedRecord": {
      const from = change.from as Ref;
      const to = change.to as Ref;
      if (!from && to) return `${terms.linkedRecord} added: ${refLabel(to, "—")}`;
      if (from && !to) return `${terms.linkedRecord} removed: ${refLabel(from, "—")}`;
      return `${terms.linkedRecord}: ${refLabel(from, "none")} → ${refLabel(to, "none")}`;
    }
    case "paymentMethod":
      return `Payment: ${paymentMethodLabel(change.from)} → ${paymentMethodLabel(change.to)}`;
    case "notesInternal": {
      const had = typeof change.from === "string" && change.from.trim() !== "";
      const has = typeof change.to === "string" && change.to.trim() !== "";
      return !had && has
        ? "Internal note added"
        : had && !has
          ? "Internal note removed"
          : "Internal note updated";
    }
    case "duration":
      return `Duration: ${formatDuration(Number(change.from ?? 0))} → ${formatDuration(Number(change.to ?? 0))}`;
    default: {
      const word = change.field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
      return `${word.charAt(0).toUpperCase()}${word.slice(1)} changed`;
    }
  }
}

export function paymentMethodLabel(method: unknown): string {
  switch (method) {
    case "none":
      return "pay up front";
    case "pay_later":
      return "pay after the job";
    case "bank_transfer":
      return "bank transfer";
    case "credit":
      return "package credit";
    default:
      return String(method ?? "—");
  }
}

/** One-line headline for the history row: what kind of edit it was, at a glance. */
export function summariseBookingChanges(
  changes: readonly BookingChangeLike[],
  terms: ChangeTerms,
): string {
  const fields = new Set(changes.map((c) => c.field));
  if (fields.size === 0) return "Booking edited";
  if (fields.size === 1 && fields.has("notesInternal")) return "Internal note edited";
  const parts: string[] = [];
  if (fields.has("services")) parts.push("services");
  if (fields.has("price") || fields.has("deposit")) parts.push("price");
  if (fields.has("staff")) parts.push(terms.staff.toLowerCase());
  if (fields.has("location")) parts.push("location");
  if (fields.has("leadCustomer")) parts.push("client");
  if (fields.has("linkedRecord")) parts.push(terms.linkedRecord.toLowerCase());
  if (fields.has("paymentMethod")) parts.push("payment");
  if (parts.length === 0) return "Booking edited";
  const joined =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
  return `Booking edited — ${joined}`;
}
