import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  Check,
  ExternalLink,
  FileText,
  MessageSquareText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { EmptyState, SectionCard, StatusBadge } from "@/components/ui-bits";
import { PageGhost } from "@/components/ghost";
import { SmsCreditsCard } from "@/components/SmsCreditsCard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddSubscriptionAddon,
  useBillingCatalogue,
  useBillingPortal,
  useCancelSubscription,
  useRemoveSubscriptionAddon,
  useResumeSubscription,
  useStartCheckout,
  useSubscription,
  useSubscriptionChangeApply,
  useSubscriptionChangePreview,
  type BusinessSubscription,
  type SubscriptionAddon,
  type SubscriptionDiscount,
} from "@/lib/api/hooks";
import type {
  PublicCataloguePlan,
  SaasInterval,
  SaasPlanCode,
  SubscriptionChangePreview,
} from "@/lib/api/types";
import { useIapProducts, useIapPurchase } from "@/hooks/use-iap";
import {
  isBillingBlocked,
  subscriptionAccessState,
  subscriptionManagedHere,
  subscriptionProvider,
} from "@/lib/billing/access";
import { formatInTz, formatMoney } from "@/lib/format";
import { addonsWithInvoicing } from "@/lib/api/invoices";
import { openIapManagement, planOrder, type IapProduct } from "@/lib/iap";
import { INVOICING_ADDON_KEY } from "@/lib/invoices";
import { billingSurface } from "@/lib/native";
import { UPSELLS_ADDON_KEY } from "@/lib/api/upsells";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { openHostedFlow } from "@/lib/native";

type PlanPitch = { tagline: string; popular?: boolean; bullets: string[] };

/**
 * Plan pitch copy varies by trade. The first bullet (capacity) is generated
 * from the tenant's staff terminology; these are the trade-specific extras.
 * Keyed by the business `industryTemplateKey`; unknown trades fall back to the
 * personal-training set.
 */
const PLAN_PITCH_BY_INDUSTRY: Record<string, Record<string, PlanPitch>> = {
  personal_training: {
    solo: {
      tagline: "One trainer, one location, full control.",
      bullets: [
        "Online booking page and calendar",
        "Card payments with deposits",
        "Client records, goals and session notes",
        "Email reminders, texts from prepaid credit bundles",
        "Your logo and colours on emails and invoices (invoicing is £8/month and upsells £5/month as bolt-ons)",
        "Core revenue reporting",
      ],
    },
    business: {
      tagline: "Studio teams with coaches and more than one site.",
      popular: true,
      bullets: [
        "Trainer availability and role permissions",
        "Upsell add-ons on your booking page and after booking",
        "Packages, credits and memberships",
        "Group sessions and out-call training",
        "Email reminders, texts from prepaid credit bundles",
        "Progress tracking and measurements",
        "Full reporting suite",
      ],
    },
    growth: {
      tagline: "Larger gyms or multi-site operators.",
      bullets: [
        "Advanced admin and permissions",
        "Unlimited text reminders included",
        "Invoicing included",
        "Priority support and onboarding help",
        "Data exports",
        "Advanced automations",
      ],
    },
  },
  car_detailing: {
    solo: {
      tagline: "One-person outfit, one location, full control.",
      bullets: [
        "Online booking page and calendar",
        "Card payments with deposits",
        "Customer records with vehicle history",
        "Email reminders, texts from prepaid credit bundles",
        "Your logo and colours on emails and invoices (invoicing is £8/month and upsells £5/month as bolt-ons)",
        "Core revenue reporting",
      ],
    },
    business: {
      tagline: "Teams with more than one bay or van.",
      popular: true,
      bullets: [
        "Staff availability and role permissions",
        "Multi-service jobs with rolled-up pricing",
        "Upsell add-ons on your booking page and after booking",
        "Vehicles saved to every customer",
        "Email reminders, texts from prepaid credit bundles",
        "Full reporting suite",
      ],
    },
    growth: {
      tagline: "Larger workshops or multi-site operators.",
      bullets: [
        "Advanced admin and permissions",
        "Unlimited text reminders included",
        "Invoicing included",
        "Priority support and onboarding help",
        "Data exports",
        "Advanced automations",
      ],
    },
  },
};

const DEFAULT_PLAN_PITCH = PLAN_PITCH_BY_INDUSTRY.personal_training;

function planPitch(
  industryTemplateKey: string | undefined,
  planCode: string,
): PlanPitch | undefined {
  const set =
    (industryTemplateKey && PLAN_PITCH_BY_INDUSTRY[industryTemplateKey]) || DEFAULT_PLAN_PITCH;
  return set[planCode];
}

const CHANGE_KIND_COPY: Record<SubscriptionChangePreview["changeKind"], string> = {
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  interval_switch: "Billing interval change",
};

