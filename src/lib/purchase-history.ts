/**
 * What a client sees under Purchases: one line per thing they bought, newest
 * first, whichever way the money moved.
 *
 * Card payments carry the receipt; package purchases carry what was bought. A
 * package paid by card produces both, so the two are joined (by the payment's
 * `packagePurchaseId` or the purchase's `paymentRef`) into a single line that has
 * the package name *and* the receipt. A package paid by bank transfer or sold by
 * staff has no payment at all, which is why reading payments alone left the list
 * empty for a client who had plainly bought something.
 */

export type PurchasePayment = {
  id: string;
  packagePurchaseId: string | null;
  amountMinor: number;
  currency: string;
  state: string;
  receiptUrl: string | null;
  createdAt: string;
};

export type PurchasePackage = {
  id: string;
  packageName: string | null;
  creditsIssued: number | null;
  amountMinor: number;
  currency: string;
  paymentRef: string | null;
  purchasedAt: string;
};

export type PurchaseLine<S> = {
  /** Stable across re-renders; the payment id when there is one, else the purchase id. */
  id: string;
  /** What was bought, as far as we know. */
  title: string;
  /** "10 credits" for a package; null for a plain booking payment. */
  detail: string | null;
  amountMinor: number;
  currency: string;
  /** Payment state when a card paid; "paid" for a confirmed off-platform sale. */
  status: string;
  receiptUrl: string | null;
  at: string;
  studio: S;
};

type Tagged<T, S> = T & { readonly studio: S };

export function purchaseHistory<S extends { id: string }>(
  payments: readonly Tagged<PurchasePayment, S>[],
  purchases: readonly Tagged<PurchasePackage, S>[],
): PurchaseLine<S>[] {
  const purchaseByKey = new Map<string, Tagged<PurchasePackage, S>>();
  for (const p of purchases) purchaseByKey.set(`${p.studio.id}:${p.id}`, p);
  const claimed = new Set<string>();

  const lines: PurchaseLine<S>[] = payments.map((payment) => {
    const match =
      (payment.packagePurchaseId
        ? purchaseByKey.get(`${payment.studio.id}:${payment.packagePurchaseId}`)
        : undefined) ??
      purchases.find((p) => p.studio.id === payment.studio.id && p.paymentRef === payment.id);
    if (match) claimed.add(`${match.studio.id}:${match.id}`);
    return {
      id: payment.id,
      title: match ? packageTitle(match) : "Booking payment",
      detail: match ? creditsDetail(match.creditsIssued) : null,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: payment.state,
      receiptUrl: payment.receiptUrl,
      at: payment.createdAt,
      studio: payment.studio,
    };
  });

  for (const purchase of purchases) {
    if (claimed.has(`${purchase.studio.id}:${purchase.id}`)) continue;
    lines.push({
      id: purchase.id,
      title: packageTitle(purchase),
      detail: creditsDetail(purchase.creditsIssued),
      amountMinor: purchase.amountMinor,
      currency: purchase.currency,
      status: "paid",
      receiptUrl: null,
      at: purchase.purchasedAt,
      studio: purchase.studio,
    });
  }

  return lines.sort((a, b) => b.at.localeCompare(a.at));
}

function packageTitle(purchase: PurchasePackage): string {
  return purchase.packageName ?? "Package";
}

function creditsDetail(credits: number | null): string | null {
  if (credits === null || credits <= 0) return null;
  return `${credits} ${credits === 1 ? "credit" : "credits"}`;
}
