import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, MessageSquareText } from "lucide-react";
import { EmptyState, SectionCard, StatusBadge } from "@/components/ui-bits";
import { PageGhost } from "@/components/ghost";
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
  SMS_ADDON_KEY,
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
} from "@/lib/api/hooks";
import type {
  PublicCataloguePlan,
  SaasInterval,
  SaasPlanCode,
  SubscriptionChangePreview,
} from "@/lib/api/types";
import { isBillingBlocked, subscriptionAccessState } from "@/lib/billing/access";
import { formatInTz, formatMoney } from "@/lib/format";
import { canManageSaasBilling } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

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
        "Email reminders (SMS bolt-on +£10/mo)",
        "Core revenue reporting",
      ],
    },
    business: {
      tagline: "Studio teams with coaches and more than one site.",
      popular: true,
      bullets: [
        "Trainer availability and role permissions",
        "Packages, credits and memberships",
        "Group sessions and out-call training",
        "SMS + email reminders included",
        "Progress tracking and measurements",
        "Full reporting suite",
      ],
    },
    growth: {
      tagline: "Larger gyms or multi-site operators.",
      bullets: [
        "Advanced admin and permissions",
        "SMS + email reminders included",
        "Custom branding",
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
        "Email reminders (SMS bolt-on +£10/mo)",
        "Core revenue reporting",
      ],
    },
    business: {
      tagline: "Teams with more than one bay or van.",
      popular: true,
      bullets: [
        "Staff availability and role permissions",
        "Multi-service jobs with rolled-up pricing",
        "Vehicles saved to every customer",
        "SMS + email reminders included",
        "Full reporting suite",
      ],
    },
    growth: {
      tagline: "Larger workshops or multi-site operators.",
      bullets: [
        "Advanced admin and permissions",
        "SMS + email reminders included",
        "Custom branding",
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

/**
 * Bolt-ons sold on top of the plan (RECA-527). Today that is SMS reminders: bundled
 * in Business and Growth, £10/month on Solo. Reads/writes the same entitlement the
 * client-channel gate and the reminder worker use, so what it shows is what sends.
 */
function AddonsCard({
  addons,
  currentPlanName,
  disabled,
}: {
  addons: SubscriptionAddon[];
  currentPlanName: string | null;
  disabled: boolean;
}) {
  const add = useAddSubscriptionAddon();
  const remove = useRemoveSubscriptionAddon();
  const sms = addons.find((a) => a.key === SMS_ADDON_KEY);
  if (!sms) return null;

  const price = `${formatMoney(sms.unitAmountMinor, sms.currency, { compact: true })}/${sms.interval}`;
  const busy = add.isPending || remove.isPending;

  return (
    <SectionCard
      title="Add-ons"
      description="Extras you can switch on without changing plan. Prorated onto your current bill."
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">SMS reminders</p>
            <p className="text-xs text-muted-foreground">
              {sms.status === "included"
                ? `Included in ${currentPlanName ?? "your plan"}. Clients set to SMS get texted before every booking.`
                : sms.status === "active"
                  ? `Active · ${price}. Clients set to SMS get texted before every booking.`
                  : `Text clients before every booking instead of relying on email. ${price}, or included with Business and Growth.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sms.status === "included" ? (
            <StatusBadge status="active" />
          ) : sms.status === "active" ? (
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
                    <AlertDialogTitle>Remove SMS reminders?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Clients set to SMS will get email reminders instead from now on. The unused
                      part of this month is credited to your next invoice.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep SMS</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await remove.mutateAsync(SMS_ADDON_KEY);
                        toast.success("SMS reminders removed");
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
                await add.mutateAsync(SMS_ADDON_KEY);
                toast.success("SMS reminders added", {
                  description: `${price} has been added to your subscription.`,
                });
              }}
            >
              {add.isPending ? "Adding…" : `Add for ${price}`}
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function BillingPage() {
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

  const current = subscription.data?.subscription;
  const plan = subscription.data?.plan;
  const tz = tenant.business?.defaultTimezone ?? "Europe/London";
  const blocked = isBillingBlocked(current);
  const canManage = canManageSaasBilling({
    can: tenant.can,
    roleKeys: tenant.roleKeys,
    blocked,
  });

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

  const startCheckout = async (p: PublicCataloguePlan) => {
    const price = p.prices.find((x) => x.interval === interval) ?? p.prices[0];
    const result = await checkout.mutateAsync({
      plan: p.code,
      interval: price?.interval ?? interval,
    });
    const url = result.checkoutUrl ?? result.url;
    if (url) window.location.assign(url);
  };

  const openPortal = async () => {
    const result = await portal.mutateAsync();
    const url = result.portalUrl ?? result.url;
    if (url) window.location.assign(url);
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
            <div className="flex flex-wrap gap-2">
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
                        Access continues until the current period ends. You can resume before then.
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
          </div>
        </SectionCard>
      ) : null}

      {!blocked && current && subscription.data?.addons?.length ? (
        <AddonsCard
          addons={subscription.data.addons}
          currentPlanName={currentPlan?.name ?? plan?.name ?? null}
          disabled={!canManage}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
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
              Credit now: {formatMoney(previewResult.creditNowMinor, previewResult.currency)} · Tax:{" "}
              {formatMoney(previewResult.taxMinor, previewResult.currency)}
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
    </div>
  );
}
