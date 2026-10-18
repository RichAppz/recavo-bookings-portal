import { Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { useSubscription } from "@/lib/api/hooks";
import { billingNavAlert } from "@/lib/billing/access";
import { formatInTz } from "@/lib/format";
import { billingSurface } from "@/lib/native";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/**
 * Sidebar warning while the subscription's payment is in trouble: amber during
 * the 48-hour grace window (with the deadline), red once the workspace is
 * read-only. Click → the Plan page, where Pay now lives. Hidden while the
 * subscription is healthy or still loading. `compact` renders just the icon
 * for the collapsed footer.
 */
export function BillingNavCard({
  onClick,
  compact = false,
}: {
  onClick?: () => void;
  compact?: boolean;
}) {
  const tenant = useTenant();
  const subscription = useSubscription();
  const alert = billingNavAlert(subscription.data?.subscription, billingSurface());
  if (!alert) return null;

  const tz = tenant.business?.defaultTimezone ?? "Europe/London";
  const locked = alert.level === "locked";
  const deadline = alert.graceEndsAt
    ? formatInTz(alert.graceEndsAt, tz, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const title = locked ? "Workspace read-only" : "Payment failed";
  const subtitle = locked
    ? alert.payableHere
      ? "Pay now to unlock"
      : "Unpaid subscription"
    : deadline
      ? `Full access until ${deadline}`
      : "Full access for now";
  const label = `${title} — ${subtitle}. Open billing`;

  if (compact) {
    return (
      <Link
        to="/billing"
        onClick={onClick}
        title={`${title} — ${subtitle}`}
        aria-label={label}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          locked
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-amber-500 text-white hover:bg-amber-500/90",
        )}
      >
        <CreditCard className="size-4" aria-hidden />
      </Link>
    );
  }

  return (
    <Link
      to="/billing"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
        locked
          ? "bg-destructive/15 hover:bg-destructive/25"
          : "bg-amber-500/15 hover:bg-amber-500/25",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          locked ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white",
        )}
      >
        <CreditCard className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-sidebar-accent-foreground">
          {title}
        </span>
        <span className="block truncate text-[11px] text-sidebar-foreground/70">{subtitle}</span>
      </span>
      {alert.payableHere ? (
        <span
          className={cn(
            "shrink-0 text-[12px] font-bold",
            locked ? "text-destructive" : "text-amber-600 dark:text-amber-400",
          )}
        >
          Pay now
        </span>
      ) : null}
    </Link>
  );
}
