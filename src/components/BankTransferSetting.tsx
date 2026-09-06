import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { useUpdateConfiguration } from "@/lib/api/hooks";
import type { BankTransferSettings } from "@/lib/api/types";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** 123456 → 12-34-56 for display; input accepts either form. */
export function formatSortCode(digits: string): string {
  const d = digitsOnly(digits).slice(0, 6);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)].filter(Boolean).join("-");
}

type FormState = {
  accountName: string;
  sortCode: string; // digits only
  accountNumber: string; // digits only
  iban: string;
  bic: string;
};

function fromSettings(saved: BankTransferSettings | undefined): FormState {
  return {
    accountName: saved?.accountName ?? "",
    sortCode: digitsOnly(saved?.sortCode ?? ""),
    accountNumber: digitsOnly(saved?.accountNumber ?? ""),
    iban: saved?.iban ?? "",
    bic: saved?.bic ?? "",
  };
}

/**
 * Pay-by-bank account details (RECA-522): shown to customers who choose bank
 * transfer at checkout, together with their booking reference. The enable
 * toggle stays locked until the three UK fields validate.
 */
export function BankTransferSetting({ className }: { className?: string }) {
  const tenant = useTenant();
  const update = useUpdateConfiguration();
  const saved = tenant.configuration?.bankTransfer;

  const [form, setForm] = useState<FormState>(() => fromSettings(saved));
  const [enabled, setEnabled] = useState(saved?.enabled === true);
  const [dirty, setDirty] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Adopt the saved values once configuration loads (or another admin saves),
  // but never clobber in-progress edits.
  const savedSnapshot = JSON.stringify(saved ?? null);
  useEffect(() => {
    if (dirty) return;
    setForm(fromSettings(saved));
    setEnabled(saved?.enabled === true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSnapshot]);

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setInlineError(null);
  };

  const detailsValid =
    form.accountName.trim().length > 0 &&
    form.sortCode.length === 6 &&
    form.accountNumber.length === 8;

  const save = async () => {
    const nextEnabled = enabled && detailsValid;
    try {
      await update.mutateAsync({
        bankTransfer: {
          enabled: nextEnabled,
          accountName: form.accountName.trim() || null,
          sortCode: form.sortCode || null,
          accountNumber: form.accountNumber || null,
          iban: form.iban.trim() || null,
          bic: form.bic.trim() || null,
        },
      });
      setDirty(false);
      setEnabled(nextEnabled);
      toast.success(
        nextEnabled ? "Pay by bank transfer is on" : "Bank details saved (pay by bank is off)",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErr = err.fieldErrors.find((fe) => fe.field === "bankTransfer");
        if (fieldErr) {
          setInlineError(
            fieldErr.code === "DETAILS_REQUIRED"
              ? "Fill in the account name, sort code and account number before enabling."
              : (fieldErr.message ?? "Check the bank details and try again."),
          );
          return;
        }
      }
      // useUpdateConfiguration already toasts other API errors.
    }
  };

  return (
    <section className={cn("rounded-xl border p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Landmark className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold tracking-tight">Pay by bank transfer</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase",
                  enabled ? "bg-primary text-primary-foreground" : "bg-secondary",
                )}
              >
                {enabled ? "On" : "Off"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Shown to customers choosing pay by bank, together with their booking reference.
              Bookings wait as “awaiting payment” until you mark the money received.
            </p>
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
          <label className="flex shrink-0 items-center gap-2 pt-1">
            <span className="text-sm font-semibold">{enabled ? "On" : "Off"}</span>
            <Switch
              checked={enabled}
              disabled={update.isPending || (!enabled && !detailsValid)}
              onCheckedChange={(checked) => {
                setEnabled(checked);
                setDirty(true);
                setInlineError(null);
              }}
              aria-label="Accept pay by bank transfer"
            />
          </label>
        </Can>
      </div>

      <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="bt-account-name">Account name</Label>
            <Input
              id="bt-account-name"
              value={form.accountName}
              placeholder="Shine Detailing Ltd"
              onChange={(e) => set({ accountName: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bt-sort-code">Sort code</Label>
            <Input
              id="bt-sort-code"
              inputMode="numeric"
              value={formatSortCode(form.sortCode)}
              placeholder="12-34-56"
              onChange={(e) => set({ sortCode: digitsOnly(e.target.value).slice(0, 6) })}
              aria-invalid={form.sortCode.length > 0 && form.sortCode.length !== 6}
            />
            {form.sortCode.length > 0 && form.sortCode.length !== 6 ? (
              <p className="text-xs text-destructive">Sort codes have 6 digits.</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bt-account-number">Account number</Label>
            <Input
              id="bt-account-number"
              inputMode="numeric"
              value={form.accountNumber}
              placeholder="12345678"
              onChange={(e) => set({ accountNumber: digitsOnly(e.target.value).slice(0, 8) })}
              aria-invalid={form.accountNumber.length > 0 && form.accountNumber.length !== 8}
            />
            {form.accountNumber.length > 0 && form.accountNumber.length !== 8 ? (
              <p className="text-xs text-destructive">Account numbers have 8 digits.</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bt-iban">IBAN (optional)</Label>
            <Input
              id="bt-iban"
              value={form.iban}
              placeholder="GB29 NWBK 6016 1331 9268 19"
              onChange={(e) => set({ iban: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bt-bic">BIC (optional)</Label>
            <Input
              id="bt-bic"
              value={form.bic}
              placeholder="NWBKGB2L"
              onChange={(e) => set({ bic: e.target.value.toUpperCase() })}
            />
          </div>
        </div>

        {inlineError ? <p className="mt-3 text-sm text-destructive">{inlineError}</p> : null}
        {!detailsValid && enabled ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Pay by bank switches off on save until the account name, sort code and account number
            are complete.
          </p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <Button onClick={() => void save()} disabled={update.isPending || !dirty}>
            {update.isPending ? "Saving…" : "Save bank details"}
          </Button>
        </div>
      </Can>
    </section>
  );
}
