import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import {
  GroupedBlock,
  PlanGatedRow,
  StatusPill,
  SwitchRow,
  useSavedTick,
} from "@/components/settings/primitives";
import { useSettingsDraft } from "@/components/settings/save-bar";
import { StatusBadge } from "@/components/ui-bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  useAddSubscriptionAddon,
  useRemoveSubscriptionAddon,
  useSubscription,
  useUpdateConfiguration,
} from "@/lib/api/hooks";
import { useInvoicingAddon, useInvoicingEntitled } from "@/lib/api/invoices";
import { isBillingBlocked } from "@/lib/billing/access";
import { formatMoney } from "@/lib/format";
import { useIapProducts, useIapPurchase } from "@/hooks/use-iap";
import { billingSurface } from "@/lib/native";
import { openIapManagement } from "@/lib/iap";
import { subscriptionManagedHere } from "@/lib/billing/access";
import { currentStoreCopy, storeCopyFor } from "@/lib/store-copy";
import {
  DEFAULT_DUE_DAYS,
  DEFAULT_NUMBER_PREFIX,
  INVOICING_ADDON_KEY,
  INVOICING_FEATURE_KEY,
  NUMBER_PREFIX_MAX_LENGTH,
  isValidNumberPrefix,
  nextInvoiceNumberPreview,
  type InvoicingConfig,
} from "@/lib/invoices";
import { PERMISSIONS, canManageSaasBilling } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const FOOTER_MAX = 1000;
const DUE_DAYS_MAX = 365;

type FormState = {
  autoSendOnCompletion: boolean;
  numberPrefix: string;
  dueDays: string;
  footerNote: string;
};

function fromConfig(saved: InvoicingConfig | undefined): FormState {
  return {
    autoSendOnCompletion: saved?.autoSendOnCompletion !== false,
    numberPrefix: saved?.numberPrefix ?? DEFAULT_NUMBER_PREFIX,
    dueDays: String(saved?.dueDays ?? DEFAULT_DUE_DAYS),
    footerNote: saved?.footerNote ?? "",
  };
}

/**
 * Invoicing settings (ADR 0019) plus the plan gate that unlocks them. Numbering,
 * payment terms and the PDF footer save on their own; the bolt-on control reads
 * the same subscription view the paywall does, so what it shows is what the API
 * will allow.
 *
 * `card` is the self-contained block; `section` (Settings → Get paid) is the
 * plan-gated row plus fields under the page's save bar, with the automatic
 * invoicing switch saving straight away.
 */
