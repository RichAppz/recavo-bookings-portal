import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, Building2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useDeadLetterOutbox,
  useFailedOutbox,
  usePlans,
  useReplayOutbox,
  useStartCheckout,
  useSubscription,
} from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format";
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
  const failed = useFailedOutbox();
  const deadLetter = useDeadLetterOutbox();
  const replay = useReplayOutbox();

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

      <SectionCard
        title="Outbox and background jobs"
        description="Event delivery health for this business"
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
            await replay.mutateAsync();
            toast.success("Replay requested");
          }}
        >
          <RefreshCw className="size-4" /> Replay failed events
        </Button>
      </SectionCard>
    </>
  );
}
