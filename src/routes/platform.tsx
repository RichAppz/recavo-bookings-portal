import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, Building2, RefreshCw, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useDeadLetterOutbox,
  useFailedJobs,
  useFailedOutbox,
  usePlans,
  useReplayOutbox,
  useReconcilePayments,
  useRepublishOutboxEvent,
  useResetFailedJob,
  useRunFilesRetention,
  useRunRetention,
  useStartCheckout,
  useSubscription,
} from "@/lib/api/hooks";
import type { FailedJob, OutboxEvent } from "@/lib/api/types";
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

      <Can permission={PERMISSIONS.AUDIT_READ}>
        <OpsSection />
      </Can>
    </>
  );
}

function OpsSection() {
  const failedJobs = useFailedJobs({ limit: 50 });
  const failedOutbox = useFailedOutbox({ limit: 50 });
  const deadLetter = useDeadLetterOutbox({ limit: 50 });
  const resetJob = useResetFailedJob();
  const republish = useRepublishOutboxEvent();
  const replay = useReplayOutbox();
  const reconcile = useReconcilePayments();
  const runRetention = useRunRetention();
  const runFilesRetention = useRunFilesRetention();

  const [resetJobId, setResetJobId] = useState<string | null>(null);
  const [republishEvent, setRepublishEvent] = useState<OutboxEvent | null>(null);
  const [reconcileFrom, setReconcileFrom] = useState("");
  const [reconcileTo, setReconcileTo] = useState("");

  const failedEventIds = (failedOutbox.data ?? []).map((e) => e.id);

  return (
    <>
      <SectionCard title="Failed background jobs" bodyClassName="p-0">
        {failedJobs.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading failed jobs…</p>
        ) : (failedJobs.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState title="No failed jobs" description="Background job queue is healthy." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  {["Job", "Status", "Attempts", "Run at", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(failedJobs.data ?? []).map((job: FailedJob) => (
                  <tr key={job.id}>
                    <td className="px-4 py-3 font-medium">{job.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{job.attempts}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(job.runAt).toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => setResetJobId(job.id)}>
                        Reset
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Failed outbox events" bodyClassName="p-0">
        {failedOutbox.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : (failedOutbox.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState title="No failed events" />
          </div>
        ) : (
          <OutboxTable events={failedOutbox.data ?? []} onRepublish={setRepublishEvent} />
        )}
        <div className="border-t p-4">
          <Button
            variant="outline"
            disabled={replay.isPending || failedEventIds.length === 0}
            onClick={async () => {
              const result = await replay.mutateAsync({ eventIds: failedEventIds });
              toast.success("Replay requested", {
                description: result.requestId ? `Ref: ${result.requestId}` : undefined,
              });
            }}
          >
            <RefreshCw className="size-4" /> Replay all failed events ({failedEventIds.length})
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Dead-letter outbox" bodyClassName="p-0">
        {deadLetter.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : (deadLetter.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState title="No dead-letter events" />
          </div>
        ) : (
          <OutboxTable events={deadLetter.data ?? []} onRepublish={setRepublishEvent} />
        )}
      </SectionCard>

      <SectionCard title="Payments reconcile" description="Reconcile provider payments for a date range">
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="reconcile-from">From</Label>
            <Input
              id="reconcile-from"
              type="date"
              value={reconcileFrom}
              onChange={(e) => setReconcileFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reconcile-to">To</Label>
            <Input
              id="reconcile-to"
              type="date"
              value={reconcileTo}
              onChange={(e) => setReconcileTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            disabled={reconcile.isPending || !reconcileFrom || !reconcileTo}
            onClick={async () => {
              const result = await reconcile.mutateAsync({
                from: new Date(`${reconcileFrom}T00:00:00`).toISOString(),
                to: new Date(`${reconcileTo}T23:59:59`).toISOString(),
              });
              toast.success("Reconcile started", {
                description: result.requestId ? `Ref: ${result.requestId}` : undefined,
              });
            }}
          >
            <RotateCcw className="size-4" /> Run reconcile
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Data retention" description="Run retention policies for this business">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={runRetention.isPending}
            onClick={async () => {
              const result = await runRetention.mutateAsync();
              toast.success("Retention run started", {
                description: result.requestId ? `Ref: ${result.requestId}` : undefined,
              });
            }}
          >
            Run retention
          </Button>
          <Can permission={PERMISSIONS.CUSTOMER_EXPORT}>
            <Button
              variant="outline"
              disabled={runFilesRetention.isPending}
              onClick={async () => {
                const result = await runFilesRetention.mutateAsync();
                toast.success("Files retention completed", {
                  description: [
                    result.data
                      ? `${result.data.softDeleted} soft-deleted of ${result.data.requested} requested`
                      : null,
                    result.requestId ? `Ref: ${result.requestId}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                });
              }}
            >
              Run files retention
            </Button>
          </Can>
        </div>
      </SectionCard>

      <AlertDialog open={Boolean(resetJobId)} onOpenChange={(o) => !o && setResetJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset failed job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will re-queue the job for another attempt. Use only when the underlying issue
              has been resolved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!resetJobId) return;
                const result = await resetJob.mutateAsync(resetJobId);
                toast.success("Job reset", {
                  description: result.requestId ? `Ref: ${result.requestId}` : undefined,
                });
                setResetJobId(null);
              }}
            >
              Reset job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(republishEvent)}
        onOpenChange={(o) => !o && setRepublishEvent(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Republish outbox event?</AlertDialogTitle>
            <AlertDialogDescription>
              {republishEvent ? (
                <>
                  Republish <strong>{republishEvent.eventType}</strong> for{" "}
                  {republishEvent.aggregateType} {republishEvent.aggregateId.slice(0, 8)}…
                  (attempts: {republishEvent.attempts})
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!republishEvent) return;
                const result = await republish.mutateAsync(republishEvent.id);
                toast.success("Event republished", {
                  description: result.requestId ? `Ref: ${result.requestId}` : undefined,
                });
                setRepublishEvent(null);
              }}
            >
              Republish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OutboxTable({
  events,
  onRepublish,
}: {
  events: OutboxEvent[];
  onRepublish: (event: OutboxEvent) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs text-muted-foreground">
          <tr>
            {["Event", "Aggregate", "Attempts", "Occurred", ""].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {events.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-3.5 text-amber-600" />
                  {e.eventType}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {e.aggregateType} · {e.aggregateId.slice(0, 8)}…
              </td>
              <td className="px-4 py-3 tabular-nums">{e.attempts}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(e.occurredAt).toLocaleString("en-GB")}
              </td>
              <td className="px-4 py-3">
                <Button variant="ghost" size="sm" onClick={() => onRepublish(e)}>
                  Republish
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
