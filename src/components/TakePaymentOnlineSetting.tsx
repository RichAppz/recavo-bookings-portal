import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Banknote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useConnectAccount, useUpdateConfiguration } from "@/lib/api/hooks";
import type { BusinessConfiguration } from "@/lib/api/types";
import { isOnlinePaymentRequired } from "@/lib/booking-payment";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/**
 * Whether priced public bookings must be paid by card before they confirm.
 *
 * Default is off, and a switch without a label reads as "not set" rather than
 * "clients are not paying". This control states On/Off in words and, when off,
 * uses warning colour so the gap is visible on Payments as well as Settings.
 */
export function TakePaymentOnlineSetting({ className }: { className?: string }) {
  const tenant = useTenant();
  const connect = useConnectAccount();
  const update = useUpdateConfiguration();
  // Stripe Connect and bank details both live on Settings → Payments; no point
  // sending people there when they're already looking at it.
  const onPaymentSettings = useRouterState({
    select: (s) =>
      s.location.pathname === "/settings" &&
      (s.location.search as { tab?: string }).tab === "payments",
  });
  const enabled = isOnlinePaymentRequired(tenant.configuration);
  const chargesReady = connect.data?.chargesEnabled === true;
  // Bank transfer is a valid way to pay a gated booking (RECA-522), so it counts
  // as "payment is set up" alongside Stripe.
  const bankReady = tenant.configuration?.bankTransfer?.enabled === true;
  // Requiring payment with no way to pay would dead-end every priced booking, so
  // the switch stays locked until at least one method is ready. Turning it OFF is
  // always allowed.
  const canTurnOn = chargesReady || bankReady;

  const setEnabled = async (next: boolean) => {
    const booking = {
      ...(tenant.configuration?.booking ?? {}),
      requireOnlinePayment: next,
    } as NonNullable<BusinessConfiguration["booking"]>;
    try {
      await update.mutateAsync({ booking });
      toast.success(next ? "Online payments are on" : "Online payments are off");
    } catch {
      // useUpdateConfiguration already toasts the API error.
    }
  };

  return (
    <section
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        enabled
          ? "border-primary/25 bg-primary-soft/50"
          : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
              enabled
                ? "bg-primary-soft text-primary"
                : "bg-amber-200/80 text-amber-950 dark:bg-amber-900/80 dark:text-amber-50",
            )}
          >
            {enabled ? <Banknote className="size-5" /> : <AlertTriangle className="size-5" />}
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold tracking-tight">Take payment online</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                  enabled
                    ? "bg-primary text-primary-foreground"
                    : "bg-amber-500 text-amber-950 dark:bg-amber-400",
                )}
              >
                {enabled ? "On" : "Off"}
              </span>
            </div>
            {enabled ? (
              <p className="text-sm text-muted-foreground">
                Priced sessions booked on your public page are paid by card before they are
                confirmed.
              </p>
            ) : (
              <p className="text-sm text-amber-950 dark:text-amber-50">
                Clients can book priced sessions without paying. You will have to collect payment
                yourself.
              </p>
            )}
          </div>
        </div>
        <Can
          permission={PERMISSIONS.BUSINESS_UPDATE}
          fallback={
            <p className="text-xs text-muted-foreground">
              {enabled ? "On" : "Off"} — an admin can change this
            </p>
          }
        >
          <Switch
            checked={enabled}
            disabled={update.isPending || (!enabled && !canTurnOn)}
            onCheckedChange={(checked) => void setEnabled(checked)}
            className={cn("mt-1 shrink-0", !enabled && "data-[state=unchecked]:bg-amber-500")}
            aria-label="Take payment online"
          />
        </Can>
      </div>
      {!chargesReady && !bankReady ? (
        <p className="mt-3 text-sm text-amber-950 dark:text-amber-50">
          {enabled
            ? "Clients still cannot pay online — at least one payment method must be set up."
            : "Set up a way to get paid first — connect Stripe or add bank transfer details."}
          {onPaymentSettings ? " Both are below." : null}
        </p>
      ) : null}
      {onPaymentSettings ? null : (
        <Button asChild size="sm" variant="outline" className="mt-4 bg-background">
          <Link to="/settings" search={{ tab: "payments" }}>
            {chargesReady || bankReady ? "Payment settings" : "Set up payments"}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}
    </section>
  );
}
