import { Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillingPortal, useSubscription } from "@/lib/api/hooks";
import { subscriptionAccessState } from "@/lib/billing/access";
import { formatInTz } from "@/lib/format";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

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

  if (access !== "trial" && access !== "grace") return null;

  const openPortal = async () => {
    const result = await portal.mutateAsync();
    const url = result.portalUrl ?? result.url;
    if (url) window.location.assign(url);
  };

  if (access === "trial") {
    // Checkout always collects a card up front, so a trial already has a plan behind
    // it and converts on its own unless it has been cancelled.
    const ends = current?.trialEnd
      ? formatInTz(current.trialEnd, tz, { dateStyle: "medium" })
      : null;
    const planName = subscription.data?.plan?.name;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50">
        <p>
          <span className="font-medium">
            You’re on a 14-day trial{planName ? ` of ${planName}` : ""}.
          </span>
          {ends
            ? current?.cancelAtPeriodEnd
              ? ` It ends ${ends} and won’t renew.`
              : ` Billing starts ${ends}.`
            : null}
        </p>
        <Button size="sm" variant="outline" asChild className="shrink-0 bg-background">
          <Link to="/billing">View plan</Link>
        </Button>
      </div>
    );
  }

  const graceEnds = current?.graceEndsAt
    ? formatInTz(current.graceEndsAt, tz, { dateStyle: "medium" })
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
      <p>
        <span className="font-medium">Payment failed.</span>
        {graceEnds
          ? ` Access continues until ${graceEnds}.`
          : " Update your payment method to keep access."}
      </p>
      {canManage ? (
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
          <Link to="/billing">Billing</Link>
        </Button>
      )}
    </div>
  );
}
