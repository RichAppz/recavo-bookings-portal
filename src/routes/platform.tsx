import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Building2,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
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
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useBillingPortal,
  useCancelSubscription,
  useDeadLetterOutbox,
  useFailedJobs,
  useFailedOutbox,
  usePlans,
  useReconcilePayments,
  useRepublishOutboxEvent,
  useReplayOutbox,
  useResetFailedJob,
  useResumeSubscription,
  useRunFilesRetention,
  useRunRetention,
  useStartCheckout,
  useSubscription,
} from "@/lib/api/hooks";
import type { FailedJob, OutboxEvent } from "@/lib/api/types";
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
  const portal = useBillingPortal();
  const cancelSub = useCancelSubscription();
  const resumeSub = useResumeSubscription();

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
          <>
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={portal.isPending}
                onClick={async () => {
                  const result = await portal.mutateAsync();
                  const url = result.url ?? result.portalUrl;
                  if (url) window.location.assign(url);
                }}
              >
                <ExternalLink className="size-4" /> Manage in Stripe
              </Button>
              {currentSub.cancelAtPeriodEnd ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resumeSub.isPending}
                  onClick={async () => {
                    await resumeSub.mutateAsync();
                    toast.success("Subscription resumed");
                  }}
                >
                  Resume subscription
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={cancelSub.isPending}>
                      Cancel subscription
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this subscription?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Access continues until the current period ends
                        {currentSub.currentPeriodEnd
                          ? ` on ${new Date(currentSub.currentPeriodEnd).toLocaleDateString("en-GB")}`
                          : ""}
                        . You can resume any time before then.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          await cancelSub.mutateAsync();
                          toast.success("Cancellation scheduled for period end");
                        }}
                      >
                        Cancel at period end
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
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

      <Can
        permission={PERMISSIONS.AUDIT_READ}
        fallback={
          <SectionCard title="Ops tools" description="Outbox, background jobs and reconciliation">
            <EmptyState
              title="Ops tools are restricted"
              description="Ask a business owner or administrator to grant audit read access."
            />
          </SectionCard>
        }
      >
        <OutboxSection />
        <FailedJobsSection />
        <PaymentsReconcileSection />
      </Can>

      <Can permission={PERMISSIONS.CUSTOMER_EXPORT}>
        <RetentionSection />
      </Can>
    </>
  );
}

function eventRowMeta(e: OutboxEvent) {
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs">{e.eventType}</td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {e.aggregateType} · {e.aggregateId.slice(0, 8)}…
      </td>
      <td className="px-4 py-2.5 tabular-nums">{e.attempts}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
        {formatInTz(e.occurredAt, "Europe/London", { dateStyle: "medium", timeStyle: "short" })}
      </td>
    </>
  );
}

