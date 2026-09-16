import { Link } from "@tanstack/react-router";
import { Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillingPortal, useSubscription } from "@/lib/api/hooks";
import { subscriptionAccessState } from "@/lib/billing/access";
import { formatInTz } from "@/lib/format";
import { saasPurchasesAllowedInApp } from "@/lib/native";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Compact trial reminder for the header: "Trial · 6 days left", linking to the plan.
 * Checkout always collects a card up front, so a trial already has a plan behind it
 * and converts on its own unless it has been cancelled — no need to shout about it.
 */
export function TrialPill() {
  const tenant = useTenant();
  const subscription = useSubscription();
  const current = subscription.data?.subscription;
  if (subscriptionAccessState(current) !== "trial") return null;

  const tz = tenant.business?.defaultTimezone ?? "Europe/London";
  const endsAt = current?.trialEnd ? new Date(current.trialEnd).getTime() : null;
  const daysLeft =
    endsAt !== null ? Math.max(0, Math.ceil((endsAt - Date.now()) / 86_400_000)) : null;
  const endsLabel = current?.trialEnd
    ? formatInTz(current.trialEnd, tz, { dateStyle: "medium" })
    : null;
  const planName = subscription.data?.plan?.name;
  const countdown =
    daysLeft === null
      ? null
      : daysLeft === 0
        ? "ends today"
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  const title = [
    `Free trial${planName ? ` of ${planName}` : ""}`,
    endsLabel
      ? current?.cancelAtPeriodEnd
        ? `ends ${endsLabel} and won’t renew`
        : `billing starts ${endsLabel}`
      : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <Link
      to="/settings"
      search={{ tab: "billing" }}
      title={title}
      aria-label={`${title}. View plan`}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-950/60"
    >
      <Clock className="size-3.5" />
      <span>Trial</span>
      {countdown ? (
        <>
          <span className="hidden text-amber-800 sm:inline dark:text-amber-200">· {countdown}</span>
          {daysLeft !== null && daysLeft > 0 ? (
            <span className="text-amber-800 sm:hidden dark:text-amber-200">· {daysLeft}d</span>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

export function BillingBanner() {
  const tenant = useTenant();
  const subscription = useSubscription();
  const portal = useBillingPortal();
  const current = subscription.data?.subscription;
  const access = subscriptionAccessState(current);
  const tz = tenant.business?.defaultTimezone ?? "Europe/London";
  const canManage = canManageSaasBilling({
    can: tenant.can,
    roleKeys: tenant.roleKeys,
  });

  // Trials get the small header pill (TrialPill) instead of a page banner — a
  // paid-for trial converts on its own, so it only needs a quiet reminder.
  if (access !== "grace") return null;

  const openPortal = async () => {
    const result = await portal.mutateAsync();
    const url = result.portalUrl ?? result.url;
    if (url) window.location.assign(url);
  };

  const graceEnds = current?.graceEndsAt
    ? formatInTz(current.graceEndsAt, tz, { dateStyle: "medium" })
    : null;

  // The Stripe portal (and the Billing tab it stands in for) are web-only in the
  // store apps; there the banner just states the fact. See saasPurchasesAllowedInApp.
  const canFixHere = saasPurchasesAllowedInApp();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
      <p>
        <span className="font-medium">Payment failed.</span>
        {graceEnds
          ? ` Access continues until ${graceEnds}.`
          : canFixHere
            ? " Update your payment method to keep access."
            : ""}
      </p>
      {!canFixHere ? null : canManage ? (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 bg-background"
          disabled={portal.isPending}
          onClick={() => void openPortal()}
        >
          <CreditCard className="size-4" />
          Update payment
        </Button>
      ) : (
        <Button size="sm" variant="outline" asChild className="shrink-0 bg-background">
          <Link to="/settings" search={{ tab: "billing" }}>
            Billing
          </Link>
        </Button>
      )}
    </div>
  );
}
