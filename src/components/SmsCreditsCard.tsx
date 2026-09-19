import { AlertTriangle, MessageSquareText } from "lucide-react";
import { SectionCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  useSmsCredits,
  useStartSmsCreditsCheckout,
  useSubscription,
  type SmsCreditLedgerEntry,
} from "@/lib/api/hooks";
import { isBillingBlocked } from "@/lib/billing/access";
import { bundleLabel, smsCreditsLevel } from "@/lib/billing/sms-credits";
import { formatInTz, formatMoney } from "@/lib/format";
import { useIapProducts, useIapPurchase } from "@/hooks/use-iap";
import { billingSurface } from "@/lib/native";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { openHostedFlow } from "@/lib/native";

const KIND_LABEL: Record<SmsCreditLedgerEntry["kind"], string> = {
  purchase: "Bundle purchased",
  consume: "Text sent",
  release: "Credit returned (text failed)",
  grant: "Credits added by Recavo",
};

/**
 * Prepaid text credits (ADR 0020). Solo and Business buy bundles; Growth has texts
 * included. Always reads from the API rather than local state after a purchase —
 * the Stripe webhook may land the credits before the success page does.
 */
export function SmsCreditsCard({ className }: { className?: string }) {
  const tenant = useTenant();
  const credits = useSmsCredits();
  const subscription = useSubscription();
  const checkout = useStartSmsCreditsCheckout();
  const tz = tenant.business?.defaultTimezone ?? "Europe/London";

  const current = subscription.data?.subscription ?? null;
  // Bundles are consumables, not part of the plan, so they sell on every surface
  // that can sell at all: Stripe Checkout on the web, StoreKit in the iOS app
  // (at the App Store's price), nothing in a store app without In-App Purchase.
  const surface = billingSurface();
  const sellsHere = surface !== "none";
  const iap = useIapProducts();
  const iapFlow = useIapPurchase();
  const storeItem =
    surface === "store" ? iap.products.find((p) => p.product.kind === "sms") : undefined;
  const canBuy =
    sellsHere &&
    (surface === "web" || Boolean(storeItem)) &&
    canManageSaasBilling({
      can: tenant.can,
      roleKeys: tenant.roleKeys,
      blocked: isBillingBlocked(current),
    });

  const data = credits.data;
  const level = smsCreditsLevel(data);
  const label = data
    ? storeItem
      ? `${data.bundle.credits} texts (${storeItem.priceString})`
      : bundleLabel(data.bundle)
    : "";

  const buy = async () => {
    if (!data) return;
    if (storeItem) {
      await iapFlow.purchase(storeItem, `${data.bundle.credits} texts added`);
      return;
    }
    const result = await checkout.mutateAsync({ bundle: data.bundle.key });
    if (result.checkoutUrl) void openHostedFlow(result.checkoutUrl);
  };
  const buying = checkout.isPending || iapFlow.busy;

  if (credits.isLoading || !data) {
    return (
      <SectionCard title="Text credits" className={className}>
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      </SectionCard>
    );
  }

  if (data.unlimited) {
    return (
      <SectionCard
        title="Text credits"
        description="One credit is one text sent on your behalf, however long."
        action={<StatusBadge status="active" />}
        className={className}
      >
        <div className="flex items-start gap-3 text-sm">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>
            Texts are included in your plan — reminders and confirmations set to SMS always go by
            text, with nothing to top up.
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Text credits"
      description="One credit is one text sent on your behalf, however long. Credits never expire and stay with you if you change plan."
      className={className}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4">
          <div className="flex items-start gap-3">
            <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {data.balance}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  {data.balance === 1 ? "text" : "texts"} left
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {data.purchasedTotal} bought · {data.consumedTotal} sent
              </p>
            </div>
          </div>
          {canBuy ? (
            <Button disabled={buying} onClick={() => void buy()}>
              {iapFlow.state === "purchasing"
                ? "Waiting for App Store…"
                : iapFlow.state === "reconciling"
                  ? "Adding credits…"
                  : checkout.isPending
                    ? "Opening checkout…"
                    : `Buy ${label}`}
            </Button>
          ) : sellsHere && (surface === "web" || storeItem) ? (
            <p className="text-xs text-muted-foreground">
              Ask the business owner to buy more — {label} a bundle.
            </p>
          ) : null}
        </div>

        {level === "empty" || level === "low" ? (
          <div
            role="status"
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm",
              level === "empty"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              {level === "empty"
                ? sellsHere
                  ? "You're out of text credits. Texts are currently going out as emails until you buy a bundle."
                  : "You're out of text credits. Texts are currently going out as emails."
                : `Running low — ${data.balance} ${data.balance === 1 ? "text" : "texts"} left. Once they're gone, messages set to SMS are sent by email instead.`}
            </p>
          </div>
        ) : null}

        {data.recent.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Recent activity</p>
            <ul className="divide-y rounded-xl border text-sm">
              {data.recent.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{KIND_LABEL[entry.kind] ?? entry.kind}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatInTz(entry.createdAt, tz)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p
                      className={cn(
                        "font-medium",
                        entry.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : undefined,
                      )}
                    >
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                    </p>
                    <p className="text-xs text-muted-foreground">{entry.balanceAfter} left</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No texts sent yet. Set a client's preferred channel to SMS, or add an SMS reminder rule,
            and each text uses one credit.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