function OutboxSection() {
  const failed = useFailedOutbox({ limit: 50 });
  const deadLetter = useDeadLetterOutbox({ limit: 50 });
  const replay = useReplayOutbox();
  const republish = useRepublishOutboxEvent();

  const failedIds = (failed.data ?? []).map((e) => e.id);

  return (
    <SectionCard
      title="Outbox events"
      description="Event delivery health for this business"
      action={
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={replay.isPending || failedIds.length === 0}
            >
              <RefreshCw className="size-4" /> Replay all failed
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replay {failedIds.length} failed event(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                Each event will be requeued for delivery. This is safe to repeat for events whose
                handlers are idempotent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    await replay.mutateAsync(failedIds.slice(0, 100));
                    toast.success("Replay requested");
                  } catch {
                    // Errors surfaced via hook's onError toast.
                  }
                }}
              >
                Replay events
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="size-3.5" /> Failed ({failed.data?.length ?? 0})
          </p>
          <OutboxTable
            events={failed.data ?? []}
            isLoading={failed.isLoading}
            isError={failed.isError}
            onRepublish={(id) => republish.mutate(id)}
            republishPending={republish.isPending}
          />
        </div>
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="size-3.5" /> Dead-letter ({deadLetter.data?.length ?? 0})
          </p>
          <OutboxTable
            events={deadLetter.data ?? []}
            isLoading={deadLetter.isLoading}
            isError={deadLetter.isError}
            onRepublish={(id) => republish.mutate(id)}
            republishPending={republish.isPending}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function OutboxTable({
  events,
  isLoading,
  isError,
  onRepublish,
  republishPending,
}: {
  events: OutboxEvent[];
  isLoading: boolean;
  isError: boolean;
  onRepublish: (eventId: string) => void;
  republishPending: boolean;
}) {
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (isError) return <p className="text-xs text-destructive">Couldn't load events.</p>;
  if (events.length === 0) return <p className="text-xs text-muted-foreground">None right now.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs text-muted-foreground">
          <tr>
            {["Event", "Aggregate", "Attempts", "Occurred", ""].map((h) => (
              <th key={h} className="px-4 py-2 text-left font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {events.map((e) => (
            <tr key={e.id}>
              {eventRowMeta(e)}
              <td className="px-4 py-2.5 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={republishPending}
                  onClick={() => onRepublish(e.id)}
                >
                  <RotateCcw className="size-3.5" /> Republish
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FailedJobsSection() {
  const jobs = useFailedJobs({ limit: 50 });
  const reset = useResetFailedJob();

  return (
    <SectionCard title="Failed background jobs" bodyClassName="p-0">
      {jobs.isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading jobs…</p>
      ) : jobs.isError ? (
        <div className="p-6">
          <EmptyState title="Couldn't load failed jobs" />
        </div>
      ) : (jobs.data ?? []).length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No failed jobs"
            description="Every job ran (or is retrying) normally."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                {["Job", "Attempts", "Next run", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(jobs.data ?? []).map((job: FailedJob) => (
                <tr key={job.id}>
                  <td className="px-4 py-3 font-mono text-xs">{job.name}</td>
                  <td className="px-4 py-3 tabular-nums">{job.attempts}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {formatInTz(job.runAt, "Europe/London", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" disabled={reset.isPending}>
                          <RotateCcw className="size-3.5" /> Retry
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Retry "{job.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This resets the job's attempt count so the scheduler picks it up again
                            shortly.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await reset.mutateAsync(job.id);
                              toast.success("Job reset for retry");
                            }}
                          >
                            Reset job
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function PaymentsReconcileSection() {
  const reconcile = useReconcilePayments();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  return (
    <SectionCard
      title="Payments reconciliation"
      description="Re-checks Stripe payment state against RECAVO records over a date window"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="reconcile-from">From</Label>
          <Input
            id="reconcile-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="reconcile-to">To</Label>
          <Input id="reconcile-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={reconcile.isPending || !from || !to}>
              <Banknote className="size-4" /> Run reconciliation
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Reconcile payments from {from} to {to}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This re-checks each payment in the window against Stripe and corrects any drift.
                Only this business's payments are scanned.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    await reconcile.mutateAsync({
                      from: new Date(`${from}T00:00:00.000Z`).toISOString(),
                      to: new Date(`${to}T23:59:59.999Z`).toISOString(),
                    });
                    toast.success("Reconciliation complete");
                  } catch {
                    // Errors surfaced via hook's onError toast.
                  }
                }}
              >
                Run reconciliation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SectionCard>
  );
}

function RetentionSection() {
  const runRetention = useRunRetention();
  const runFilesRetention = useRunFilesRetention();

  return (
    <SectionCard
      title="Data retention"
      description="Runs GDPR retention/anonymisation sweeps ahead of their schedule"
    >
      <div className="flex flex-wrap gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={runRetention.isPending}>
              <ShieldAlert className="size-4" /> Run retention now
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Run retention/anonymisation now?</AlertDialogTitle>
              <AlertDialogDescription>
                Records past this business's retention window will be anonymised immediately. This
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  try {
                    await runRetention.mutateAsync();
                    toast.success("Retention run started");
                  } catch {
                    // Errors surfaced via hook's onError toast.
                  }
                }}
              >
                Run retention
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={runFilesRetention.isPending}>
              <Trash2 className="size-4" /> Run file retention now
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Soft-delete expired files now?</AlertDialogTitle>
              <AlertDialogDescription>
                Files older than this business's file retention window will be soft-deleted and
                purged from storage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    const result = await runFilesRetention.mutateAsync();
                    toast.success(
                      `File retention complete: ${result.softDeleted} of ${result.requested} soft-deleted`,
                    );
                  } catch {
                    // Errors surfaced via hook's onError toast.
                  }
                }}
              >
                Run file retention
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SectionCard>
  );
}
