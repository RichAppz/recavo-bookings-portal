/**
 * Invoices (ADR 0019): staff CRUD + lifecycle, PDF download, and the customer
 * account's read-only view. Kept out of `hooks.ts` — that file is long enough —
 * but follows the same conventions: business-scoped keys, idempotent writes,
 * problem+json toasts.
 */
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, createIdempotentMutationFn, queryKeys, toastApiError } from "@/lib/api";
import { useBusinessId, usePlanFeature, useSubscription } from "@/lib/api/hooks";
import type { PortalBusinessSummary, SubscriptionAddon, SubscriptionView } from "@/lib/api/hooks";
import {
  INVOICING_ADDON_KEY,
  INVOICING_FEATURE_KEY,
  type CreateInvoiceBody,
  type Invoice,
  type InvoiceStatus,
  type UpdateInvoiceBody,
} from "@/lib/invoices";

export type {
  CreateInvoiceBody,
  Invoice,
  InvoiceLine,
  InvoiceLineInput,
  InvoiceOrigin,
  InvoiceStatus,
  UpdateInvoiceBody,
} from "@/lib/invoices";

/* ---------------- Entitlement ---------------- */

/** `undefined` while the subscription loads — don't flash a paywall before we know. */
export function useInvoicingEntitled(): boolean | undefined {
  return usePlanFeature(INVOICING_FEATURE_KEY);
}

export type InvoicingAddonRow = SubscriptionAddon & {
  /** True when the API didn't list the bolt-on and this row is our default (£8/month). */
  synthetic: boolean;
};

/** ADR 0020 pricing: £8/month on Solo and Business, included in Growth. */
const DEFAULT_INVOICING_ADDON: Omit<SubscriptionAddon, "status"> = {
  key: INVOICING_ADDON_KEY,
  featureKey: INVOICING_FEATURE_KEY,
  unitAmountMinor: 800,
  currency: "GBP",
  interval: "month",
};

/**
 * The invoicing bolt-on row for a subscription view. The API lists it under
 * `addons[]`; until an environment runs an API build that knows about invoicing
 * we still want the add-on visible and purchasable, so fall back to the guide's
 * default price and derive the status from the feature map.
 */
export function invoicingAddonFrom(
  view: SubscriptionView | undefined,
): InvoicingAddonRow | undefined {
  if (!view) return undefined;
  const listed = view.addons?.find((a) => a.key === INVOICING_ADDON_KEY);
  if (listed) return { ...listed, synthetic: false };
  return {
    ...DEFAULT_INVOICING_ADDON,
    status: view.features?.[INVOICING_FEATURE_KEY] === true ? "included" : "available",
    synthetic: true,
  };
}

/** Add-on rows for the Billing page — the API's list, plus invoicing if it wasn't listed. */
export function addonsWithInvoicing(view: SubscriptionView | undefined): SubscriptionAddon[] {
  const listed = view?.addons ?? [];
  const invoicing = invoicingAddonFrom(view);
  if (!invoicing || !invoicing.synthetic) return listed;
  return [...listed, invoicing];
}

/** The invoicing bolt-on row (included / active / available), once the subscription is known. */
export function useInvoicingAddon(): InvoicingAddonRow | undefined {
  const subscription = useSubscription();
  return invoicingAddonFrom(subscription.data);
}

export function isFeatureNotAvailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "FEATURE_NOT_AVAILABLE";
}

export function isCustomerHasNoEmail(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 400 &&
    err.fieldErrors.some((fe) => fe.code === "CUSTOMER_HAS_NO_EMAIL")
  );
}

/* ---------------- Staff reads ---------------- */

export type InvoiceListFilters = {
  status?: InvoiceStatus;
  customerId?: string;
  bookingId?: string;
  /** 1–200, server default 50. */
  limit?: number;
  enabled?: boolean;
};

export function useInvoices(filters: InvoiceListFilters = {}) {
  const businessId = useBusinessId();
  const { enabled, ...query } = filters;
  return useQuery({
    queryKey: queryKeys.invoices(businessId, query),
    enabled: Boolean(businessId) && enabled !== false,
    queryFn: async () => {
      const res = await api.get<{ invoices: Invoice[] }>(
        `/api/v1/businesses/${businessId}/invoices`,
        { query },
      );
      return res.data.invoices;
    },
  });
}

