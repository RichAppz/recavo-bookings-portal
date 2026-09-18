import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAddSubscriptionAddon, useSubscription } from "@/lib/api/hooks";
import type { SubscriptionAddon } from "@/lib/api/hooks";
import { useIapProducts, useIapPurchase } from "@/hooks/use-iap";
import { isBillingBlocked, subscriptionManagedHere } from "@/lib/billing/access";
import { formatMoney } from "@/lib/format";
import { billingSurface } from "@/lib/native";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

export type AddonUpgradeCopy = {
  /** Lower-case noun for prose: "invoicing", "add-on offers". */
  noun: string;
  /** Dialog title. */
  title: string;
  /** Which tiers include it, for the "or move to …" line: "the Growth plan". */
  includedIn: string;
  /** What buying it unlocks, one sentence, no trailing full stop needed. */
  pitch: string;
  /** Button label verb phrase: "Add invoicing". */
  addLabel: string;
  /** Shown before the subscription view has loaded the real price: "£8/month". */
  fallbackPrice: string;
  icon: LucideIcon;
};

/**
 * Shown when someone tries a write that needs a plan feature the workspace lacks.
 * Higher tiers bundle the feature; lower tiers can add the bolt-on right here (prorated
 * onto the current bill) or change plan. Reads are never gated, so this only guards
 * the write actions. `addon` is the subscription view's row for the bolt-on (or a
 * default when the API didn't list it).
 */
export function AddonUpgradeDialog({
  open,
  onOpenChange,
  onEnabled,
  addonKey,
  featureKey,
  addon,
  copy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the bolt-on is active so the caller can retry what it was doing. */
  onEnabled?: () => void;
  addonKey: string;
  featureKey: string;
  addon: SubscriptionAddon | undefined;
  copy: AddonUpgradeCopy;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const subscription = useSubscription();
  const addAddon = useAddSubscriptionAddon();

  const current = subscription.data?.subscription ?? null;
  const blocked = isBillingBlocked(current);
  // Bolt-ons need a live subscription (the API answers 422 otherwise), so a
  // business with no plan — or a lapsed one — is sent to choose a plan instead.
  const live = Boolean(current) && !blocked;
  const canManage = canManageSaasBilling({
    can: tenant.can,
    roleKeys: tenant.roleKeys,
    blocked,
  });
  // Where we are decides both the price shown and how the bolt-on is bought:
  // Stripe on the web, StoreKit in the iOS app (with the App Store's own price),
  // nothing in a store app that cannot sell. And a subscription is only ever
  // changed where it is billed, so the other surface just points across.
  const surface = billingSurface();
  const iap = useIapProducts();
  const iapFlow = useIapPurchase();
  const storeItem =
    surface === "store"
      ? iap.products.find((p) => p.product.kind === "addon" && p.product.addonKey === addonKey)
      : undefined;
  const price =
    surface === "store"
      ? storeItem
        ? `${storeItem.priceString}/month`
        : copy.fallbackPrice
      : addon
        ? `${formatMoney(addon.unitAmountMinor, addon.currency, { compact: true })}/${addon.interval}`
        : copy.fallbackPrice;
  const managedHere = subscriptionManagedHere(current, surface);
  const canBuyHere =
    live &&
    addon?.status === "available" &&
    canManage &&
    managedHere &&
    (surface === "web" || Boolean(storeItem));
  const Icon = copy.icon;

  const goToBilling = () => {
    onOpenChange(false);
    void navigate({ to: "/billing" });
  };

  let body: ReactNode;
  let actions: ReactNode;
  const sellsHere = surface !== "none";
  if (!sellsHere) {
    // A store app with no In-App Purchase may only say the feature is missing:
    // no price, no add button, no pointer to plans (App Store 3.1.3).
    body = <>{sentence(copy.noun)} isn’t included on this workspace’s plan.</>;
    actions = <Button onClick={() => onOpenChange(false)}>OK</Button>;
  } else if (live && !managedHere) {
    body =
      surface === "web" ? (
        <>
          {sentence(copy.noun)} isn’t included on this workspace’s plan. This subscription is billed
          through the App Store, so add the {copy.noun} bolt-on from Billing in the Recavo iPhone
          app.
        </>
      ) : (
        <>
          {sentence(copy.noun)} isn’t included on this workspace’s plan. This subscription is billed
          on the website, so add the {copy.noun} bolt-on from Billing there.
        </>
      );
    actions = <Button onClick={() => onOpenChange(false)}>OK</Button>;
  } else if (!canManage) {
    body = (
      <>
        {sentence(copy.noun)} isn’t included on this workspace’s plan. Ask the business owner to add
        the {copy.noun} bolt-on ({price}) or move to {copy.includedIn}, which includes it.
      </>
    );
    actions = <Button onClick={() => onOpenChange(false)}>OK</Button>;
  } else if (!live) {
    body = (
      <>
        {sentence(copy.noun)} comes with {copy.includedIn}, or as a {price} bolt-on. Choose a plan
        first, then come back.
      </>
    );
    actions = (
      <>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Not now
        </Button>
        <Button onClick={goToBilling}>Choose a plan</Button>
      </>
    );
  } else {
    body = (
      <>
        Your plan doesn’t include {copy.noun}. Add the bolt-on for {price} — prorated onto your
        current bill — to {copy.pitch}. Or move to {copy.includedIn}, which includes it.
      </>
    );
    actions = (
      <>
        <Button variant="outline" onClick={goToBilling}>
          See plans
        </Button>
        {canBuyHere && surface === "store" && storeItem ? (
          <Button
            disabled={iapFlow.busy}
            onClick={async () => {
              const view = await iapFlow.purchase(storeItem, `${sentence(copy.noun)} added`);
              if (!view) return;
              onOpenChange(false);
              if (view.features?.[featureKey]) onEnabled?.();
            }}
          >
            {iapFlow.state === "purchasing"
              ? "Waiting for App Store…"
              : iapFlow.state === "reconciling"
                ? "Activating…"
                : `${copy.addLabel} · ${price}`}
          </Button>
        ) : canBuyHere ? (
          <Button
            disabled={addAddon.isPending}
            onClick={async () => {
              try {
                const view = await addAddon.mutateAsync(addonKey);
                if (view.features?.[featureKey]) {
                  toast.success(`${sentence(copy.noun)} added`, {
                    description: `${price} has been added to your subscription.`,
                  });
                  onOpenChange(false);
                  onEnabled?.();
                } else {
                  toast.info(`${sentence(copy.noun)} bolt-on added — activating`, {
                    description: "It can take a moment to switch on. Try again shortly.",
                  });
                  onOpenChange(false);
                }
              } catch {
                // useAddSubscriptionAddon already toasts the problem+json error.
              }
            }}
          >
            {addAddon.isPending ? "Adding…" : `${copy.addLabel} · ${price}`}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5 text-primary" />
            {sellsHere ? copy.title : `${sentence(copy.noun)} not available`}
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
