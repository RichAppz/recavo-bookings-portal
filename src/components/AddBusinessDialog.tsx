import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, newIdempotencyKey, queryKeys, toastApiError } from "@/lib/api";
import { buildCreateBusinessPayload } from "@/lib/api/business-payload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BusinessDetailsFields } from "@/components/BusinessDetailsFields";
import { useTenant } from "@/lib/tenant/tenant-context";
import { DEFAULT_VERTICAL, type VerticalKey } from "@/lib/verticals";

/**
 * Adds another business to an account that already has one. Same endpoint and
 * fields as first-run onboarding minus the referral code (that attribution is
 * for new customers, not a second studio). On success the new business becomes
 * the active one and we land on /billing, since every business needs its own
 * plan before it can take bookings.
 */
export function AddBusinessDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const tenant = useTenant();
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [vertical, setVertical] = useState<VerticalKey>(DEFAULT_VERTICAL);

  const close = () => {
    onOpenChange(false);
    setLegalName("");
    setTradingName("");
    setVertical(DEFAULT_VERTICAL);
  };

  const create = useMutation({
    mutationFn: async (vars: {
      legalName: string;
      tradingName: string;
      industryTemplateKey: string;
    }) => {
      const res = await api.post<{ business: { id: string } }>(
        "/api/v1/businesses",
        buildCreateBusinessPayload(vars),
        { idempotencyKey: newIdempotencyKey() },
      );
      return res.data.business;
    },
    onSuccess: async (business) => {
      toast.success("Business created");
      // The tenant provider only lets you switch to a business it knows about
      // (it snaps back to the first one otherwise), so the membership list must
      // include the new one before we point at it.
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBusinesses() });
      tenant.switchBusiness(business.id);
      close();
      await navigate({ to: "/billing" });
    },
    onError: (err) => toastApiError(err),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
          return;
        }
        // Esc / outside click while the request is in flight: stay put so the
        // success path can still switch to the new business.
        if (create.isPending) return;
        close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a business</DialogTitle>
          <DialogDescription>
            Runs alongside your other businesses with its own clients, bookings, settings and plan.
            You can switch between them from this menu.
          </DialogDescription>
        </DialogHeader>
        <form
          id="add-business-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!legalName.trim()) {
              toast.error("Enter a business name");
              return;
            }
            create.mutate({ legalName, tradingName, industryTemplateKey: vertical });
          }}
        >
          <BusinessDetailsFields
            vertical={vertical}
            onVerticalChange={setVertical}
            legalName={legalName}
            onLegalNameChange={setLegalName}
            tradingName={tradingName}
            onTradingNameChange={setTradingName}
            disabled={create.isPending}
            idPrefix="add-business-"
          />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="add-business-form" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create business"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
