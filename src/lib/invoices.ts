/**
 * Pure invoice helpers — no React, no network — so the rules the UI relies on
 * (what a status allows, when VAT shows, how the next number will look) can be
 * unit-tested and shared between the staff console and the customer account.
 *
 * Mirrors the RECAVO API's invoices module (ADR 0019). Anything the API decides
 * (totals, numbering, snapshots) is displayed as given, never recomputed here.
 */

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";
export type InvoiceOrigin = "manual" | "booking_completed";
export type InvoiceTaxTreatment = "vat_registered" | "not_vat_registered";

export type InvoiceAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

export type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxable: boolean;
  netMinor: number;
  vatMinor: number;
  totalMinor: number;
  serviceId: string | null;
};

export type InvoiceSeller = {
  legalName: string;
  tradingName: string;
  vatNumber: string | null;
  address: InvoiceAddress | null;
  email: string | null;
  phone: string | null;
  logoUrl: string | null;
  accentColour: string | null;
  locale: string;
  timezone: string;
};

export type InvoiceBillTo = {
  name: string;
  email: string | null;
  address: InvoiceAddress | null;
};

export type InvoicePaymentInstructions = {
  accountName: string;
  sortCode: string;
  accountNumber: string;
  iban: string | null;
  bic: string | null;
};

export type Invoice = {
  id: string;
  businessId: string;
  /** Null while draft; allocated on issue and never reused. */
  number: string | null;
  status: InvoiceStatus;
  origin: InvoiceOrigin;
  bookingId: string | null;
  bookingReference: string | null;
  customerId: string;
  currency: string;
  /** YYYY-MM-DD in the business timezone. */
  issueDate: string | null;
  /** YYYY-MM-DD in the business timezone. */
  dueDate: string | null;
  lines: InvoiceLine[];
  subtotalMinor: number;
  vatMinor: number;
  totalMinor: number;
  paidMinor: number;
  vatRateBps: number | null;
  pricesIncludeVat: boolean;
  taxTreatment: InvoiceTaxTreatment;
  seller: InvoiceSeller;
  billTo: InvoiceBillTo;
  paymentInstructions: InvoicePaymentInstructions | null;
  notes: string | null;
  footerNote: string | null;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdActorId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxable?: boolean;
  serviceId?: string | null;
};

export type CreateInvoiceBody = {
  bookingId?: string;
  customerId?: string;
  lines?: InvoiceLineInput[];
  dueDate?: string;
  notes?: string | null;
};

export type UpdateInvoiceBody = {
  lines?: InvoiceLineInput[];
  dueDate?: string | null;
  notes?: string | null;
  customerId?: string;
};

/** Plan feature key and the bolt-on key that grants it (Growth includes it). */
export const INVOICING_FEATURE_KEY = "invoicing";
export const INVOICING_ADDON_KEY = "invoicing";

export const INVOICE_STATUSES: readonly InvoiceStatus[] = ["draft", "issued", "paid", "void"];

/** Server defaults when the business has never saved the invoicing card. */
export const DEFAULT_NUMBER_PREFIX = "INV-";
export const DEFAULT_DUE_DAYS = 0;

/**
 * Invoicing / tax fields that are not on the committed OpenAPI snapshot yet, so
 * the generated `BusinessConfiguration` type omits them. Read and patch through
 * this shape until `openapi.json` is refreshed.
 */
export type InvoicingConfig = {
  autoSendOnCompletion?: boolean;
  numberPrefix?: string;
  dueDays?: number;
  footerNote?: string | null;
};

export type TaxConfig = {
  vatRegistered?: boolean;
  vatNumber?: string | null;
  /** Basis points: 2000 = 20%. */
  vatRateBps?: number | null;
  /** True: entered prices are gross and VAT is backed out. False: VAT is added on top. */
  pricesIncludeVat?: boolean;
};

export type InvoiceAction = "edit" | "issue" | "send" | "markPaid" | "void" | "pdf";

/**
 * What each status allows (guide §5). Anything else is a 409 from the API, so
 * buttons are driven from here rather than letting users find out the hard way.
 */
const ACTIONS_BY_STATUS: Record<InvoiceStatus, ReadonlySet<InvoiceAction>> = {
  draft: new Set(["edit", "issue", "void", "pdf"]),
  issued: new Set(["send", "markPaid", "void", "pdf"]),
  paid: new Set(["send", "void", "pdf"]),
  void: new Set(["pdf"]),
};

export function invoiceAllows(status: InvoiceStatus, action: InvoiceAction): boolean {
  return ACTIONS_BY_STATUS[status]?.has(action) ?? false;
}

/** Statuses a customer can see in their account; drafts and voids are 404 to them. */
export function isCustomerVisible(status: InvoiceStatus): boolean {
  return status === "issued" || status === "paid";
}

/** Balance due, clamped at zero (a fully-paid booking can pre-fill paidMinor above total). */
export function invoiceBalanceMinor(invoice: Pick<Invoice, "totalMinor" | "paidMinor">): number {
  return Math.max(0, invoice.totalMinor - invoice.paidMinor);
}

/**
 * Whether to render the VAT column and the "VAT @ 20%" row — the same rule the
 * PDF applies: a registered business with no rate set shows totals only.
 */
export function showsVat(invoice: Pick<Invoice, "vatRateBps" | "taxTreatment">): boolean {
  return (
    invoice.taxTreatment === "vat_registered" &&
    invoice.vatRateBps !== null &&
    invoice.vatRateBps > 0
  );
}

