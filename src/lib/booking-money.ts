/**
 * The money list on a booking's Payments tab.
 *
 * Two sources describe one booking's money. `payments` rows exist only for card payments
 * taken through the platform — they carry the state, receipt and refund detail staff
 * expect to see. Cash, bank transfers and the business's own card machine never become a
 * payment: staff record them, the API bumps the booking's paid total and the settlement
 * ledger gets a row with `paymentId: null`. Before this, a booking settled by a recorded
 * bank transfer read "Paid in full" over "No payments yet".
 */
import type { BookingSettlementLine, Payment } from "@/lib/api/types";

export type RecordedMoneyLine = {
  kind: "recorded";
  id: string;
  at: string;
  amountMinor: number;
  currency: string;
  method: BookingSettlementLine["method"];
  direction: BookingSettlementLine["kind"];
};

export type BookingMoneyLine =
  { kind: "payment"; id: string; at: string; payment: Payment } | RecordedMoneyLine;

/**
 * Card payments as the provider reports them plus every amount recorded by hand, newest
 * first. Ledger rows that mirror a provider payment are skipped: the payment itself is
 * the richer record and listing both would double every card amount.
 */
export function bookingMoneyLines(
  payments: readonly Payment[] | undefined,
  settlements: readonly BookingSettlementLine[] | undefined,
): BookingMoneyLine[] {
  const lines: BookingMoneyLine[] = [];
  for (const payment of payments ?? []) {
    lines.push({ kind: "payment", id: payment.id, at: payment.createdAt, payment });
  }
  for (const s of settlements ?? []) {
    if (s.paymentId) continue;
    lines.push({
      kind: "recorded",
      id: s.id,
      at: s.occurredAt,
      amountMinor: s.amountMinor,
      currency: s.currency,
      method: s.method,
      direction: s.kind,
    });
  }
  return lines.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/**
 * Net money the ledger has taken for the booking. The ledger is fed from domain events a
 * poll after the booking's own paid total moves, so when this is still short of
 * `paidMinor` the list is a moment behind and worth refetching.
 */
export function ledgerReceivedMinor(settlements: readonly BookingSettlementLine[]): number {
  let total = 0;
  for (const s of settlements) {
    switch (s.kind) {
      case "payment":
      case "dispute_reversal":
        total += s.amountMinor;
        break;
      case "refund":
      case "dispute":
        total -= s.amountMinor;
        break;
    }
  }
  return total;
}

/** True while the ledger has yet to show money the booking already counts as paid. */
export function ledgerBehind(
  settlements: readonly BookingSettlementLine[] | undefined,
  paidMinor: number | null | undefined,
): boolean {
  if (!settlements || !paidMinor || paidMinor <= 0) return false;
  return ledgerReceivedMinor(settlements) < paidMinor;
}

const METHOD_LABELS: Record<BookingSettlementLine["method"], string> = {
  card_online: "Card",
  // The Recorded badge on the line already says it was the business's own machine.
  card_manual: "Card",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export function settlementMethodLabel(method: BookingSettlementLine["method"]): string {
  return METHOD_LABELS[method] ?? "Other";
}

/** "Recorded" for money in; the reversal kinds are named so a stray one is not read as a payment. */
export function recordedDirectionLabel(direction: BookingSettlementLine["kind"]): string {
  switch (direction) {
    case "payment":
      return "Recorded";
    case "refund":
      return "Refunded";
    case "dispute":
      return "Disputed";
    case "dispute_reversal":
      return "Dispute won";
    default:
      return "Recorded";
  }
}
