import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/ui-bits";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useCancelPlatformBillingImmediate,
  useCreatePlatformOverride,
  useDeadLetterOutbox,
  useFailedOutbox,
  usePlans,
  usePlatformBilling,
  usePlatformOverrides,
  useReconcilePlatformBilling,
  useReplayOutbox,
  useRevokePlatformOverride,
  useStartCheckout,
  useSubscription,
  type PlatformOverride,
} from "@/lib/api/hooks";
import { formatInTz, formatMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/platform")({
  head: () => ({
    meta: [
      { title: "Platform billing — RECAVO" },
      {
        name: "description",
        content: "Plan, subscription status and platform administration tools for this business.",
      },
      { property: "og:title", content: "RECAVO Platform" },
      { property: "og:description", content: "Subscription and platform administration." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <PlatformPage />
      </AppShell>
    </RequireAuth>
  ),
});

function toastWithRequestId(title: string, requestId?: string) {
  toast.success(title, {
    description: requestId ? `Ref: ${requestId}` : undefined,
  });
}

function PlatformPage() {
  return (
    <>
      <PageHeader
        title="Platform billing"
        description="Subscription, plan and platform administration tools."
      />
      <Can
        permission={PERMISSIONS.PLATFORM_BILLING_ADMIN}
        fallback={
          <EmptyState
            title="Platform administration is restricted"
            description="Only platform billing administrators can access this area."
          />
        }
      >
        <PlatformContent />
      </Can>
    </>
  );
}

function PlatformContent() {
  const tenant = useTenant();
  const plans = usePlans();
  const subscription = useSubscription();
  const checkout = useStartCheckout();

  const currentPlan = subscription.data?.plan;
  const currentSub = subscription.data?.subscription;

  return (
    <>
      <SectionCard
        title="This business's subscription"
        description={tenant.business?.tradingName}
        action={currentSub?.status ? <StatusBadge status={currentSub.status} /> : null}
      >
        {subscription.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading subscription…</p>
        ) : subscription.isError ? (
          <EmptyState title="Couldn't load subscription" description="Please try again shortly." />
        ) : !currentSub ? (
          <EmptyState
            title="No active subscription"
            description="This business hasn't subscribed to a plan yet."
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-1 font-medium">{currentPlan?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Access</dt>
              <dd className="mt-1 font-medium capitalize">{currentSub.accessState ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Renews</dt>
              <dd className="mt-1 font-medium">
                {currentSub.currentPeriodEnd
                  ? new Date(currentSub.currentPeriodEnd).toLocaleDateString("en-GB")
                  : "—"}
                {currentSub.cancelAtPeriodEnd ? " (cancelling)" : ""}
              </dd>
            </div>
          </dl>
        )}
      </SectionCard>

      <SectionCard title="Plan catalogue" bodyClassName="p-0">
        {plans.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading plans…</p>
        ) : plans.isError ? (
          <div className="p-6">
            <EmptyState title="Couldn't load plans" />
          </div>
        ) : (
          <div className="grid gap-5 p-5 sm:grid-cols-3">
            {(plans.data ?? []).map((p) => (
              <div key={p.code} className="surface-card p-5">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Building2 className="size-4" /> {p.name}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {p.prices[0] ? formatMoney(p.prices[0].amountMinor, p.currency) : "—"}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{p.prices[0]?.interval ?? "month"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{p.trialDays} day free trial</p>
                <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                  {Object.entries(p.limits).map(([key, value]) => (
                    <li key={key} className="flex justify-between gap-2">
                      <span className="capitalize">{key.replace(/[._]/g, " ")}</span>
                      <span className="font-medium">{value}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  disabled={checkout.isPending}
                  onClick={async () => {
                    const interval = p.prices[0]?.interval ?? "month";
                    const result = await checkout.mutateAsync({
                      plan: p.code,
                      interval,
                    });
                    const url = result.url ?? result.checkoutUrl;
                    if (url) window.location.assign(url);
                    else toast.success("Checkout started");
                  }}
                >
                  <ArrowUpRight className="size-4" /> Start checkout
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <PlatformBillingAdminSection />

      <TenantOutboxSection />
    </>
  );
}

/** Tenant-scoped outbox tools — clearly separate from cross-tenant platform admin above. */
function TenantOutboxSection() {
  const failed = useFailedOutbox();
  const deadLetter = useDeadLetterOutbox();
  const replay = useReplayOutbox();

  return (
    <SectionCard
      title="This business — outbox & background jobs"
      description="Tenant-scoped event delivery for the business you're currently signed into (not cross-tenant platform admin)."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4" /> Failed events
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {failed.isLoading ? "…" : (failed.data?.length ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4" /> Dead-letter
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {deadLetter.isLoading ? "…" : (deadLetter.data?.length ?? 0)}
          </p>
        </div>
      </div>
      <Button
        className="mt-4"
        variant="outline"
        disabled={replay.isPending}
        onClick={async () => {
          const result = await replay.mutateAsync();
          toastWithRequestId("Replay requested", result.requestId);
        }}
      >
        <RefreshCw className="size-4" /> Replay failed events
      </Button>
    </SectionCard>
  );
}

const BUSINESS_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cross-tenant platform billing (RECA-509). Takes an arbitrary `businessId`
 * looked up by id — never the caller's own tenant by default.
 */
function PlatformBillingAdminSection() {
  const [lookupInput, setLookupInput] = useState("");
  const [targetBusinessId, setTargetBusinessId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const billing = usePlatformBilling(targetBusinessId ?? undefined);
  const overrides = usePlatformOverrides(targetBusinessId ?? undefined);
  const reconcile = useReconcilePlatformBilling();
  const cancelImmediate = useCancelPlatformBillingImmediate();

  const submitLookup = () => {
    const id = lookupInput.trim();
    if (!BUSINESS_ID_RE.test(id)) {
      toast.error("Enter a valid business id (UUID)");
      return;
    }
    setTargetBusinessId(id);
  };

  return (
    <SectionCard
      title="Cross-tenant billing admin"
      description="Look up any business by id — Stripe projection, access state and entitlement overrides. Separate from this business's tenant tools below."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-[280px] flex-1 gap-1.5">
          <Label htmlFor="platform-lookup">Business id</Label>
          <Input
            id="platform-lookup"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitLookup();
            }}
          />
        </div>
        <Button onClick={submitLookup}>
          <Search className="size-4" /> Look up
        </Button>
      </div>

      {!targetBusinessId ? null : billing.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading billing view…</p>
      ) : billing.isError ? (
        <div className="mt-4">
          <EmptyState
            title="Couldn't load this business"
            description="Check the id is correct — platform admin access and privileged MFA are required."
          />
        </div>
      ) : billing.data ? (
        <div className="mt-5 space-y-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Business</dt>
              <dd className="mt-1 font-medium">
                {billing.data.business?.tradingName ?? targetBusinessId}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Access state</dt>
              <dd className="mt-1 font-medium capitalize">{billing.data.accessState ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Stripe customer</dt>
              <dd className="mt-1 font-mono text-xs">{billing.data.stripeCustomerId ?? "—"}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={reconcile.isPending}
              onClick={async () => {
                try {
                  const result = await reconcile.mutateAsync(targetBusinessId);
                  toastWithRequestId("Reconciled with Stripe", result.requestId);
                } catch {
                  // Errors surfaced via hook's onError toast.
                }
              }}
            >
              <RefreshCw className="size-4" /> Reconcile from Stripe
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={cancelImmediate.isPending}>
                  <XCircle className="size-4" /> Cancel immediately
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this subscription immediately?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cancels in Stripe right away — access ends now, not at the current period end.
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-1.5">
                  <Label htmlFor="cancel-immediate-reason">Reason</Label>
                  <Textarea
                    id="cancel-immediate-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Required — recorded in the audit log"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={!cancelReason.trim()}
                    onClick={async () => {
                      try {
                        const result = await cancelImmediate.mutateAsync({
                          businessId: targetBusinessId,
                          reason: cancelReason.trim(),
                        });
                        setCancelReason("");
                        toastWithRequestId("Subscription cancelled immediately", result.requestId);
                      } catch {
                        // Errors surfaced via hook's onError toast.
                      }
                    }}
                  >
                    Cancel immediately
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Entitlement overrides</p>
            <PlatformOverridesTable
              businessId={targetBusinessId}
              overrides={overrides.data ?? []}
              isLoading={overrides.isLoading}
              isError={overrides.isError}
            />
          </div>

          <CreateOverrideForm businessId={targetBusinessId} />
        </div>
      ) : null}
    </SectionCard>
  );
}

function PlatformOverridesTable({
  businessId,
  overrides,
  isLoading,
  isError,
}: {
  businessId: string;
  overrides: PlatformOverride[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading overrides…</p>;
  if (isError) return <p className="text-sm text-destructive">Couldn't load overrides.</p>;
  if (overrides.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No entitlement overrides for this business.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs text-muted-foreground">
          <tr>
            {["Kind", "Target", "Reason", "Window", "Status", ""].map((h) => (
              <th key={h} className="px-4 py-2 text-left font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {overrides.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{o.kind}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                {o.featureKey ?? o.limitKey ?? "—"}
                {o.limitValue !== null && o.limitValue !== undefined ? ` = ${o.limitValue}` : ""}
              </td>
              <td className="max-w-[220px] truncate px-4 py-2.5 text-xs" title={o.reason}>
                {o.reason}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                {formatInTz(o.startsAt, "Europe/London", { dateStyle: "short" })}
                {o.endsAt
                  ? ` – ${formatInTz(o.endsAt, "Europe/London", { dateStyle: "short" })}`
                  : ""}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={o.revokedAt ? "cancelled" : "active"} />
              </td>
              <td className="px-4 py-2.5 text-right">
                {!o.revokedAt ? (
                  <RevokeOverrideButton businessId={businessId} override={o} />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevokeOverrideButton({
  businessId,
  override,
}: {
  businessId: string;
  override: PlatformOverride;
}) {
  const revoke = useRevokePlatformOverride(businessId);
  const [reason, setReason] = useState("");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={revoke.isPending}>
          <Trash2 className="size-3.5" /> Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this override?</AlertDialogTitle>
          <AlertDialogDescription>
            Soft-revokes the {override.kind} override and invalidates the cached effective policy
            for this business.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`revoke-reason-${override.id}`}>Reason</Label>
          <Textarea
            id={`revoke-reason-${override.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required — recorded in the audit log"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim()}
            onClick={async () => {
              try {
                const result = await revoke.mutateAsync({
                  overrideId: override.id,
                  reason: reason.trim(),
                });
                setReason("");
                toastWithRequestId("Override revoked", result.requestId);
              } catch {
                // Errors surfaced via hook's onError toast.
              }
            }}
          >
            Revoke override
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateOverrideForm({ businessId }: { businessId: string }) {
  const createOverride = useCreatePlatformOverride(businessId);
  const [kind, setKind] = useState<PlatformOverride["kind"]>("grant");
  const [featureKey, setFeatureKey] = useState("");
  const [limitKey, setLimitKey] = useState("");
  const [limitValue, setLimitValue] = useState("");
  const [reason, setReason] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const needsConfirmation = kind === "billing_bypass" || kind === "suspension";
  const needsEndsAt = kind === "billing_bypass";
  const needsLimit = kind === "limit";
  const needsFeature = kind === "grant" || kind === "deny";

  const canSubmit =
    reason.trim().length > 0 &&
    (!needsFeature || featureKey.trim().length > 0) &&
    (!needsLimit || (limitKey.trim().length > 0 && limitValue.trim().length > 0)) &&
    (!needsEndsAt || endsAt.trim().length > 0) &&
    (!needsConfirmation || confirmation.trim() === "CONFIRM");

  const reset = () => {
    setFeatureKey("");
    setLimitKey("");
    setLimitValue("");
    setReason("");
    setEndsAt("");
    setConfirmation("");
  };

  return (
    <div className="rounded-xl border p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4" /> Create entitlement override
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="override-kind">Kind</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as PlatformOverride["kind"])}>
            <SelectTrigger id="override-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grant">Grant feature</SelectItem>
              <SelectItem value="deny">Deny feature</SelectItem>
              <SelectItem value="limit">Override limit</SelectItem>
              <SelectItem value="billing_bypass">Billing bypass</SelectItem>
              <SelectItem value="suspension">Suspend access</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {needsFeature ? (
          <div className="grid gap-1.5">
            <Label htmlFor="override-feature">Feature key</Label>
            <Input
              id="override-feature"
              value={featureKey}
              onChange={(e) => setFeatureKey(e.target.value)}
              placeholder="booking.online"
            />
          </div>
        ) : null}

        {needsLimit ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="override-limit-key">Limit key</Label>
              <Input
                id="override-limit-key"
                value={limitKey}
                onChange={(e) => setLimitKey(e.target.value)}
                placeholder="staff.active"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="override-limit-value">Limit value</Label>
              <Input
                id="override-limit-value"
                type="number"
                min={0}
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
              />
            </div>
          </>
        ) : null}

        {needsEndsAt ? (
          <div className="grid gap-1.5">
            <Label htmlFor="override-ends-at">Ends at</Label>
            <Input
              id="override-ends-at"
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        ) : null}

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="override-reason">Reason</Label>
          <Textarea
            id="override-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required — recorded in the audit log"
          />
        </div>

        {needsConfirmation ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="override-confirm">
              Type CONFIRM to {kind === "suspension" ? "suspend access" : "bypass billing"}
            </Label>
            <Input
              id="override-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="CONFIRM"
            />
          </div>
        ) : null}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="mt-4" disabled={!canSubmit || createOverride.isPending}>
            Create override
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create this override?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately changes what this business can access and invalidates their cached
              entitlements. It's fully auditable and can be revoked later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const result = await createOverride.mutateAsync({
                    kind,
                    featureKey: needsFeature ? featureKey.trim() : null,
                    limitKey: needsLimit ? limitKey.trim() : null,
                    limitValue: needsLimit ? Number(limitValue) : null,
                    reason: reason.trim(),
                    endsAt: needsEndsAt ? new Date(`${endsAt}T23:59:59.999Z`).toISOString() : null,
                    confirmation: needsConfirmation ? "CONFIRM" : undefined,
                  });
                  toastWithRequestId("Override created", result.requestId);
                  reset();
                } catch {
                  // Errors surfaced via hook's onError toast.
                }
              }}
            >
              Create override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
