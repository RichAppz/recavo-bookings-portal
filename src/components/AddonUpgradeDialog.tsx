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
import { isBillingBlocked } from "@/lib/billing/access";
import { formatMoney } from "@/lib/format";
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
  const price = addon
    ? `${formatMoney(addon.unitAmountMinor, addon.currency, { compact: true })}/${addon.interval}`
    : "£8/month";
  const canBuyHere = live && addon?.status === "available" && canManage;
  const Icon = copy.icon;

  const goToBilling = () => {
    onOpenChange(false);
    void navigate({ to: "/billing" });
  };

  let body: ReactNode;
  let actions: ReactNode;
  if (!canManage) {
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
        {canBuyHere ? (
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
            {copy.title}
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
