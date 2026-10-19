import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BellRing,
  CalendarClock,
  Pencil,
  Plus,
  Repeat,
  TriangleAlert,
  UserRoundPlus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { ClientReminderDialog } from "@/components/ClientReminderDialog";
import { FollowUpActions } from "@/components/FollowUpActions";
import { ReminderRuleDialog, type ReminderRuleTarget } from "@/components/ReminderRuleDialog";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useAllOpenFollowUps,
  useDismissFollowUps,
  useFollowUps,
  useServices,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import type { ServiceFollowUp, ServiceFollowUpStatus } from "@/lib/api/types";
import {
  FOLLOW_UP_BUCKET_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  clientReminderSummary,
  followUpBucket,
  followUpNames,
  followUpRuleSummary,
  leadDaysLabel,
  openClientReminders,
  orphanedFollowUps,
  relativeDueLabel,
  reminderRuleRows,
  type FollowUpBucket,
} from "@/lib/follow-ups";
import { formatInTz } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/follow-ups")({
  head: () => ({
    meta: [
      { title: "Reminders — RECAVO" },
      {
        name: "description",
        content:
          "Remind clients when they are due back — a maintenance wash every 2 months, a ceramic top-up every 2 years — and see who is due.",
      },
      { property: "og:title", content: "RECAVO Reminders" },
      {
        property: "og:description",
        content: "Who is due back, when, and whether they have been reminded.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <FollowUpsPage />
      </AppShell>
    </RequireAuth>
  ),
});

const EMPTY_WITH_RULES =
  "Nobody is due yet. Reminders are scheduled from each finished job, so the first ones appear here once a job with a reminder on it is marked done.";
const EMPTY_NO_RULES =
  "Add a reminder — a maintenance wash every 2 months, a ceramic top-up every 2 years — and after each finished job the client is due back here, reminded for you.";
const CLOSED_HINT =
  "A reminder closes by itself once that client is booked in for it again — those are under Closed (“Booked again”).";

type View = "open" | "sent" | "closed" | "all";

const VIEW_STATUSES: Record<View, ServiceFollowUpStatus[] | undefined> = {
  open: ["scheduled", "sent"],
  sent: ["sent"],
  closed: ["dismissed", "completed", "cancelled"],
  all: undefined,
};

const BUCKET_ORDER: FollowUpBucket[] = ["overdue", "due_soon", "upcoming", "closed"];

const BUCKET_TONE: Record<FollowUpBucket, string> = {
  overdue: "text-destructive",
  due_soon: "text-warning-foreground",
  upcoming: "text-muted-foreground",
  closed: "text-muted-foreground",
};

function customerName(f: ServiceFollowUp): string {
  const c = f.customer;
  if (!c) return "Client";
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Client";
}

function FollowUpsPage() {
  const tenant = useTenant();
  const canBook = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const canEditRules = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const recordNoun = tenant.terminology.linkedRecord.toLowerCase();
  const serviceNoun = (
    tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service"
  ).toLowerCase();
  const [view, setView] = useState<View>("open");
  const followUps = useFollowUps({ status: VIEW_STATUSES[view] });
  const [booking, setBooking] = useState<ServiceFollowUp | null>(null);

  // The rules themselves live on each service; this page is where they are set up
  // and changed without opening the service form (which a phone cannot find easily).
  const services = useServices();
  const rules = useMemo(() => reminderRuleRows(services.data ?? []), [services.data]);
  const [ruleTarget, setRuleTarget] = useState<ReminderRuleTarget | null>(null);
  const addRule = () => setRuleTarget({ mode: "add" });
  // A one-off reminder for one client, with no finished job behind it.
  const [clientReminderOpen, setClientReminderOpen] = useState(false);

  // Every open follow-up, whatever the list below is filtered to: the reminders set for
  // one client are listed in the card above, and anything a removed reminder left
  // behind is flagged (it would otherwise still go out).
  const openAll = useAllOpenFollowUps({ enabled: !tenant.isLoading });
  const clientReminders = useMemo(() => openClientReminders(openAll.data), [openAll.data]);
  const orphans = useMemo(
    () => orphanedFollowUps(openAll.data, services.data),
    [openAll.data, services.data],
  );
  const orphanIds = useMemo(
    () =>
      new Set([...orphans, ...orphanedFollowUps(followUps.items, services.data)].map((f) => f.id)),
    [orphans, followUps.items, services.data],
  );
  const dismiss = useDismissFollowUps();
  const [stopFailed, setStopFailed] = useState<ServiceFollowUp[]>([]);
  const stopOrphans = async () => {
    const targets = orphans;
    if (targets.length === 0) return;
    const { stopped, failed } = await dismiss.mutateAsync(targets);
    setStopFailed(failed.map((f) => f.item));
    if (failed.length > 0) {
      toast.error(
        `Stopped ${stopped.length} of ${targets.length}. ${followUpNames(failed.map((f) => f.item))} couldn't be stopped — try again.`,
      );
    } else {
      toast.success(
        `Stopped ${targets.length} ${targets.length === 1 ? "reminder" : "reminders"} from a removed reminder`,
      );
    }
  };

  // Tapping a reminder set for one client finds its row below: switch to a view that
  // holds it, load pages until it is there, then scroll to it and flash it.
  const [highlight, setHighlight] = useState<{ id: string; found: boolean } | null>(null);
  const showRow = (f: ServiceFollowUp) => {
    const statuses = VIEW_STATUSES[view];
    if (statuses && !statuses.includes(f.status)) setView("open");
    setHighlight({ id: f.id, found: false });
  };
  useEffect(() => {
    if (!highlight || highlight.found || followUps.isLoading) return;
    if (followUps.items.some((f) => f.id === highlight.id)) {
      const el = document.getElementById(`follow-up-${highlight.id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlight({ id: highlight.id, found: true });
      return;
    }
    if (followUps.hasNextPage) {
      if (!followUps.isFetchingNextPage) void followUps.fetchNextPage();
    } else if (!followUps.isFetching) {
      setHighlight(null);
    }
  }, [highlight, followUps]);
  useEffect(() => {
    if (!highlight?.found) return;
    const timer = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  // Group by how urgent each one is; the API already orders by due date within.
  const groups = useMemo(() => {
    const now = new Date();
    const map = new Map<FollowUpBucket, ServiceFollowUp[]>();
    for (const f of followUps.items) {
      const bucket = followUpBucket(f, now);
      map.set(bucket, [...(map.get(bucket) ?? []), f]);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
  }, [followUps.items]);

  return (
    <>
      <PageHeader
        title="Reminders"
        description={`Remind clients when they are due back. Each reminder is set on a ${serviceNoun} and scheduled from every finished ${tenant.terminology.booking.toLowerCase()}; the client (and you) are told ahead of the date.`}
        actions={
          canBook || canEditRules ? (
            <div className="flex flex-wrap gap-2">
              {canBook ? (
                <Button variant="outline" onClick={() => setClientReminderOpen(true)}>
                  <UserRoundPlus className="size-4" />
                  Remind a client
                </Button>
              ) : null}
              {canEditRules ? (
                <Button onClick={addRule}>
                  <Plus className="size-4" />
                  Add reminder
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <section className="surface-card overflow-hidden **:min-w-0" aria-labelledby="reminder-rules">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="grid gap-0.5">
            <h2 id="reminder-rules" className="text-sm font-semibold">
              Your reminders
            </h2>
            <p className="text-xs text-muted-foreground">
              {rules.length === 0
                ? `Nothing set up yet. A ${serviceNoun} can carry up to five — a wash every 2 months and a top-up every 2 years, say.`
                : `${rules.length} ${rules.length === 1 ? "reminder" : "reminders"} across your ${serviceNoun}s. Tap one to change it.`}
              {clientReminders.length > 0 ? ` ${clientReminders.length} set for one client.` : ""}
            </p>
          </div>
        </div>
        {services.isLoading ? (
          <TableGhost rows={2} />
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Clients who have had a {serviceNoun} with a reminder on it are told when it is due
              again — so they come back to you rather than someone else.
            </p>
            {canEditRules ? (
              <Button variant="outline" size="sm" onClick={addRule} className="shrink-0">
                <Plus className="size-4" />
                Add your first reminder
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y" data-testid="reminder-rules">
            {rules.map((row) => {
              const body = (
                <>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Repeat className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="font-medium">{followUpRuleSummary(row.rule)}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.serviceName} · {leadDaysLabel(row.rule.leadDays).toLowerCase()}
                      {row.serviceActive ? null : ` · ${serviceNoun} archived`}
                    </span>
                  </span>
                  {canEditRules ? (
                    <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : null}
                </>
              );
              return (
                <li key={row.rule.id}>
                  {canEditRules ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40"
                      onClick={() =>
                        setRuleTarget({
                          mode: "edit",
                          serviceId: row.serviceId,
                          rule: row.rule,
                        })
                      }
                      aria-label={`Edit reminder: ${followUpRuleSummary(row.rule)} on ${row.serviceName}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {clientReminders.length > 0 ? (
          <div className="border-t" data-testid="client-reminders">
            <h3 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Set for one client
              <span className="ml-2 font-normal tabular-nums normal-case">
                {clientReminders.length}
              </span>
            </h3>
            <ul className="divide-y">
              {clientReminders.map((f) => (
                <li key={f.id} className="flex items-center gap-2 pr-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40"
                    onClick={() => showRow(f)}
                    aria-label={`Show ${customerName(f)}'s reminder under Who is due`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <CalendarClock className="size-4" />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-medium">{customerName(f)}</span>
                      <span className="text-xs text-muted-foreground">
                        {clientReminderSummary(f)} · due{" "}
                        {formatInTz(f.dueAt, timezone, { dateStyle: "medium" })}
                      </span>
                    </span>
                  </button>
                  {canBook ? <FollowUpActions followUp={f} compact /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Reminders about an upcoming {tenant.terminology.booking.toLowerCase()} (the day before,
          say) are under{" "}
          <Link
            to="/settings/$page"
            params={{ page: "client-messages" }}
            className="font-medium text-primary hover:underline"
          >
            Settings → Client messages
          </Link>
          .
        </p>
      </section>

      <div className="surface-card overflow-hidden **:min-w-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-0.5">
            <h2 className="text-sm font-semibold">Who is due</h2>
            <p className="text-xs text-muted-foreground">
              Scheduled from finished {tenant.terminology.booking.toLowerCase()}s, or set by you for
              one client; book them in, snooze or dismiss.
            </p>
          </div>
          <Select value={view} onValueChange={(v) => setView(v as View)}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Show">
              <SelectValue placeholder="Show" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open (due or upcoming)</SelectItem>
              <SelectItem value="sent">Reminder sent</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">Everything</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canBook && orphans.length > 0 && ruleTarget === null ? (
          <div
            role="status"
            className="flex flex-col gap-2 border-b bg-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid="orphaned-reminders"
          >
            <div className="flex min-w-0 items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
              <div className="grid gap-0.5">
                <p>
                  {orphans.length} {orphans.length === 1 ? "reminder is" : "reminders are"} from a
                  reminder you&rsquo;ve since removed, and will still go out (
                  {followUpNames(orphans)}).
                </p>
                {stopFailed.some((f) => orphanIds.has(f.id)) ? (
                  <p className="text-xs text-destructive">
                    Couldn&rsquo;t stop{" "}
                    {followUpNames(stopFailed.filter((f) => orphanIds.has(f.id)))} — try again.
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 self-start sm:self-auto"
              disabled={dismiss.isPending}
              onClick={() => void stopOrphans()}
            >
              {dismiss.isPending ? "Stopping…" : stopFailed.length > 0 ? "Try again" : "Stop them"}
            </Button>
          </div>
        ) : null}

        {followUps.isLoading || tenant.isLoading ? (
          <TableGhost rows={4} />
        ) : followUps.isError ? (
          <div className="p-6">
            <EmptyState
              title="Couldn't load follow-ups"
              description={
                followUps.error instanceof ApiError
                  ? followUps.error.detail || followUps.error.title
                  : "Please try again shortly."
              }
              action={<Button onClick={() => followUps.refetch()}>Try again</Button>}
            />
          </div>
        ) : followUps.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<BellRing className="size-6" />}
              title={view === "open" ? "Nobody is due yet" : "Nothing here"}
              description={
                view === "closed"
                  ? "Nothing closed yet. Reminders you dismiss, and ones closed by a new booking (“Booked again”), land here."
                  : view !== "open"
                    ? `Nothing matches this view. Switch to “Open” to see what is due. ${CLOSED_HINT}`
                    : `${rules.length > 0 ? EMPTY_WITH_RULES : EMPTY_NO_RULES} ${CLOSED_HINT}`
              }
              action={
                view === "open" && (canBook || (rules.length === 0 && canEditRules)) ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {canBook ? (
                      <Button variant="outline" onClick={() => setClientReminderOpen(true)}>
                        <UserRoundPlus className="size-4" />
                        Remind a client
                      </Button>
                    ) : null}
                    {rules.length === 0 && canEditRules ? (
                      <Button variant="outline" onClick={addRule}>
                        <Plus className="size-4" />
                        Add a reminder
                      </Button>
                    ) : null}
                  </div>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((group) => (
              <section key={group.bucket}>
                <h2
                  className={cn(
                    "bg-secondary/40 px-4 py-2 text-xs font-semibold tracking-wide uppercase",
                    BUCKET_TONE[group.bucket],
                  )}
                >
                  {FOLLOW_UP_BUCKET_LABELS[group.bucket]}
                  <span className="ml-2 font-normal tabular-nums normal-case">
                    {group.items.length}
                  </span>
                </h2>
                <ul className="divide-y">
                  {group.items.map((f) => (
                    <li
                      key={f.id}
                      id={`follow-up-${f.id}`}
                      className={cn(
                        "flex scroll-mt-24 flex-col gap-2 px-4 py-3 transition-colors duration-700 sm:flex-row sm:items-start sm:gap-3",
                        highlight?.id === f.id && highlight.found && "bg-primary-soft",
                      )}
                    >
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to="/clients/$clientId"
                            params={{ clientId: f.customerId }}
                            className="font-medium hover:underline"
                          >
                            {customerName(f)}
                          </Link>
                          {f.linkedRecord ? (
                            <span
                              className="text-sm text-muted-foreground"
                              title={`${tenant.terminology.linkedRecord}`}
                            >
                              · {f.linkedRecord.label}
                            </span>
                          ) : null}
                          <StatusBadge
                            status={f.status}
                            className={cn(
                              f.status === "sent" && "bg-primary-soft text-primary",
                              f.status === "scheduled" && "bg-secondary text-secondary-foreground",
                            )}
                          />
                          {orphanIds.has(f.id) ? (
                            <span
                              className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground"
                              title="The reminder that scheduled this has been removed"
                            >
                              Reminder removed
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm">
                          {f.title}
                          {f.title !== f.serviceName ? (
                            <span className="text-muted-foreground"> · {f.serviceName}</span>
                          ) : null}
                        </p>
                        <p className={cn("text-xs", BUCKET_TONE[followUpBucket(f)])}>
                          Due {formatInTz(f.dueAt, timezone, { dateStyle: "medium" })} (
                          {relativeDueLabel(f.dueAt)})
                          <span className="text-muted-foreground">
                            {" "}
                            · {f.source === "manual" ? "set by you · last done" : "last done"}{" "}
                            {formatInTz(f.lastDoneAt, timezone, { dateStyle: "medium" })}
                            {f.status === "sent" && f.sentAt
                              ? ` · reminded ${formatInTz(f.sentAt, timezone, { dateStyle: "medium" })}`
                              : f.snoozedUntil && new Date(f.snoozedUntil) > new Date()
                                ? ` · snoozed until ${formatInTz(f.snoozedUntil, timezone, { dateStyle: "medium" })}`
                                : f.status === "scheduled"
                                  ? ` · reminder ${formatInTz(f.remindAt, timezone, { dateStyle: "medium" })}`
                                  : ""}
                          </span>
                        </p>
                        <p className="sr-only">
                          {FOLLOW_UP_STATUS_LABELS[f.status]}
                          {f.linkedRecord ? ` on ${recordNoun} ${f.linkedRecord.label}` : ""}
                        </p>
                      </div>
                      {canBook ? (
                        <div className="shrink-0 self-end sm:self-start">
                          <FollowUpActions followUp={f} onBook={setBooking} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {followUps.hasNextPage ? (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => followUps.fetchNextPage()}
                  disabled={followUps.isFetchingNextPage}
                >
                  {followUps.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* "Book": the client, the service and their vehicle are already filled in. */}
      <AddBookingModal
        open={booking !== null}
        onOpenChange={(open) => {
          if (!open) setBooking(null);
        }}
        defaultCustomerId={booking?.customerId}
        defaultServiceId={booking?.serviceId}
        defaultLinkedRecordId={booking?.linkedRecordId ?? undefined}
      />

      <ClientReminderDialog
        open={clientReminderOpen}
        onOpenChange={setClientReminderOpen}
        services={services.data ?? []}
        serviceNoun={serviceNoun}
      />

      <ReminderRuleDialog
        target={ruleTarget}
        onOpenChange={(open) => {
          if (!open) setRuleTarget(null);
        }}
        services={services.data ?? []}
        serviceNoun={serviceNoun}
        canStopScheduled={canBook}
      />
    </>
  );
}
