import { FileText } from "lucide-react";
import { AddonUpgradeDialog } from "@/components/AddonUpgradeDialog";
import { useInvoicingAddon } from "@/lib/api/invoices";
import { INVOICING_ADDON_KEY, INVOICING_FEATURE_KEY } from "@/lib/invoices";

/**
 * Shown when someone tries to create, issue or send an invoice on a workspace
 * that isn't entitled to `invoicing` (ADR 0019). Growth bundles it; Solo and
 * Business can add it as an £8/month bolt-on right here, or change plan.
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
  const addon = useInvoicingAddon();
  return (
    <AddonUpgradeDialog
      open={open}
      onOpenChange={onOpenChange}
      onEnabled={onEnabled}
      addonKey={INVOICING_ADDON_KEY}
      featureKey={INVOICING_FEATURE_KEY}
      addon={addon}
      copy={{
        noun: "invoicing",
        title: "Invoicing needs an add-on",
        includedIn: "the Growth plan",
        pitch:
          "issue numbered PDF invoices, email them to clients and have jobs invoiced automatically when they’re marked attended",
        addLabel: "Add invoicing",
        icon: FileText,
      }}
    />
  );
}