/** Basis points → the percentage a person types: `2000` → `"20"`, `1750` → `"17.5"`, unset → `""`. */
export function bpsToPercentInput(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "";
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(2)));
}

/**
 * Typed percentage → basis points. Empty means "no rate" (`null`); anything outside
 * 0–100 or non-numeric is `undefined` so the form can refuse to save.
 */
export function percentInputToBps(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const pct = Number(trimmed);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return undefined;
  return Math.round(pct * 100);
}

/** `2000` → `"20%"`, `1750` → `"17.5%"`. */
export function formatVatRate(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, "")}%`;
}

export const NUMBER_PREFIX_MAX_LENGTH = 12;
export const NUMBER_PREFIX_PATTERN = /^[A-Za-z0-9_-]*$/;

export function isValidNumberPrefix(prefix: string): boolean {
  return prefix.length <= NUMBER_PREFIX_MAX_LENGTH && NUMBER_PREFIX_PATTERN.test(prefix);
}

/** What the next invoice will be called — `INV-0001` style, as the API pads to four digits. */
export function nextInvoiceNumberPreview(prefix: string | undefined, sequence = 1): string {
  return `${prefix ?? DEFAULT_NUMBER_PREFIX}${String(sequence).padStart(4, "0")}`;
}

export const INVOICE_LINE_LIMITS = {
  minLines: 1,
  maxLines: 50,
  descriptionMax: 500,
  quantityMin: 1,
  quantityMax: 10_000,
  notesMax: 2000,
} as const;

export type InvoiceLineDraft = {
  description: string;
  /** Free text so the row can be mid-edit; validated on save. */
  quantity: string;
  /** Major units as typed ("120.00"); converted to minor on save. */
  unitPrice: string;
  taxable: boolean;
  serviceId: string | null;
};

export function lineToDraft(line: InvoiceLine): InvoiceLineDraft {
  return {
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: (line.unitPriceMinor / 100).toFixed(2),
    taxable: line.taxable,
    serviceId: line.serviceId,
  };
}

export function emptyLineDraft(): InvoiceLineDraft {
  return { description: "", quantity: "1", unitPrice: "", taxable: true, serviceId: null };
}

export type LineDraftError = Partial<Record<"description" | "quantity" | "unitPrice", string>>;

/**
 * Turn editor rows into API line inputs, or report the first problem per row.
 * Mirrors the API's own limits so most mistakes never leave the browser.
 */
export function validateLineDrafts(
  drafts: readonly InvoiceLineDraft[],
):
  { ok: true; lines: InvoiceLineInput[] } | { ok: false; errors: LineDraftError[]; form?: string } {
  if (drafts.length < INVOICE_LINE_LIMITS.minLines) {
    return { ok: false, errors: [], form: "Add at least one line." };
  }
  if (drafts.length > INVOICE_LINE_LIMITS.maxLines) {
    return {
      ok: false,
      errors: [],
      form: `An invoice can have at most ${INVOICE_LINE_LIMITS.maxLines} lines.`,
    };
  }
  const errors: LineDraftError[] = [];
  const lines: InvoiceLineInput[] = [];
  let failed = false;
  for (const draft of drafts) {
    const rowErrors: LineDraftError = {};
    const description = draft.description.trim();
    if (!description) rowErrors.description = "Required";
    else if (description.length > INVOICE_LINE_LIMITS.descriptionMax) {
      rowErrors.description = `At most ${INVOICE_LINE_LIMITS.descriptionMax} characters`;
    }
    const quantity = Number(draft.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < INVOICE_LINE_LIMITS.quantityMin ||
      quantity > INVOICE_LINE_LIMITS.quantityMax
    ) {
      rowErrors.quantity = `Whole number 1–${INVOICE_LINE_LIMITS.quantityMax.toLocaleString("en-GB")}`;
    }
    const priceText = draft.unitPrice.replace(/[^0-9.-]/g, "").trim();
    const price = priceText === "" ? NaN : Number(priceText);
    const unitPriceMinor = Math.round(price * 100);
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(unitPriceMinor)) {
      rowErrors.unitPrice = "Amount of 0.00 or more";
    }
    if (Object.keys(rowErrors).length > 0) failed = true;
    errors.push(rowErrors);
    lines.push({
      description,
      quantity,
      unitPriceMinor,
      taxable: draft.taxable,
      serviceId: draft.serviceId,
    });
  }
  if (failed) return { ok: false, errors };
  return { ok: true, lines };
}

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

/** Overdue when issued, unpaid, and past the due date (calendar compare, business tz is close enough for a badge). */
export function isInvoiceOverdue(
  invoice: Pick<Invoice, "status" | "dueDate" | "totalMinor" | "paidMinor">,
  todayIso: string,
): boolean {
  if (invoice.status !== "issued" || !invoice.dueDate) return false;
  if (invoiceBalanceMinor(invoice) <= 0) return false;
  return invoice.dueDate < todayIso;
}

/** Newest first by issue date, then creation. Drafts (no issue date) sort by creation. */
export function sortInvoicesNewestFirst<T extends Pick<Invoice, "issueDate" | "createdAt">>(
  list: readonly T[],
): T[] {
  return [...list].sort((a, b) => {
    const aKey = a.issueDate ?? a.createdAt.slice(0, 10);
    const bKey = b.issueDate ?? b.createdAt.slice(0, 10);
    if (aKey !== bKey) return aKey < bKey ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
}
