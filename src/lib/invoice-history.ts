/**
 * Links an "Invoice · Email" row in a booking's history back to the invoice it carried.
 *
 * The history row is a notification record: it knows the template (`invoice_issued`) and
 * when it went, but not which invoice was attached. The booking's invoices are already
 * loaded in the drawer, so we match on time instead of asking the API for a new field —
 * the invoice is marked `sentAt` by the same event that sends the email, and a resend
 * moves `sentAt` to the new send.
 */
import type { Invoice } from "@/lib/invoices";

export type HistoryInvoice = Pick<Invoice, "id" | "number" | "status" | "sentAt" | "createdAt">;

/** Template keys whose email carries an invoice PDF. */
const INVOICE_TEMPLATES = new Set(["invoice_issued"]);

/** How far apart the email and the invoice's `sentAt` may be and still count as one send. */
const SENT_AT_TOLERANCE_MS = 2 * 60 * 1000;

export function isInvoiceMessageTemplate(templateKey: string): boolean {
  return INVOICE_TEMPLATES.has(templateKey);
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * The invoice an `invoice_issued` message most plausibly carried, or null when it can't
 * be told apart. Drafts never go out, so they're never candidates.
 *
 * 1. An invoice whose `sentAt` sits within two minutes of the email wins (closest first).
 * 2. Otherwise the most recently created invoice that existed when the email went.
 * 3. Otherwise, if the booking only ever had one sent invoice, it must be that one.
 */
export function invoiceForMessage<T extends HistoryInvoice>(
  message: { templateKey: string; occurredAt: string | null },
  invoices: readonly T[] | undefined,
): T | null {
  if (!invoices?.length || !isInvoiceMessageTemplate(message.templateKey)) return null;
  const sent = invoices.filter((inv) => inv.status !== "draft");
  if (sent.length === 0) return null;

  const at = ms(message.occurredAt);
  if (at === null) return sent.length === 1 ? (sent[0] ?? null) : null;

  let bySentAt: { inv: T; gap: number } | null = null;
  for (const inv of sent) {
    const sentAt = ms(inv.sentAt);
    if (sentAt === null) continue;
    const gap = Math.abs(sentAt - at);
    if (gap <= SENT_AT_TOLERANCE_MS && (!bySentAt || gap < bySentAt.gap)) {
      bySentAt = { inv, gap };
    }
  }
  if (bySentAt) return bySentAt.inv;

  let existing: T | null = null;
  for (const inv of sent) {
    const created = ms(inv.createdAt);
    if (created === null || created > at + SENT_AT_TOLERANCE_MS) continue;
    if (!existing || created > (ms(existing.createdAt) ?? 0)) existing = inv;
  }
  if (existing) return existing;

  return sent.length === 1 ? (sent[0] ?? null) : null;
}
