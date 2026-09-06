import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SMS_ADDON_KEY,
  SMS_FEATURE_KEY,
  useAddSubscriptionAddon,
  useSmsAddon,
  useSubscription,
} from "@/lib/api/hooks";
import { isBillingBlocked } from "@/lib/billing/access";
import { formatMoney } from "@/lib/format";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

export type ContactChannel = "email" | "phone" | "sms" | "none";

/**
 * Shown when someone picks SMS for a client but the business isn't entitled to
 * `reminders.sms` (Solo without the bolt-on, RECA-527). Business and Growth bundle
 * SMS, so the fix is either the £10/month bolt-on (bought right here, no page hop)
 * or a plan change on the Billing page.
 */
export function SmsUpgradeDialog({
  open,
  onOpenChange,
  onEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the bolt-on is active so the caller can keep SMS selected. */
  onEnabled: () => void;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const subscription = useSubscription();
  const addon = useSmsAddon();
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
        SMS reminders aren’t included on this workspace’s plan. Ask the business owner to add the
        SMS bolt-on ({price}) or move to the Business plan, which includes SMS.
      </>
    );
    actions = <Button onClick={() => onOpenChange(false)}>OK</Button>;
  } else if (!current) {
    body = (
      <>
        SMS reminders come with the Business and Growth plans, or as a {price} bolt-on on Solo.
        Choose a plan first, then come back and switch this client to SMS.
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
        Your plan doesn’t include SMS reminders. Add the SMS bolt-on for {price} — it’s prorated
        onto your current bill — or upgrade to Business, which includes SMS along with team
        features.
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
              const view = await addAddon.mutateAsync(SMS_ADDON_KEY);
              if (view.features?.[SMS_FEATURE_KEY]) {
                toast.success("SMS reminders added", {
                  description: `${price} has been added to your subscription.`,
                });
                onEnabled();
              } else {
                // Purchased but the entitlement is still propagating — don't leave the
                // client on a channel that will silently fall back.
                toast.info("SMS bolt-on added — activating", {
                  description: "It can take a moment to switch on. Try again shortly.",
                });
                onOpenChange(false);
              }
            }}
          >
            {addAddon.isPending ? "Adding…" : `Add SMS bolt-on · ${price}`}
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
            <MessageSquareText className="size-5 text-primary" />
            SMS reminders need an add-on
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
