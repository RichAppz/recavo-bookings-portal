import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  GroupedBlock,
  ReadOnlyNotice,
  SettingsPage,
  SettingsSection,
  SwitchRow,
  useSavedTick,
} from "@/components/settings/primitives";
import { useSettingsDraft } from "@/components/settings/save-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateConfiguration } from "@/lib/api/hooks";
import type { BusinessConfiguration } from "@/lib/api/types";
import { bpsToPercentInput, percentInputToBps, type TaxConfig } from "@/lib/invoices";
import { PERMISSIONS } from "@/lib/permissions";
import { COUNTRY_OPTIONS, countryLabel } from "@/lib/settings-labels";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type Draft = {
  vatNumber: string;
  vatRatePct: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  closureDays: string;
};

function taxOf(config: BusinessConfiguration | null | undefined): TaxConfig | undefined {
  // VAT rate / inclusive pricing aren't on the committed OpenAPI snapshot yet
  // (ADR 0019); widen until the schema is refreshed.
  return config?.tax as TaxConfig | undefined;
}

function draftFrom(config: BusinessConfiguration | null | undefined): Draft {
  return {
    vatNumber: config?.tax?.vatNumber ?? "",
    vatRatePct: bpsToPercentInput(taxOf(config)?.vatRateBps),
    line1: config?.legalAddress?.line1 ?? "",
    line2: config?.legalAddress?.line2 ?? "",
    city: config?.legalAddress?.city ?? "",
    region: config?.legalAddress?.region ?? "",
    postalCode: config?.legalAddress?.postalCode ?? "",
    country: config?.legalAddress?.country ?? "GB",
    closureDays: String(config?.retention?.closureWindowDays ?? 30),
  };
}

type Patch = Omit<
  Parameters<ReturnType<typeof useUpdateConfiguration>["mutateAsync"]>[0],
  "tax"
> & {
  tax?: TaxConfig;
};

/**
 * Settings → Tax and address (spec §6): VAT, the legal address that goes on
 * invoices, and how long data is kept after closing. The two VAT switches save
 * straight away; typed fields go through the save bar.
 */