/** Every invoice raised against a job — the auto-invoice plus any manual ones. */
export function useBookingInvoices(bookingId: string | undefined) {
  return useInvoices({ bookingId, enabled: Boolean(bookingId) });
}

export function useInvoice(invoiceId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.invoice(businessId, invoiceId ?? ""),
    enabled: Boolean(businessId && invoiceId),
    queryFn: async () => {
      const res = await api.get<{ invoice: Invoice }>(
        `/api/v1/businesses/${businessId}/invoices/${invoiceId}`,
      );
      return res.data.invoice;
    },
  });
}

/* ---------------- Staff writes ---------------- */

function useInvoiceCache() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return {
    businessId,
    qc,
    /** Put the returned invoice in place and refresh every list it might appear in. */
    settle(invoice: Invoice) {
      qc.setQueryData(queryKeys.invoice(businessId, invoice.id), invoice);
      void qc.invalidateQueries({ queryKey: queryKeys.invoicesAll(businessId) });
    },
    /** A 409 means our copy is stale: pull the truth before re-rendering actions. */
    onConflict(invoiceId: string) {
      void qc.invalidateQueries({ queryKey: queryKeys.invoice(businessId, invoiceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.invoicesAll(businessId) });
    },
  };
}

/**
 * Create a draft — from a booking (lines pre-filled from what was booked) or by
 * hand. Idempotent: a retry after a dropped connection returns the same draft.
 */
export function useCreateInvoice(opts: { toastOnError?: boolean } = {}) {
  const cache = useInvoiceCache();
  return useMutation<Invoice, ApiError, CreateInvoiceBody>({
    mutationFn: createIdempotentMutationFn(
      async (body: CreateInvoiceBody, idempotencyKey: string) => {
        const res = await api.post<{ invoice: Invoice }>(
          `/api/v1/businesses/${cache.businessId}/invoices`,
          body,
          { idempotencyKey },
        );
        return res.data.invoice;
      },
    ),
    onSuccess: (invoice) => cache.settle(invoice),
    onError: (err) => {
      if (opts.toastOnError === false) return;
      // The caller shows a paywall for this one; a toast on top would be noise.
      if (!isFeatureNotAvailable(err)) toastApiError(err);
    },
  });
}

/** Drafts only; totals come back recomputed. 409 once issued. */
export function useUpdateInvoice() {
  const cache = useInvoiceCache();
  return useMutation<Invoice, ApiError, { invoiceId: string; body: UpdateInvoiceBody }>({
    mutationFn: async ({ invoiceId, body }) => {
      const res = await api.patch<{ invoice: Invoice }>(
        `/api/v1/businesses/${cache.businessId}/invoices/${invoiceId}`,
        body,
      );
      return res.data.invoice;
    },
    onSuccess: (invoice) => cache.settle(invoice),
    onError: (err, vars) => {
      if (err.isConflict) cache.onConflict(vars.invoiceId);
      // Field errors are rendered inline by the editor; everything else toasts.
      if (err.fieldErrors.length === 0) toastApiError(err);
    },
  });
}

/**
 * Allocate the number and freeze the snapshot. `send: true` also emails the PDF
 * and needs the customer to have an email (400 CUSTOMER_HAS_NO_EMAIL otherwise —
 * the caller offers "Issue & download" as the fallback, so it is not toasted).
 */
export function useIssueInvoice() {
  const cache = useInvoiceCache();
  return useMutation<Invoice, ApiError, { invoiceId: string; send: boolean }>({
    mutationFn: createIdempotentMutationFn(
      async (vars: { invoiceId: string; send: boolean }, idempotencyKey: string) => {
        const res = await api.post<{ invoice: Invoice }>(
          `/api/v1/businesses/${cache.businessId}/invoices/${vars.invoiceId}/issue`,
          { send: vars.send },
          { idempotencyKey },
        );
        return res.data.invoice;
      },
    ),
    onSuccess: (invoice) => cache.settle(invoice),
    onError: (err, vars) => {
      if (err.isConflict) cache.onConflict(vars.invoiceId);
      if (isCustomerHasNoEmail(err) || isFeatureNotAvailable(err)) return;
      toastApiError(err);
    },
  });
}

