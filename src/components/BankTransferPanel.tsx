import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatSortCode } from "@/components/BankTransferSetting";
import type { BankTransferInstructions } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";

/**
 * The "make your transfer" details (RECA-522): account details, amount and — most
 * importantly — the reference the payer must quote so the business can match the
 * payment. Shown to customers on the public confirmation screen and to staff
 * after booking with the bank-transfer method.
 */
export function BankTransferPanel({ details }: { details: BankTransferInstructions }) {
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(details.reference);
      toast.success("Reference copied");
    } catch {
      toast.error("Couldn't copy — please note it down");
    }
  };
  const row = (label: string, value: string, mono = true) => (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
  return (
    <div className="space-y-3 text-left">
      <dl className="divide-y rounded-xl border">
        {row("Amount", formatMoney(details.amountMinor, details.currency), false)}
        {row("Account name", details.accountName, false)}
        {row("Sort code", formatSortCode(details.sortCode))}
        {row("Account number", details.accountNumber)}
        {details.iban ? row("IBAN", details.iban) : null}
        {details.bic ? row("BIC", details.bic) : null}
      </dl>
      <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
        <p className="text-xs font-medium tracking-wide text-warning-foreground uppercase">
          Payment reference — you must use this
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="font-mono text-lg font-semibold">{details.reference}</p>
          <Button variant="outline" size="sm" onClick={() => void copyReference()}>
            <Copy className="size-4" /> Copy
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Without it the business can't match your payment to this booking.
        </p>
      </div>
    </div>
  );
}
