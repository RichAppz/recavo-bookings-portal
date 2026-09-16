import { Sparkles } from "lucide-react";
import { AddonUpgradeDialog } from "@/components/AddonUpgradeDialog";
import { UPSELLS_ADDON_KEY, UPSELLS_FEATURE_KEY, useUpsellsAddon } from "@/lib/api/upsells";

/**
 * Shown when someone tries to pair add-ons with a service on a workspace that isn't
 * entitled to `upsells`. Business and Growth bundle it; Solo can add the £8/month
 * bolt-on right here, or change plan. Existing pairings stay readable without it.
 */
export function UpsellsUpgradeDialog({
  open,
  onOpenChange,
  onEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabled?: () => void;
}) {
  const addon = useUpsellsAddon();
  return (
    <AddonUpgradeDialog
      open={open}
      onOpenChange={onOpenChange}
      onEnabled={onEnabled}
      addonKey={UPSELLS_ADDON_KEY}
      featureKey={UPSELLS_FEATURE_KEY}
      addon={addon}
      copy={{
        noun: "add-on offers",
        title: "Add-on offers need an add-on",
        includedIn: "the Business or Growth plan",
        pitch:
          "offer extras alongside each service on your booking page and by email after you book someone in, at a price you set",
        addLabel: "Add upsells",
        icon: Sparkles,
      }}
    />
  );
}