export function TaxAddressPage() {
  const tenant = useTenant();
  const config = tenant.configuration;
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const update = useUpdateConfiguration();
  const savedTax = taxOf(config);
  const vatRegistered = Boolean(config?.tax?.vatRegistered);
  const pricesIncludeVat = savedTax?.pricesIncludeVat !== false;

  const [draft, setDraft] = useState<Draft>(() => draftFrom(config));
  const [dirty, setDirty] = useState(false);
  const [regTick, flashReg] = useSavedTick();
  const [inclTick, flashIncl] = useSavedTick();

  const savedSnapshot = JSON.stringify(draftFrom(config));
  useEffect(() => {
    if (dirty) return;
    setDraft(draftFrom(config));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSnapshot]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const vatRateBps = percentInputToBps(draft.vatRatePct);
  const vatRateValid = vatRateBps !== undefined;
  const closure = Number(draft.closureDays);
  const closureValid = draft.closureDays.trim() !== "" && Number.isInteger(closure) && closure >= 1;
  const addressStarted = draft.line1.trim().length > 0;
  const addressValid =
    !addressStarted || (draft.city.trim().length > 0 && draft.postalCode.trim().length > 0);

  /** The tax block as it should be saved, with one switch optionally flipped. */
  const taxPatch = (
    flip?: Partial<Pick<TaxConfig, "vatRegistered" | "pricesIncludeVat">>,
  ): TaxConfig => ({
    vatRegistered,
    vatNumber: draft.vatNumber.trim() || null,
    vatRateBps: vatRateBps ?? savedTax?.vatRateBps ?? null,
    pricesIncludeVat,
    ...flip,
  });

  const save = async () => {
    const patch: Patch = {
      tax: taxPatch(),
      retention: { closureWindowDays: closure },
      legalAddress: addressStarted
        ? {
            line1: draft.line1.trim(),
            line2: draft.line2.trim() || null,
            city: draft.city.trim(),
            region: draft.region.trim() || null,
            postalCode: draft.postalCode.trim(),
            country: draft.country.trim().toUpperCase(),
          }
        : null,
    };
    await update.mutateAsync(patch as Parameters<typeof update.mutateAsync>[0]);
    setDirty(false);
    toast.success("Tax and address saved");
  };

  useSettingsDraft({
    dirty: canEdit && dirty,
    valid: vatRateValid && closureValid && addressValid,
    saving: update.isPending,
    save,
    discard: () => {
      setDraft(draftFrom(config));
      setDirty(false);
    },
  });

  // Switches save on their own, carrying the saved (not drafted) typed values so a
  // half-typed VAT number is never written by a flick of a switch.
  const flipSwitch = async (
    flip: Partial<Pick<TaxConfig, "vatRegistered" | "pricesIncludeVat">>,
    flash: () => void,
  ) => {
    const savedDraft = draftFrom(config);
    const patch: Patch = {
      tax: {
        vatRegistered,
        vatNumber: savedDraft.vatNumber.trim() || null,
        vatRateBps: savedTax?.vatRateBps ?? null,
        pricesIncludeVat,
        ...flip,
      },
    };
    try {
      await update.mutateAsync(patch as Parameters<typeof update.mutateAsync>[0]);
      flash();
    } catch {
      // useUpdateConfiguration already toasts the API error.
    }
  };

  const countries = COUNTRY_OPTIONS.includes(draft.country)
    ? COUNTRY_OPTIONS
    : [draft.country, ...COUNTRY_OPTIONS];

  return (
    <SettingsPage
      title="Tax and address"
      description="What goes on your invoices, and how long data is kept after you close."
      banner={canEdit ? null : <ReadOnlyNotice />}
    >
      <SettingsSection
        id="tax-vat"
        title="VAT"
        help="Invoices show a VAT breakdown only when you're registered and a rate is set. Switches save straight away."
      >
        <GroupedBlock>
          <SwitchRow
            id="tax-vat-registered"
            label="VAT registered"
            hint="Print your VAT number and a VAT breakdown on invoices."
            checked={vatRegistered}
            saved={regTick}
            disabled={!canEdit || update.isPending}
            onCheckedChange={(checked) => void flipSwitch({ vatRegistered: checked }, flashReg)}
          />
          <SwitchRow
            id="tax-prices-include"
            label="Prices include VAT"
            hint={
              pricesIncludeVat
                ? "Your prices are gross — VAT is backed out on invoices."
                : "Your prices are net — VAT is added on top on invoices."
            }
            checked={pricesIncludeVat}
            saved={inclTick}
            disabled={!canEdit || update.isPending}
            onCheckedChange={(checked) => void flipSwitch({ pricesIncludeVat: checked }, flashIncl)}
          />
        </GroupedBlock>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="tax-vat-number">VAT number</Label>
            <Input
              id="tax-vat-number"
              value={draft.vatNumber}
              disabled={!canEdit}
              placeholder="GB123456789"
              onChange={(e) => set({ vatNumber: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tax-vat-rate">VAT rate (%)</Label>
            <Input
              id="tax-vat-rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={draft.vatRatePct}
              disabled={!canEdit}
              aria-invalid={!vatRateValid ? true : undefined}
              onChange={(e) => set({ vatRatePct: e.target.value })}
            />
            <p
              className={cn("text-xs", vatRateValid ? "text-muted-foreground" : "text-destructive")}
            >
              {vatRateValid
                ? "Applied to taxable invoice lines."
                : "Enter a rate between 0 and 100."}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="tax-address"
        title="Legal address"
        help="Printed on invoices and in the footer of client emails. Leave the first line empty to show no address."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="addr-line1">Address line 1</Label>
            <Input
              id="addr-line1"
              value={draft.line1}
              disabled={!canEdit}
              onChange={(e) => set({ line1: e.target.value })}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="addr-line2">Address line 2</Label>
            <Input
              id="addr-line2"
              value={draft.line2}
              disabled={!canEdit}
              onChange={(e) => set({ line2: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="addr-city">City</Label>
            <Input
              id="addr-city"
              value={draft.city}
              disabled={!canEdit}
              aria-invalid={addressStarted && !draft.city.trim() ? true : undefined}
              onChange={(e) => set({ city: e.target.value })}
            />
            {addressStarted && !draft.city.trim() ? (
              <p className="text-xs text-destructive">Enter a city.</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="addr-region">County or region</Label>
            <Input
              id="addr-region"
              value={draft.region}
              disabled={!canEdit}
              onChange={(e) => set({ region: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="addr-postcode">Postcode</Label>
            <Input
              id="addr-postcode"
              value={draft.postalCode}
              disabled={!canEdit}
              aria-invalid={addressStarted && !draft.postalCode.trim() ? true : undefined}
              onChange={(e) => set({ postalCode: e.target.value })}
            />
            {addressStarted && !draft.postalCode.trim() ? (
              <p className="text-xs text-destructive">Enter a postcode.</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="addr-country">Country</Label>
            <Select
              value={draft.country}
              disabled={!canEdit}
              onValueChange={(value) => set({ country: value })}
            >
              <SelectTrigger id="addr-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countries.map((code) => (
                  <SelectItem key={code} value={code}>
                    {countryLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="tax-retention"
        title="Data retention"
        help="If you ever close the business, how long bookings, clients and invoices stay available to export before they're anonymised."
      >
        <div className="grid max-w-xs gap-2">
          <Label htmlFor="retention-days">Export window after closing (days)</Label>
          <Input
            id="retention-days"
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.closureDays}
            disabled={!canEdit}
            aria-invalid={!closureValid ? true : undefined}
            onChange={(e) => set({ closureDays: e.target.value })}
          />
          <p className={cn("text-xs", closureValid ? "text-muted-foreground" : "text-destructive")}>
            {closureValid ? "30 days is usual." : "A whole number of days, 1 or more."}
          </p>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