const CHANGE_TIMING_COPY: Record<SubscriptionChangePreview["timing"], string> = {
  immediate: "immediately",
  period_end: "at the end of your current period",
};

function pluralize(word: string, count: number): string {
  const lower = word.toLowerCase();
  if (count === 1) return lower;
  if (lower.endsWith("s")) return lower;
  return `${lower}s`;
}

function capacityBullet(plan: PublicCataloguePlan, staffTerm: string): string {
  const staff = Number(plan.limits["staff.active"] ?? 0);
  const locations = Number(plan.limits["locations.active"] ?? 0);
  const person = pluralize(staffTerm || "trainer", staff || 1);
  const loc = locations === 1 ? "location" : "locations";
  if (staff <= 1 && locations <= 1) return `1 ${person}, 1 ${loc}`;
  return `Up to ${staff} ${person}, ${locations} ${loc}`;
}

function FeatureRow({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{label}</span>
    </li>
  );
}

function accessCopy(sub: BusinessSubscription | null | undefined): string {
  switch (subscriptionAccessState(sub)) {
    case "none":
      return "Choose a plan to start your 14-day trial. We’ll take a card now and only charge when the trial ends.";
    case "pending":
      return "Checkout isn’t finished yet. Pick a plan again to complete it.";
    case "restricted":
      return "This workspace is read-only until billing is updated.";
    case "ended":
      return "Your subscription has ended. Choose a plan to reopen the console.";
    default:
      return "Manage your Recavo plan, invoices and cancellation.";
  }
}

type AddonCopy = {
  name: string;
  icon: typeof FileText;
  /** Bundled by the plan tier. */
  included: (planName: string) => string;
  /** Held via the bolt-on. */
  active: (price: string) => string;
  /** Purchasable (or, for platform-only add-ons, how to ask for it). */
  available: (price: string) => string;
  removeTitle: string;
  removeBody: string;
  keepLabel: string;
  addedTitle: string;
  removedTitle: string;
};

/**
 * Copy per sellable bolt-on (ADR 0019). Anything the catalogue returns that isn't
 * listed here is rendered with generic wording rather than hidden. Texting is no
 * longer a bolt-on — it's prepaid credits (ADR 0020), shown in its own card.
 */
const ADDON_COPY: Record<string, AddonCopy> = {
  [INVOICING_ADDON_KEY]: {
    name: "Invoicing",
    icon: FileText,
    included: (plan) =>
      `Included in ${plan}. Numbered PDF invoices, emailed to clients and issued automatically when a job is completed.`,
    active: (price) =>
      `Active · ${price}. Numbered PDF invoices, emailed to clients and issued automatically when a job is completed.`,
    available: (price) =>
      `Raise numbered PDF invoices, email them to clients and invoice jobs automatically on completion. ${price}, or included with Growth.`,
    removeTitle: "Remove invoicing?",
    removeBody:
      "You’ll no longer be able to raise, issue or send invoices, and jobs won’t be invoiced automatically. Everything already issued stays available to you and your clients. The unused part of this month is credited to your next invoice.",
    keepLabel: "Keep invoicing",
    addedTitle: "Invoicing added",
    removedTitle: "Invoicing removed",
  },
  [UPSELLS_ADDON_KEY]: {
    name: "Upsells",
    icon: Sparkles,
    included: (plan) =>
      `Included in ${plan}. Offer add-ons with each service on your booking page and by email after you book someone in, at a price you set.`,
    active: (price) =>
      `Active · ${price}. Offer add-ons with each service on your booking page and by email after you book someone in, at a price you set.`,
    available: (price) =>
      `Pair add-ons with your services: customers tick them when booking online, and get an offer email when you book them in. ${price}, or included with Business and Growth.`,
    removeTitle: "Remove upsells?",
    removeBody:
      "Extras will stop showing on your booking page and no more offer emails will go out. Add-ons already on bookings stay as they are, and your pairings are kept for when you switch it back on. The unused part of this month is credited to your next invoice.",
    keepLabel: "Keep upsells",
    addedTitle: "Upsells added",
    removedTitle: "Upsells removed",
  },
  sms_unlimited: {
    name: "Unlimited texts",
    icon: MessageSquareText,
    included: (plan) =>
      `Included in ${plan}. Every text goes out with no cap and nothing to top up.`,
    active: (price) =>
      `Active · ${price}. Every reminder and confirmation set to text goes out with no cap; your prepaid credits are kept, not spent.`,
    available: (price) =>
      `Send as many texts as you like for a flat ${price} instead of buying bundles. Arranged with us — message support and we'll switch it on.`,
    removeTitle: "Remove unlimited texts?",
    removeBody: "Texts go back to using prepaid credits.",
    keepLabel: "Keep unlimited texts",
    addedTitle: "Unlimited texts added",
    removedTitle: "Unlimited texts removed",
  },
};

