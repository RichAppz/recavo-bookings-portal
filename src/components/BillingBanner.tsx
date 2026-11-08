import { Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillingPortal, useSubscription } from "@/lib/api/hooks";
import { subscriptionAccessState } from "@/lib/billing/access";
import { formatInTz } from "@/lib/format";
import { openIapManagement } from "@/lib/iap";
import { billingSurface } from "@/lib/native";
import { subscriptionManagedHere, subscriptionProvider } from "@/lib/billing/access";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { openHostedFlow } from "@/lib/native";

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

  // Trials get a quiet countdown in the menu's More group instead of a page
  // banner — a paid-for trial converts on its own.
  if (access !== "grace") return null;

  const openPortal = async () => {
    const result = await portal.mutateAsync();
    const url = result.portalUrl ?? result.url;
    if (url) void openHostedFlow(url);
  };

  // A 48-hour window: the time of day matters, not just the date.
  const graceEnds = current?.graceEndsAt
    ? formatInTz(current.graceEndsAt, tz, { dateStyle: "medium", timeStyle: "short" })
    : null;

  // Where the payment method lives depends on who bills: Stripe's portal for a
  // web subscription, the store's subscription page for a store one — and only
  // the matching store app can open that. A store app that cannot sell, or the
  // other platform's app, just states the fact (see billingSurface).
  const surface = billingSurface();
  const provider = subscriptionProvider(current);
  const canFixHere = subscriptionManagedHere(current, surface);
  const fixPayment =
    provider === "stripe" ? () => void openPortal() : () => void openIapManagement();

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
          onClick={fixPayment}
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
