import { invoiceBalanceMinor, type Invoice } from "./invoices.ts";

export type PaidRowLabel = "Deposit taken" | "Paid";

/**
 * How the totals block names the money already received — the same rule the API
 * applies to the PDF (`paidRowLabel` in `src/modules/invoices/domain/invoice.ts`), so
 * the page and the document a client holds never disagree. "Deposit taken" while what
 * has been paid is no more than the booking's deposit and a balance is still due;
 * plain "Paid" once more has come in, once settled, or when there was no deposit.
 */
export function paidRowLabel(
  invoice: Pick<Invoice, "totalMinor" | "paidMinor" | "depositMinor">,
): PaidRowLabel {
  const deposit = invoice.depositMinor ?? null;
  if (
    deposit !== null &&
    deposit > 0 &&
    invoice.paidMinor > 0 &&
    invoice.paidMinor <= deposit &&
    invoiceBalanceMinor(invoice) > 0
  ) {
    return "Deposit taken";
  }
  return "Paid";
}