function genericAddonCopy(key: string): AddonCopy {
  const name = key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ");
  return {
    name,
    icon: Check,
    included: (plan) => `Included in ${plan}.`,
    active: (price) => `Active · ${price}.`,
    available: (price) => `${price}.`,
    removeTitle: `Remove ${name}?`,
    removeBody: "The unused part of this month is credited to your next invoice.",
    keepLabel: "Keep it",
    addedTitle: `${name} added`,
    removedTitle: `${name} removed`,
  };
}

/**
 * Bolt-ons sold on top of the plan: invoicing today. Reads/writes the same
 * entitlement the feature gates use, so what it shows is what the API will allow.
 */
function AddonsCard({
  addons,
  currentPlanName,
  disabled,
  managedHere = true,
}: {
  addons: SubscriptionAddon[];
  currentPlanName: string | null;
  disabled: boolean;
  /** False when the subscription is billed elsewhere (App Store): show state only. */
  managedHere?: boolean;
}) {
  const add = useAddSubscriptionAddon();
  const remove = useRemoveSubscriptionAddon();
  if (addons.length === 0) return null;
  const busy = add.isPending || remove.isPending;

  return (
    <SectionCard
      title="Add-ons"
      description={
        managedHere
          ? "Extras you can switch on without changing plan. Prorated onto your current bill."
          : "Extras on this subscription. It is billed through the App Store, so add or remove them from Billing in the Recavo iPhone app."
      }
    >
      <div className="grid gap-3">
        {addons.map((addon) => {
          const copy = ADDON_COPY[addon.key] ?? genericAddonCopy(addon.key);
          const Icon = copy.icon;
          const price = `${formatMoney(addon.unitAmountMinor, addon.currency, { compact: true })}/${addon.interval}`;
          return (
            <div
              key={addon.key}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4"
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">{copy.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {addon.status === "included"
                      ? copy.included(currentPlanName ?? "your plan")
                      : !managedHere
                        ? addon.status === "active"
                          ? "Active."
                          : "Not on this subscription."
                        : addon.status === "active"
                          ? copy.active(price)
                          : copy.available(price)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {addon.status === "included" ? (
                  <StatusBadge status="active" />
                ) : addon.platformOnly ? (
                  addon.status === "active" ? (
                    <>
                      <StatusBadge status="active" />
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/support">Change</Link>
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/support">Ask us</Link>
                    </Button>
                  )
                ) : !managedHere ? (
                  addon.status === "active" ? (
                    <StatusBadge status="active" />
                  ) : null
                ) : addon.status === "active" ? (
                  <>
                    <StatusBadge status="active" />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={disabled || busy}>
                          Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{copy.removeTitle}</AlertDialogTitle>
                          <AlertDialogDescription>{copy.removeBody}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{copy.keepLabel}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await remove.mutateAsync(addon.key);
                              toast.success(copy.removedTitle);
                            }}
                          >
                            Remove add-on
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <Button
                    size="sm"
                    disabled={disabled || busy}
                    onClick={async () => {
                      try {
                        await add.mutateAsync(addon.key);
                        toast.success(copy.addedTitle, {
                          description: `${price} has been added to your subscription.`,
                        });
                      } catch {
                        // The hook already toasts the API error.
                      }
                    }}
                  >
                    {add.isPending ? "Adding…" : `Add for ${price}`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/**
 * "You're on a discount" strip at the top of Billing. The API mirrors the coupon
 * on the Stripe subscription (partner referral programme) as
 * `subscription.discount`; the plan cards below still show list prices, so this
 * is the one place the saving is spelled out. Renders nothing at list price.
 */
function DiscountBanner({
  discount,
  tz,
}: {
  discount: SubscriptionDiscount | null | undefined;
  tz: string;
}) {
  if (!discount) return null;
  const saving =
    discount.percentOff != null
      ? `${discount.percentOff}% off`
      : discount.amountOffMinor != null
        ? `${formatMoney(discount.amountOffMinor)} off`
        : null;
  if (!saving && !discount.label) return null;
  const until = discount.endsAt
    ? ` until ${formatInTz(discount.endsAt, tz, { dateStyle: "long" })}`
    : "";
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100"
    >
      <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        <p className="font-medium">
          Discount applied{saving ? `: ${saving}` : ""}
          {until}
        </p>
        <p className="text-emerald-800/90 dark:text-emerald-200/80">
          {discount.label ? `${discount.label}. ` : ""}
          Plan prices shown on this page are before the discount; it comes off each invoice
          automatically.
        </p>
      </div>
    </div>
  );
}

export function BillingPage() {
  // Three surfaces (see billingSurface): the web sells through Stripe, the iOS
  // app through In-App Purchase, and a store app that cannot sell shows plan
  // state only. Stable for the life of the page, so choosing here is safe.
  const surface = billingSurface();
  if (surface === "web") return <WebBillingPage />;
  if (surface === "store") return <StoreBillingPage />;
  return <InAppBillingPage />;
}

/**
 * Billing as a store app without In-App Purchase shows it. Nothing here can
 * start, change or pay for a subscription: an unsubscribed business sees a
 * plain "not active" notice, a subscribed one sees its plan and text balance.
 * Deliberately no price, no "manage on the website" line and no link out —
 * App Store guideline 3.1.3 counts those as steering to another purchase route.
 */
function InAppBillingPage() {
  const tenant = useTenant();
  const subscription = useSubscription();
  const current = subscription.data?.subscription;
  const plan = subscription.data?.plan;
  const tz = tenant.business?.defaultTimezone ?? "Europe/London";

  if (tenant.isLoading || subscription.isLoading) {
    return <PageGhost />;
  }

  if (!current || isBillingBlocked(current)) {
    return (
      <EmptyState
        title="Subscription not active"
        description={`${tenant.business?.tradingName ?? "This business"} doesn’t have an active RECAVO subscription, so the app can’t open its console right now.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Current plan"
        action={current.status ? <StatusBadge status={current.status} /> : null}
      >
        <div className="space-y-3 text-sm">
          <p>
            Plan: <span className="font-medium">{plan?.name ?? current.planVersion ?? "—"}</span>
            {current.accessState ? (
              <>
                {" "}
                · Access: <span className="font-medium capitalize">{current.accessState}</span>
              </>
            ) : null}
          </p>
          {current.trialEnd && current.accessState === "trial" ? (
            <p>Trial ends {formatInTz(current.trialEnd, tz)}</p>
          ) : current.currentPeriodEnd ? (
            <p>Period ends {formatInTz(current.currentPeriodEnd, tz)}</p>
          ) : null}
          {current.cancelAtPeriodEnd ? (
            <p className="text-amber-700 dark:text-amber-400">Cancels at period end</p>
          ) : null}
        </div>
      </SectionCard>

      <SmsCreditsCard />
    </div>
  );
}

/** Apple's standard EULA — App Store Review requires a Terms of Use link beside subscription pricing. */
const APPLE_STANDARD_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_POLICY_URL = "https://recavo.app/privacy";

function planTitle(item: IapProduct): string {
  const tier = item.product.plan ?? "";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** StoreKit says this Apple ID gets a free introductory period on the product. */
function isFreeIntro(item: IapProduct): boolean {
  return Boolean(item.introOffer) && /^[^\d]*0+([.,]0+)?[^\d]*$/.test(item.introOffer!.priceString);
}

/** "P14D" → "14 days", "P1W" → "1 week", "P1M" → "1 month", "P1Y" → "1 year". */
function describeIsoPeriod(iso: string): string {
  const m = /^P(\d+)([DWMY])$/.exec(iso);
  if (!m) return iso;
  const n = Number(m[1]);
  const unit = { D: "day", W: "week", M: "month", Y: "year" }[m[2] as "D" | "W" | "M" | "Y"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Billing in the iOS app: plans, bolt-ons and text bundles bought through
 * StoreKit (App Store Review Guideline 3.1.1). Every price on this screen is
 * the App Store's own, read from the product; the Stripe catalogue is never
 * shown. Plan changes and cancellation happen on Apple's subscription page —
 * the app reflects them once RevenueCat tells the API.
 *
 * A business billed through Stripe sees its plan read-only here (the API
 * refuses a second provider) but may still buy text bundles, which are
 * consumables and provider-agnostic.
 */
function StoreBillingPage() {
  const tenant = useTenant();
  const subscription = useSubscription();
  const iap = useIapProducts();
  const flow = useIapPurchase();
  const [interval, setInterval] = useState<SaasInterval>("month");

  const current = subscription.data?.subscription;
  const plan = subscription.data?.plan;
  const addonRows = addonsWithInvoicing(subscription.data);
  const tz = tenant.business?.defaultTimezone ?? "Europe/London";
  const blocked = isBillingBlocked(current);
  const canManage = canManageSaasBilling({
    can: tenant.can,
    roleKeys: tenant.roleKeys,
    blocked,
  });
  const managedHere = subscriptionManagedHere(current, "store");
  const stripeBilled = Boolean(current) && !blocked && subscriptionProvider(current) === "stripe";

  const planItems = useMemo(
    () =>
      iap
        .byKind("plan")
        .filter((p) => p.product.interval === interval)
        .sort((a, b) => planOrder(a.product) - planOrder(b.product)),
    [iap, interval],
  );
  const hasYearly = iap.byKind("plan").some((p) => p.product.interval === "year");
  const currentProductId =
    current && typeof current === "object" && "planVersion" in current
      ? planItems.find((p) => `${p.product.plan}_v1` === current.planVersion)?.productId
      : undefined;

  if (tenant.isLoading || subscription.isLoading) {
    return <PageGhost />;
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Ask the owner to subscribe"
        description="A business owner needs to start a Recavo plan before this workspace can be used."
      />
    );
  }

  const trialLine = (item: IapProduct) =>
    isFreeIntro(item)
      ? `${item.introOffer!.cycles > 1 ? `${item.introOffer!.cycles} × ` : ""}${describeIsoPeriod(item.introOffer!.period)} free, then `
      : "";
  // Only promise a trial StoreKit actually offers this Apple ID: eligibility is the
  // store's call (used trials, no intro offer configured, other storefront).
  const anyTrial = planItems.some(isFreeIntro);

  return (
    <div className="space-y-6">
      {!blocked && current ? <DiscountBanner discount={current.discount} tz={tz} /> : null}
      {blocked ? (
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground">
            {subscriptionAccessState(current) === "ended"
              ? "Your subscription has ended. Choose a plan to reopen the console."
              : anyTrial
                ? "Choose a plan to start your free trial. Billed through your Apple ID; cancel any time in Settings before the trial ends and you won’t be charged."
                : "Choose a plan. Billed through your Apple ID; cancel any time in Settings › Apple ID › Subscriptions."}
          </p>
        </div>
      ) : null}

      {!blocked && current ? (
        <SectionCard
          title="Current plan"
          action={current.status ? <StatusBadge status={current.status} /> : null}
        >
          <div className="space-y-3 text-sm">
            <p>
              Plan: <span className="font-medium">{plan?.name ?? current.planVersion ?? "—"}</span>
              {current.accessState ? (
                <>
                  {" "}
                  · Access: <span className="font-medium capitalize">{current.accessState}</span>
                </>
              ) : null}
            </p>
            {current.trialEnd && current.accessState === "trial" ? (
              <p>Trial ends {formatInTz(current.trialEnd, tz)}</p>
            ) : current.currentPeriodEnd ? (
              <p>Renews {formatInTz(current.currentPeriodEnd, tz)}</p>
            ) : null}
            {current.cancelAtPeriodEnd ? (
              <p className="text-amber-700 dark:text-amber-400">
                Auto-renew is off — access ends with the current period
              </p>
            ) : null}
            {stripeBilled ? (
              <p className="text-muted-foreground">
                This subscription is billed on the website, where the plan and bolt-ons are managed.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void openIapManagement()}>
                  <ExternalLink className="size-4" />
                  Manage subscription
                </Button>
                <Button variant="ghost" disabled={flow.busy} onClick={() => void flow.restore()}>
                  <RotateCcw className="size-4" />
                  {flow.state === "restoring" ? "Restoring…" : "Restore purchases"}
                </Button>
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}

      {!blocked && current && addonRows.length ? (
        stripeBilled ? (
          <AddonsCard
            addons={addonRows}
            currentPlanName={plan?.name ?? null}
            disabled
            managedHere={false}
          />
        ) : (
          <StoreAddonsCard
            addons={addonRows}
            currentPlanName={plan?.name ?? null}
            items={iap.byKind("addon")}
            flow={flow}
          />
        )
      ) : null}

      {!blocked && current ? <SmsCreditsCard /> : null}

      {managedHere || blocked ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{blocked ? "Choose a plan" : "Change plan"}</h2>
            {hasYearly ? (
              <Select value={interval} onValueChange={(v) => setInterval(v as SaasInterval)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {iap.isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="surface-card h-64 animate-pulse" />
              ))}
            </div>
          ) : planItems.length === 0 ? (
            <EmptyState
              title="Plans unavailable"
              description="The App Store didn’t return any plans. Check you’re signed in to the App Store and try again."
              action={
                <Button variant="outline" onClick={() => void iap.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <div className="grid items-stretch gap-5 pt-2 md:grid-cols-3">
              {planItems.map((item) => {
                const code = item.product.plan ?? "";
                const isCurrent = item.productId === currentProductId;
                const pitch = planPitch(tenant.business?.industryTemplateKey, code) ?? {
                  tagline: planTitle(item),
                  bullets: [],
                };
                const popular = Boolean(pitch.popular);
                // Capacity comes from the web catalogue; the store product has no limits
                // attached, so the pitch bullets stand alone here.
                const bullets = pitch.bullets.filter((b) => !/£\d/.test(b));
                return (
                  <div
                    key={item.productId}
                    className={cn(
                      "relative flex flex-col rounded-3xl border bg-card p-6 pt-8 shadow-sm",
                      popular && "border-2 border-primary shadow-md",
                    )}
                  >
                    {popular ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                        Most popular
                      </span>
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xl font-semibold tracking-tight">{planTitle(item)}</p>
                      {isCurrent ? <StatusBadge status="active" /> : null}
                    </div>
                    <p className="mt-1 min-h-10 text-sm text-muted-foreground">{pitch.tagline}</p>
                    <p className="mt-5 text-4xl font-semibold tracking-tight">
                      {item.priceString}
                      <span className="text-base font-normal text-muted-foreground">
                        /{item.product.interval ?? interval}
                      </span>
                    </p>
                    {blocked && item.introOffer ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {trialLine(item)}
                        {item.priceString}/{item.product.interval ?? interval}. Renews automatically
                        until cancelled.
                      </p>
                    ) : null}
                    <ul className="mt-6 flex-1 space-y-2.5">
                      {bullets.map((label) => (
                        <FeatureRow key={label} label={label} />
                      ))}
                    </ul>
                    <div className="mt-8">
                      {isCurrent ? (
                        <Button className="h-11 w-full rounded-full" variant="secondary" disabled>
                          Current plan
                        </Button>
                      ) : (
                        <Button
                          className="h-11 w-full rounded-full"
                          variant={popular ? "default" : "secondary"}
                          disabled={flow.busy}
                          onClick={() =>
                            void flow.purchase(
                              item,
                              blocked ? "Your plan is active" : `Switched to ${planTitle(item)}`,
                            )
                          }
                        >
                          {flow.state === "purchasing"
                            ? "Waiting for App Store…"
                            : flow.state === "reconciling"
                              ? "Activating…"
                              : blocked
                                ? item.introOffer
                                  ? "Start free trial"
                                  : "Subscribe"
                                : `Switch to ${planTitle(item)}`}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Payment is charged to your Apple ID at confirmation. Subscriptions renew automatically
              at the same price unless auto-renew is turned off at least 24 hours before the end of
              the current period. Any unused portion of a free trial is forfeited when you
              subscribe. Manage or cancel in Settings › Apple ID › Subscriptions.
            </p>
            <p className="flex flex-wrap gap-x-3">
              <a
                className="underline underline-offset-2"
                href={APPLE_STANDARD_EULA_URL}
                target="_blank"
                rel="noreferrer"
              >
                Terms of Use
              </a>
              <a
                className="underline underline-offset-2"
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noreferrer"
              >
                Privacy Policy
              </a>
              {blocked ? (
                <button
                  type="button"
                  className="underline underline-offset-2"
                  disabled={flow.busy}
                  onClick={() => void flow.restore()}
                >
                  {flow.state === "restoring" ? "Restoring…" : "Restore purchases"}
                </button>
              ) : null}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Bolt-ons bought through StoreKit. Removal happens on Apple's subscription page. */
function StoreAddonsCard({
  addons,
  currentPlanName,
  items,
  flow,
}: {
  addons: SubscriptionAddon[];
  currentPlanName: string | null;
  items: IapProduct[];
  flow: ReturnType<typeof useIapPurchase>;
}) {
  if (addons.length === 0) return null;
  return (
    <SectionCard
      title="Add-ons"
      description="Extras you can switch on without changing plan. Billed monthly through your Apple ID."
    >
      <div className="grid gap-3">
        {addons.map((addon) => {
          const copy = ADDON_COPY[addon.key] ?? genericAddonCopy(addon.key);
          const Icon = copy.icon;
          const item = items.find((p) => p.product.addonKey === addon.key);
          const price = item ? `${item.priceString}/month` : null;
          return (
            <div
              key={addon.key}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4"
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">{copy.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {addon.status === "included"
                      ? copy.included(currentPlanName ?? "your plan")
                      : addon.status === "active"
                        ? price
                          ? copy.active(price)
                          : "Active."
                        : price
                          ? copy.available(price)
                          : "Not available from the App Store right now."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {addon.status === "included" ? (
                  <StatusBadge status="active" />
                ) : addon.status === "active" ? (
                  <>
                    <StatusBadge status="active" />
                    <Button variant="outline" size="sm" onClick={() => void openIapManagement()}>
                      Manage
                    </Button>
                  </>
                ) : item ? (
                  <Button
                    size="sm"
                    disabled={flow.busy}
                    onClick={() => void flow.purchase(item, copy.addedTitle)}
                  >
                    {flow.state === "purchasing"
                      ? "Waiting for App Store…"
                      : flow.state === "reconciling"
                        ? "Activating…"
                        : `Add for ${price}`}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function WebBillingPage() {
  const tenant = useTenant();
  const subscription = useSubscription();
  const catalogue = useBillingCatalogue();
  const checkout = useStartCheckout();
  const portal = useBillingPortal();
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();
  const preview = useSubscriptionChangePreview();
  const apply = useSubscriptionChangeApply();
  const [interval, setInterval] = useState<SaasInterval>("month");
  const [previewResult, setPreviewResult] = useState<SubscriptionChangePreview | null>(null);
  const plansRef = useRef<HTMLDivElement>(null);

  const current = subscription.data?.subscription;
  const plan = subscription.data?.plan;
  const addonRows = addonsWithInvoicing(subscription.data);
  const tz = tenant.business?.defaultTimezone ?? "Europe/London";
  const blocked = isBillingBlocked(current);
  const canManage = canManageSaasBilling({
    can: tenant.can,
    roleKeys: tenant.roleKeys,
    blocked,
  });
  // An App Store subscription is Apple's to change; the website shows it but
  // offers no Stripe buttons or plan chooser for it (the API would refuse).
  const appleBilled = Boolean(current) && !blocked && subscriptionProvider(current) === "apple";

  const plans = useMemo(() => {
    const list = [...(catalogue.data ?? [])];
    list.sort((a, b) => {
      const priceA = a.prices.find((x) => x.interval === interval) ?? a.prices[0];
      const priceB = b.prices.find((x) => x.interval === interval) ?? b.prices[0];
      return (priceA?.amountMinor ?? 0) - (priceB?.amountMinor ?? 0);
    });
    return list;
  }, [catalogue.data, interval]);

  // planVersion ("solo_v1") is the only field shared with the catalogue. The
  // subscription's planId points into a separate legacy plan table whose codes
  // ("business_month") never match a catalogue code.
  const currentPlan = useMemo(
    () => plans.find((p) => p.version === current?.planVersion) ?? null,
    [plans, current?.planVersion],
  );

  // Is there a pricier tier than the one they're on? Drives the "Upgrade" vs
  // "Change plan" label on the jump button.
  const hasUpgrade = useMemo(() => {
    if (!currentPlan) return plans.length > 1;
    const priceOf = (p: PublicCataloguePlan) =>
      (p.prices.find((x) => x.interval === interval) ?? p.prices[0])?.amountMinor ?? 0;
    const currentPrice = priceOf(currentPlan);
    return plans.some((p) => p.code !== currentPlan.code && priceOf(p) > currentPrice);
  }, [plans, currentPlan, interval]);

  const jumpToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startCheckout = async (p: PublicCataloguePlan) => {
    const price = p.prices.find((x) => x.interval === interval) ?? p.prices[0];
    const result = await checkout.mutateAsync({
      plan: p.code,
      interval: price?.interval ?? interval,
    });
    const url = result.checkoutUrl ?? result.url;
    if (url) void openHostedFlow(url);
  };

  const openPortal = async () => {
    const result = await portal.mutateAsync();
    const url = result.portalUrl ?? result.url;
    if (url) void openHostedFlow(url);
  };

  if (tenant.isLoading && !canManage) {
    return <PageGhost />;
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Ask the owner to subscribe"
        description="A business owner needs to start a Recavo plan before this workspace can be used."
      />
    );
  }

  return (
    <div className="space-y-6">
      {!blocked && current ? <DiscountBanner discount={current.discount} tz={tz} /> : null}
      {/* Once a plan is in place the current-plan card carries the state; this line
            is only needed while the console is still locked. */}
      {blocked ? (
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground">{accessCopy(current)}</p>
        </div>
      ) : null}

      {!blocked && current ? (
        <SectionCard
          title="Current plan"
          action={current.status ? <StatusBadge status={current.status} /> : null}
        >
          <div className="space-y-3 text-sm">
            <p>
              Plan:{" "}
              <span className="font-medium">
                {currentPlan?.name ?? plan?.name ?? current.planVersion ?? "—"}
              </span>
              {current.accessState ? (
                <>
                  {" "}
                  · Access: <span className="font-medium capitalize">{current.accessState}</span>
                </>
              ) : null}
            </p>
            {current.trialEnd && current.accessState === "trial" ? (
              <p>Trial ends {formatInTz(current.trialEnd, tz)}</p>
            ) : current.currentPeriodEnd ? (
              <p>Period ends {formatInTz(current.currentPeriodEnd, tz)}</p>
            ) : null}
            {current.cancelAtPeriodEnd ? (
              <p className="text-amber-700 dark:text-amber-400">Cancels at period end</p>
            ) : null}
            {appleBilled ? (
              <p className="text-muted-foreground">
                Billed through the App Store. Change plan, add bolt-ons or cancel from Billing in
                the Recavo iPhone app, or in Settings › Apple ID › Subscriptions on your iPhone.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {plans.length > 0 ? (
                  <Button onClick={jumpToPlans}>
                    {hasUpgrade ? "Upgrade plan" : "Change plan"}
                    <ArrowDown className="size-4" />
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  disabled={portal.isPending}
                  onClick={() => void openPortal()}
                >
                  Manage in Stripe
                </Button>
                {current.cancelAtPeriodEnd ? (
                  <Button
                    variant="outline"
                    disabled={resume.isPending}
                    onClick={async () => {
                      await resume.mutateAsync();
                      toast.success("Subscription resumed");
                    }}
                  >
                    Resume
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" disabled={cancel.isPending}>
                        Cancel at period end
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Access continues until the current period ends. You can resume before
                          then.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep plan</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            await cancel.mutateAsync();
                            toast.success("Cancellation scheduled");
                          }}
                        >
                          Confirm cancel
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}

      {!blocked && current && addonRows.length ? (
        <AddonsCard
          addons={addonRows}
          currentPlanName={currentPlan?.name ?? plan?.name ?? null}
          disabled={!canManage || appleBilled}
          managedHere={!appleBilled}
        />
      ) : null}

      {!blocked && current ? <SmsCreditsCard /> : null}

      {appleBilled ? null : (
        <>
          {/* scroll-mt clears the sticky header when the "Upgrade plan" button jumps here. */}
          <div
            ref={plansRef}
            className="flex scroll-mt-24 flex-wrap items-center justify-between gap-3"
          >
            <h2 className="text-base font-semibold">{blocked ? "Choose a plan" : "Change plan"}</h2>
            <Select value={interval} onValueChange={(v) => setInterval(v as SaasInterval)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {catalogue.isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="surface-card h-64 animate-pulse" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState
              title="Plans unavailable"
              description="The Recavo catalogue couldn’t be loaded. Try again shortly."
            />
          ) : (
            <div className="grid items-stretch gap-5 pt-2 md:grid-cols-3">
              {plans.map((p) => {
                const price = p.prices.find((x) => x.interval === interval) ?? p.prices[0];
                const isCurrent = currentPlan?.code === p.code;
                const pitch = planPitch(tenant.business?.industryTemplateKey, p.code) ?? {
                  tagline: p.name,
                  bullets: [],
                };
                const popular = Boolean(pitch.popular);
                const bullets = [capacityBullet(p, tenant.terminology.staff), ...pitch.bullets];
                return (
                  <div
                    key={p.code}
                    className={cn(
                      "relative flex flex-col rounded-3xl border bg-card p-6 pt-8 shadow-sm",
                      popular && "border-2 border-primary shadow-md",
                    )}
                  >
                    {popular ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                        Most popular
                      </span>
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xl font-semibold tracking-tight">{p.name}</p>
                      {isCurrent ? <StatusBadge status="active" /> : null}
                    </div>
                    <p className="mt-1 min-h-10 text-sm text-muted-foreground">{pitch.tagline}</p>
                    <p className="mt-5 text-4xl font-semibold tracking-tight">
                      {price ? formatMoney(price.amountMinor, p.currency, { compact: true }) : "—"}
                      <span className="text-base font-normal text-muted-foreground">
                        /{price?.interval ?? interval}
                      </span>
                    </p>
                    <ul className="mt-6 flex-1 space-y-2.5">
                      {bullets.map((label) => (
                        <FeatureRow key={label} label={label} />
                      ))}
                    </ul>
                    <div className="mt-8">
                      {blocked || !current ? (
                        <Button
                          className="h-11 w-full rounded-full"
                          variant={popular ? "default" : "secondary"}
                          disabled={checkout.isPending}
                          onClick={() => void startCheckout(p)}
                        >
                          {checkout.isPending ? "Starting checkout…" : "Start free trial"}
                        </Button>
                      ) : isCurrent ? (
                        <Button className="h-11 w-full rounded-full" variant="secondary" disabled>
                          Current plan
                        </Button>
                      ) : (
                        <Button
                          className="h-11 w-full rounded-full"
                          variant={popular ? "default" : "secondary"}
                          disabled={preview.isPending}
                          onClick={async () => {
                            const result = await preview.mutateAsync({
                              plan: p.code as SaasPlanCode,
                              interval: (price?.interval ?? interval) as SaasInterval,
                            });
                            setPreviewResult(result);
                          }}
                        >
                          {preview.isPending ? "Checking…" : `Switch to ${p.name}`}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {previewResult ? (
            <SectionCard title="Change preview">
              <div className="space-y-3 text-sm">
                <p>
                  {CHANGE_KIND_COPY[previewResult.changeKind]}, effective{" "}
                  {formatInTz(previewResult.effectiveAt, tz)} (
                  {CHANGE_TIMING_COPY[previewResult.timing]}).
                </p>
                <p>
                  Charge now: {formatMoney(previewResult.chargeNowMinor, previewResult.currency)} ·
                  Credit now: {formatMoney(previewResult.creditNowMinor, previewResult.currency)} ·
                  Tax: {formatMoney(previewResult.taxMinor, previewResult.currency)}
                </p>
                {previewResult.overLimitBlockers.length > 0 ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    Blockers:{" "}
                    {previewResult.overLimitBlockers
                      .map((b) => `${b.limitKey} (${b.currentUsage}/${b.targetLimit})`)
                      .join(", ")}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    disabled={apply.isPending || previewResult.overLimitBlockers.length > 0}
                    onClick={async () => {
                      await apply.mutateAsync({ previewToken: previewResult.previewToken });
                      setPreviewResult(null);
                      toast.success("Plan change applied");
                    }}
                  >
                    Apply change
                  </Button>
                  <Button variant="outline" onClick={() => setPreviewResult(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
