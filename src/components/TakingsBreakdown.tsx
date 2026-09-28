/**
 * How the business was paid: card, cash, bank transfer (RECA-542).
 *
 * A list with proportional bars rather than a pie, for three reasons: the amounts are the
 * point and a list can show them exactly, five methods make a pie unreadable, and this reads
 * the same on a phone as on a desktop.
 */
import { Banknote, CreditCard, Landmark, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { formatMoney, pct } from "@/lib/format";
import { takingsRows, takingsSummary, type TakingsRow } from "@/lib/takings";
import type { Dashboard } from "@/lib/api/types";
import { EmptyState } from "@/components/ui-bits";

const METHOD_ICONS: Record<string, ReactNode> = {
  card: <CreditCard className="size-4" />,
  card_online: <CreditCard className="size-4" />,
  card_manual: <CreditCard className="size-4" />,
  cash: <Banknote className="size-4" />,
  bank_transfer: <Landmark className="size-4" />,
};

const BAR_COLOURS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function nounFor(count: number): string {
  return count === 1 ? "payment" : "payments";
}

export function TakingsBreakdown({
  revenue,
  currency,
  /** Splits the two card methods apart, for reconciling a payout. */
  detailed = false,
}: {
  revenue: Dashboard["revenue"];
  currency: string;
  detailed?: boolean;
}) {
  const rows: TakingsRow[] = detailed ? takingsRows(revenue) : takingsSummary(revenue);

  if (rows.length === 0) {
    return <EmptyState title="No payments in this range" />;
  }

  return (
    <ul className="space-y-4">
      {rows.map((row, i) => (
        <li key={row.method}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                {METHOD_ICONS[row.method] ?? <Wallet className="size-4" />}
              </span>
              <span className="truncate font-medium">{row.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.count} {nounFor(row.count)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-semibold tabular-nums">
                {formatMoney(row.grossMinor, currency)}
              </span>
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                {pct(row.share * 100)}
              </span>
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"
            role="presentation"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(row.share * 100, 1)}%`,
                background: BAR_COLOURS[i % BAR_COLOURS.length],
              }}
            />
          </div>
          {row.refundedMinor > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Less {formatMoney(row.refundedMinor, currency)} refunded ·{" "}
              {formatMoney(row.netMinor, currency)} kept
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