export function InvoicingSetting({
  className,
  variant = "card",
}: {
  className?: string;
  variant?: "card" | "section";
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const update = useUpdateConfiguration();
  const subscription = useSubscription();
  const addon = useInvoicingAddon();
  const entitled = useInvoicingEntitled();
  const addAddon = useAddSubscriptionAddon();
  const removeAddon = useRemoveSubscriptionAddon();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const [autoTick, flashAuto] = useSavedTick();

  // `invoicing` isn't on the committed OpenAPI snapshot yet; read it through the
  // local shape until the schema is refreshed.
  const saved = (tenant.configuration as { invoicing?: InvoicingConfig } | null | undefined)
    ?.invoicing;
  const bankTransferOn = tenant.configuration?.bankTransfer?.enabled === true;

  const [form, setForm] = useState<FormState>(() => fromConfig(saved));
  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const savedSnapshot = JSON.stringify(saved ?? null);
  useEffect(() => {
    if (dirty) return;
    setForm(fromConfig(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSnapshot]);

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setFieldErrors({});
  };

  const prefixValid = isValidNumberPrefix(form.numberPrefix);
  const dueDaysNumber = Number(form.dueDays);
  const dueDaysValid =
    form.dueDays.trim() !== "" &&
    Number.isInteger(dueDaysNumber) &&
    dueDaysNumber >= 0 &&
    dueDaysNumber <= DUE_DAYS_MAX;
  const footerValid = form.footerNote.length <= FOOTER_MAX;
  const formValid = prefixValid && dueDaysValid && footerValid;

  const persist = async (next: FormState) => {
    try {
      await update.mutateAsync({
        invoicing: {
          autoSendOnCompletion: next.autoSendOnCompletion,
          numberPrefix: next.numberPrefix,
          dueDays: Number(next.dueDays),
          footerNote: next.footerNote.trim() || null,
        },
      } as Parameters<typeof update.mutateAsync>[0] & { invoicing: InvoicingConfig });
      setDirty(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        const nextErrors: Partial<Record<keyof FormState, string>> = {};
        for (const fe of err.fieldErrors) {
          const key = fe.field.replace(/^invoicing\./, "") as keyof FormState;
          if (key in next) nextErrors[key] = fe.message ?? fe.code;
        }
        setFieldErrors(nextErrors);
      }
      // useUpdateConfiguration already toasts.
      throw err;
    }
  };

  const save = async () => {
    await persist(form);
    toast.success("Invoicing settings saved");
  };

  const bar = useSettingsDraft({
    dirty: variant === "section" && canEdit && entitled === true && dirty,
    valid: formValid,
    saving: update.isPending,
    save,
    discard: () => {
      setForm(fromConfig(saved));
      setDirty(false);
      setFieldErrors({});
    },
  });

  /** The automatic-invoicing switch saves on its own, carrying the saved typed values. */
  const flipAutoSend = async (checked: boolean) => {
    const base = fromConfig(saved);
    try {
      await persist({ ...base, autoSendOnCompletion: checked });
      setForm((f) => ({ ...f, autoSendOnCompletion: checked }));
      flashAuto();
    } catch {
      // Toasted already.
    }
  };

  // Bolt-on control. Bought and removed where the subscription is billed: Stripe
  // on the web, the store in a store app (at the store's price, removed via the
  // store's subscription page). A store app that cannot sell shows state only.
  const current = subscription.data?.subscription ?? null;
  const surface = billingSurface();
  const sellsHere = surface !== "none";
  const managedHere = subscriptionManagedHere(current, surface);
  const iap = useIapProducts();
  const iapFlow = useIapPurchase();
  const storeItem =
    surface === "store"
      ? iap.products.find(
          (p) => p.product.kind === "addon" && p.product.addonKey === INVOICING_ADDON_KEY,
        )
      : undefined;
  const canManageBilling =
    sellsHere &&
    managedHere &&
    (surface === "web" || Boolean(storeItem)) &&
    canManageSaasBilling({
      can: tenant.can,
      roleKeys: tenant.roleKeys,
      blocked: isBillingBlocked(current),
    });
  const price = storeItem
    ? `${storeItem.priceString}/month`
    : addon
      ? `${formatMoney(addon.unitAmountMinor, addon.currency, { compact: true })}/${addon.interval}`
      : "£8/month";
  const addonBusy = addAddon.isPending || removeAddon.isPending || iapFlow.busy;

  const buy = async () => {
    if (storeItem) {
      await iapFlow.purchase(storeItem, "Invoicing added");
      return;
    }
    try {
      const view = await addAddon.mutateAsync(INVOICING_ADDON_KEY);
      if (view.features?.[INVOICING_FEATURE_KEY]) {
        toast.success("Invoicing added", {
          description: `${price} has been added to your subscription.`,
        });
      } else {
        toast.info("Invoicing bolt-on added — activating", {
          description: "It can take a moment to switch on.",
        });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        toast.error("Choose a plan first", {
          description: "Bolt-ons need a live subscription.",
          action: { label: "Go to billing", onClick: () => void navigate({ to: "/billing" }) },
        });
      }
    }
  };

  const removeDialog = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={addonBusy}>
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove invoicing?</AlertDialogTitle>
          <AlertDialogDescription>
            You’ll no longer be able to raise, issue or send invoices, and jobs won’t be invoiced
            automatically. Everything already issued stays available to you and your clients. The
            unused part of this month is credited to your next bill.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep invoicing</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await removeAddon.mutateAsync(INVOICING_ADDON_KEY);
              toast.success("Invoicing removed");
            }}
          >
            Remove add-on
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const buyButton = (
    <Button size="sm" disabled={addonBusy || !current} onClick={() => void buy()}>
      {iapFlow.state === "purchasing"
        ? `Waiting for ${currentStoreCopy().name}…`
        : addAddon.isPending || iapFlow.state === "reconciling"
          ? "Adding…"
          : variant === "section"
            ? `Add for ${price}`
            : `Add invoicing — ${price}`}
    </Button>
  );

  const notOnPlanCopy = !sellsHere
    ? "Not on your plan"
    : current && !managedHere
      ? storeCopyFor(current.provider)
        ? `Not on your plan — add it in the ${storeCopyFor(current.provider)!.appName}`
        : "Not on your plan — add it on the website"
      : "Not on your plan — ask the owner";

  let entitlementControl: ReactNode;
  if (subscription.isLoading) {
    entitlementControl = null;
  } else if (addon?.status === "included") {
    entitlementControl = (
      <div className="flex items-center gap-2">
        <StatusBadge status="active" />
        <span className="text-xs text-muted-foreground">
          Included in {subscription.data?.plan?.name ?? "your plan"}
        </span>
      </div>
    );
  } else if (addon?.status === "active") {
    entitlementControl = (
      <div className="flex items-center gap-2">
        <StatusBadge status="active" />
        <span className="text-xs text-muted-foreground">
          {sellsHere && managedHere ? `Bolt-on · ${price}` : "Bolt-on"}
        </span>
        {canManageBilling && surface === "store" ? (
          <Button variant="outline" size="sm" onClick={() => void openIapManagement()}>
            Manage in {currentStoreCopy().name}
          </Button>
        ) : canManageBilling ? (
          removeDialog
        ) : null}
      </div>
    );
  } else if (entitled) {
    // Entitled without a sellable row (platform grant, or the catalogue hasn't caught up).
    entitlementControl = <StatusBadge status="active" />;
  } else {
    entitlementControl = canManageBilling ? (
      buyButton
    ) : (
      <span className="text-xs text-muted-foreground">{notOnPlanCopy}</span>
    );
  }

  const brandingLink = (
    <Link to="/settings/$page" params={{ page: "branding" }} className="underline">
      Branding
    </Link>
  );
  const taxLink = (
    <Link to="/settings/$page" params={{ page: "tax" }} className="underline">
      Tax
    </Link>
  );

  const typedFields = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="inv-prefix">Number prefix</Label>
          <Input
            id="inv-prefix"
            value={form.numberPrefix}
            maxLength={NUMBER_PREFIX_MAX_LENGTH}
            placeholder={DEFAULT_NUMBER_PREFIX}
            disabled={!canEdit}
            aria-invalid={!prefixValid || Boolean(fieldErrors.numberPrefix)}
            onChange={(e) => set({ numberPrefix: e.target.value })}
          />
          <p
            className={cn(
              "text-xs",
              prefixValid && !fieldErrors.numberPrefix
                ? "text-muted-foreground"
                : "text-destructive",
            )}
          >
            {fieldErrors.numberPrefix
              ? fieldErrors.numberPrefix
              : prefixValid
                ? `Next invoice: ${nextInvoiceNumberPreview(form.numberPrefix)}. Changing this later doesn’t renumber existing invoices.`
                : `Up to ${NUMBER_PREFIX_MAX_LENGTH} letters, digits, “-” or “_”.`}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inv-due-days">Payment terms (days)</Label>
          <Input
            id="inv-due-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={DUE_DAYS_MAX}
            step={1}
            value={form.dueDays}
            disabled={!canEdit}
            aria-invalid={!dueDaysValid || Boolean(fieldErrors.dueDays)}
            onChange={(e) => set({ dueDays: e.target.value })}
          />
          <p
            className={cn(
              "text-xs",
              dueDaysValid && !fieldErrors.dueDays ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {fieldErrors.dueDays
              ? fieldErrors.dueDays
              : dueDaysValid
                ? dueDaysNumber === 0
                  ? "Due on the day it’s issued."
                  : `Due ${dueDaysNumber} day${dueDaysNumber === 1 ? "" : "s"} after issue.`
                : `A whole number from 0 to ${DUE_DAYS_MAX}.`}
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="inv-footer">Footer note</Label>
        <Textarea
          id="inv-footer"
          rows={2}
          value={form.footerNote}
          maxLength={FOOTER_MAX}
          placeholder="Thank you for your business."
          disabled={!canEdit}
          aria-invalid={!footerValid || Boolean(fieldErrors.footerNote)}
          onChange={(e) => set({ footerNote: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {fieldErrors.footerNote ??
            `Printed at the bottom of every PDF. ${form.footerNote.length}/${FOOTER_MAX}`}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        {bankTransferOn
          ? "Your bank details from “Pay by bank transfer” are printed under “How to pay” while a balance is due."
          : "Turn on “Pay by bank transfer” above to print your bank details under “How to pay”."}{" "}
        Logo and accent colour come from {brandingLink}; VAT rate and registration from {taxLink}.
      </p>
    </>
  );

  if (variant === "section") {
    const gated = !subscription.isLoading && entitled === false;
    return (
      <div className={cn("grid gap-4", className)}>
        {gated ? (
          <PlanGatedRow
            title="Invoicing"
            hint="Numbered PDF invoices, emailed to clients and issued automatically when a job is marked attended."
            lock="Add-on"
            priceLine={sellsHere ? `${price} on Solo and Business · Included with Growth` : null}
            canBuy={canManageBilling}
            action={
              sellsHere && !current ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/settings/$page" params={{ page: "plan" }}>
                    See plans
                  </Link>
                </Button>
              ) : canManageBilling ? (
                buyButton
              ) : (
                <span className="text-xs text-muted-foreground">{notOnPlanCopy}</span>
              )
            }
          />
        ) : (
          <GroupedBlock>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium">Invoicing</p>
                <p className="text-[13px] text-muted-foreground">
                  Numbered PDF invoices, emailed to clients and issued automatically when a job is
                  marked attended.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {subscription.isLoading ? null : addon?.status === "included" ? (
                  <StatusPill tone="mint">
                    Included in {subscription.data?.plan?.name ?? "your plan"}
                  </StatusPill>
                ) : addon?.status === "active" ? (
                  <>
                    <StatusPill tone="mint">Active</StatusPill>
                    <span className="text-xs text-muted-foreground">
                      {sellsHere && managedHere ? `Add-on · ${price}` : "Add-on"}
                    </span>
                    {canManageBilling && surface === "store" ? (
                      <Button variant="outline" size="sm" onClick={() => void openIapManagement()}>
                        Manage in {currentStoreCopy().name}
                      </Button>
                    ) : canManageBilling ? (
                      removeDialog
                    ) : null}
                  </>
                ) : (
                  <StatusPill tone="mint">Active</StatusPill>
                )}
              </div>
            </div>
            {canEdit && entitled ? (
              <SwitchRow
                id="inv-auto-send"
                label="Invoice automatically when a job is completed"
                hint="When a booking is marked attended, an invoice is issued and emailed to the client as a PDF. Off: raise invoices by hand from the booking panel."
                checked={form.autoSendOnCompletion}
                saved={autoTick}
                disabled={update.isPending}
                onCheckedChange={(checked) => void flipAutoSend(checked)}
              />
            ) : null}
          </GroupedBlock>
        )}
        {gated ? (
          <p className="text-xs text-muted-foreground">
            You can still view and download invoices already issued. These settings apply once
            invoicing is on your plan.
          </p>
        ) : canEdit ? (
          <div className="grid gap-4">
            {typedFields}
            {bar.managed ? null : (
              <div className="flex justify-end">
                <Button
                  onClick={() => void save().catch(() => undefined)}
                  disabled={update.isPending || !dirty || !formValid}
                >
                  {update.isPending ? "Saving…" : "Save invoicing settings"}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className={cn("rounded-xl border p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold tracking-tight">Invoicing</p>
            <p className="text-sm text-muted-foreground">
              Numbered PDF invoices, emailed to clients and issued automatically when a job is
              marked attended.
              {sellsHere ? ` Included with Growth; a ${price} bolt-on on Solo and Business.` : ""}
              {sellsHere && !current && !subscription.isLoading ? (
                <>
                  {" "}
                  <Link to="/billing" className="underline">
                    Choose a plan
                  </Link>{" "}
                  to switch it on.
                </>
              ) : null}
            </p>
          </div>
        </div>
        {entitlementControl}
      </div>

      {entitled === false ? (
        <p className="mt-4 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          You can still view and download invoices already issued. These settings apply once
          invoicing is on your plan.
        </p>
      ) : null}

      <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
        <div className="mt-4 grid gap-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Invoice automatically when a job is completed</p>
              <p className="text-xs text-muted-foreground">
                When a booking is marked attended, an invoice is issued and emailed to the client as
                a PDF. Off: raise invoices by hand from the booking panel.
              </p>
            </div>
            <Switch
              checked={form.autoSendOnCompletion}
              onCheckedChange={(checked) => set({ autoSendOnCompletion: checked })}
              aria-label="Invoice automatically on completion"
            />
          </div>

          {typedFields}

          <div className="flex justify-end">
            <Button
              onClick={() => void save().catch(() => undefined)}
              disabled={update.isPending || !dirty || !formValid}
            >
              {update.isPending ? "Saving…" : "Save invoicing settings"}
            </Button>
          </div>
        </div>
      </Can>
    </section>
  );
}
