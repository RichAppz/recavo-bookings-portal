import { Link } from "@tanstack/react-router";
import { Ticket } from "lucide-react";
import type { PortalBusinessSummary, PortalCredit } from "@/lib/api/hooks";
import { formatInTz } from "@/lib/format";
import { creditBalance, creditsLeftLabel } from "@/lib/portal-credits";

/**
 * How many prepaid credits the client has to book with, shown on the calendar where
 * they spend them. Without it the only sign of a balance was the Credits tab, so a
 * client tapping "Book with 1 credit" had no idea whether it was their last one.
 * One line for a single studio; a row per studio otherwise. Hidden when there is
 * nothing to spend — the booker already explains how to pay instead.
 */
export function CreditBalanceStrip({
  credits,
}: {
  credits: readonly (PortalCredit & { studio: PortalBusinessSummary })[];
}) {
  const byStudio = new Map<string, { studio: PortalBusinessSummary; credits: PortalCredit[] }>();
  for (const c of credits) {
    const entry = byStudio.get(c.studio.id) ?? { studio: c.studio, credits: [] };
    entry.credits.push(c);
    byStudio.set(c.studio.id, entry);
  }
  const rows = [...byStudio.values()]
    .map(({ studio, credits: list }) => ({ studio, balance: creditBalance(list) }))
    .filter((r) => r.balance.available > 0);
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, r) => sum + r.balance.available, 0);

  return (
    <Link
      to="/account"
      search={{ view: "credits" }}
      aria-label={`${creditsLeftLabel(total)}. Open your credits`}
      className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft/50 px-3 py-2.5 text-sm transition-colors hover:bg-primary-soft"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Ticket className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold tabular-nums">{creditsLeftLabel(total)}</span>
        {rows.length === 1 ? (
          <span className="block text-xs text-muted-foreground">
            {expiryHint(rows[0].balance.nextExpiresAt)}
          </span>
        ) : (
          <span className="block truncate text-xs text-muted-foreground">
            {rows.map((r) => `${r.studio.tradingName} ${r.balance.available}`).join(" · ")}
          </span>
        )}
      </span>
    </Link>
  );
}

function expiryHint(iso: string | null): string {
  if (!iso) return "Pick a time below to use one";
  const when = formatInTz(iso, "Europe/London", { day: "numeric", month: "short" });
  return `Next expires ${when} · pick a time below to use one`;
}
