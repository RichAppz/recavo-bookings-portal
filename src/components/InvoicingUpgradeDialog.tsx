import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileText } from "lucide-react";
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
import { useInvoicingAddon } from "@/lib/api/invoices";
import { isBillingBlocked } from "@/lib/billing/access";
import { formatMoney } from "@/lib/format";
import { INVOICING_ADDON_KEY, INVOICING_FEATURE_KEY } from "@/lib/invoices";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Shown when someone tries to create, issue or send an invoice on a workspace
 * that isn't entitled to `invoicing` (ADR 0019). Growth bundles it; Solo and
 * Business can add it as a £10/month bolt-on right here, or change plan.
 *
 * Reads and PDF downloads are never gated, so this only guards the write actions.
 */
export function InvoicingUpgradeDialog({
  open,
  onOpenChange,
  onEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the bolt-on is active so the caller can retry what it was doing. */
  onEnabled?: () => void;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const subscription = useSubscription();
  const addon = useInvoicingAddon();
  const addAddon = useAddSubscriptionAddon();

  const current = subscription.data?.subscription ?? null;
  const canManage = canManageSaasBilling({
    can: tenant.can,
    roleKeys: tenant.roleKeys,
    blocked: isBillingBlocked(current),
  });
  const price = addon
    ? `${formatMoney(addon.unitAmountMinor, addon.currency, { compact: true })}/${addon.interval}`
    : "£10/month";
  const canBuyHere = Boolean(current) && addon?.status === "available" && canManage;

  const goToBilling = () => {
    onOpenChange(false);
    void navigate({ to: "/billing" });
  };

  let body: ReactNode;
  let actions: ReactNode;
  if (!canManage) {
    body = (
      <>
        Invoicing isn’t included on this workspace’s plan. Ask the business owner to add the
        invoicing bolt-on ({price}) or move to the Growth plan, which includes it.
      </>
    );
    actions = <Button onClick={() => onOpenChange(false)}>OK</Button>;
  } else if (!current) {
    body = (
      <>
        Invoicing comes with the Growth plan, or as a {price} bolt-on on Solo and Business. Choose a
        plan first, then come back to raise your first invoice.
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
        Your plan doesn’t include invoicing. Add the bolt-on for {price} — prorated onto your
        current bill — to issue numbered PDF invoices, email them to clients and have jobs invoiced
        automatically when they’re marked attended. Or upgrade to Growth, which includes it.
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
              const view = await addAddon.mutateAsync(INVOICING_ADDON_KEY);
              if (view.features?.[INVOICING_FEATURE_KEY]) {
                toast.success("Invoicing added", {
                  description: `${price} has been added to your subscription.`,
                });
                onOpenChange(false);
                onEnabled?.();
              } else {
                toast.info("Invoicing bolt-on added — activating", {
                  description: "It can take a moment to switch on. Try again shortly.",
                });
                onOpenChange(false);
              }
            }}
          >
            {addAddon.isPending ? "Adding…" : `Add invoicing · ${price}`}
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
            <FileText className="size-5 text-primary" />
            Invoicing needs an add-on
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