function useInvoiceTransition(action: "send" | "mark-paid" | "void") {
  const cache = useInvoiceCache();
  return useMutation<Invoice, ApiError, { invoiceId: string }>({
    mutationFn: async ({ invoiceId }) => {
      const res = await api.post<{ invoice: Invoice }>(
        `/api/v1/businesses/${cache.businessId}/invoices/${invoiceId}/${action}`,
        {},
      );
      return res.data.invoice;
    },
    onSuccess: (invoice) => cache.settle(invoice),
    onError: (err, vars) => {
      if (err.isConflict) cache.onConflict(vars.invoiceId);
      if (isCustomerHasNoEmail(err) || isFeatureNotAvailable(err)) return;
      toastApiError(err);
    },
  });
}

/** Email (or re-email) the PDF; sets `sentAt`. */
export function useSendInvoice() {
  return useInvoiceTransition("send");
}

/** issued → paid, `paidMinor = totalMinor`. */
export function useMarkInvoicePaid() {
  return useInvoiceTransition("mark-paid");
}

/** Any non-void status → void. The number is kept and never reused. */
export function useVoidInvoice() {
  return useInvoiceTransition("void");
}

/* ---------------- PDF ---------------- */

export type InvoicePdf = { blob: Blob; filename: string };

function pdfFilename(invoice: Pick<Invoice, "id" | "number">, fromHeader: string | null): string {
  if (fromHeader) return fromHeader;
  return invoice.number ? `${invoice.number}.pdf` : `draft-${invoice.id}.pdf`;
}

/** Staff PDF: rendered on demand from the stored snapshot (~50–200 ms). */
export async function fetchInvoicePdf(
  businessId: string,
  invoice: Pick<Invoice, "id" | "number">,
): Promise<InvoicePdf> {
  const res = await api.blob(`/api/v1/businesses/${businessId}/invoices/${invoice.id}/pdf`);
  return { blob: res.blob, filename: pdfFilename(invoice, res.filename) };
}

/** Customer PDF: same document, resolved through the portal link. */
export async function fetchPortalInvoicePdf(
  businessId: string,
  invoice: Pick<Invoice, "id" | "number">,
): Promise<InvoicePdf> {
  const res = await api.blob(`/api/v1/portal/invoices/${invoice.id}/pdf`, {
    query: { businessId },
  });
  return { blob: res.blob, filename: pdfFilename(invoice, res.filename) };
}

/**
 * Hand a fetched file to the browser. A plain `<a href>` can't carry the bearer
 * token, so downloads always go blob → object URL → synthetic click.
 */
export function saveBlob({ blob, filename }: InvoicePdf): void {
  if (typeof window === "undefined") return;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the click a tick to start before the URL goes away (Safari).
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/* ---------------- Customer account (portal) ---------------- */

/** This customer's issued and paid invoices at one studio, newest first. */
export function usePortalInvoices(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalInvoices(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ invoices: Invoice[] }>("/api/v1/portal/invoices", {
        query: { businessId },
      });
      return res.data.invoices;
    },
  });
}

export function usePortalInvoice(businessId: string | undefined, invoiceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalInvoice(businessId ?? "", invoiceId ?? ""),
    enabled: Boolean(businessId && invoiceId),
    queryFn: async () => {
      const res = await api.get<{ invoice: Invoice }>(`/api/v1/portal/invoices/${invoiceId}`, {
        query: { businessId },
      });
      return res.data.invoice;
    },
  });
}

export type PortalInvoice = Invoice & { studio: PortalBusinessSummary };

/**
 * Invoices across every studio the customer deals with, one request per studio
 * (same shape as `usePortalAcrossStudios`). A studio that fails is flagged, not
 * fatal — the others' invoices still show.
 */
export function usePortalInvoicesAcrossStudios(studios: readonly PortalBusinessSummary[]) {
  return useQueries({
    queries: studios.map((studio) => ({
      queryKey: queryKeys.portalInvoices(studio.id),
      queryFn: async () => {
        const res = await api.get<{ invoices: Invoice[] }>("/api/v1/portal/invoices", {
          query: { businessId: studio.id },
        });
        return res.data.invoices;
      },
    })),
    combine: (results) => ({
      data: results.flatMap((result, i) =>
        (result.data ?? []).map((row): PortalInvoice => ({ ...row, studio: studios[i] })),
      ),
      isPending: results.some((r) => r.isPending),
      isPartial: results.some((r) => r.isError),
    }),
  });
}
