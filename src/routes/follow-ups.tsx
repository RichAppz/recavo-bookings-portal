import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, Pencil, Plus, Repeat } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
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
import { useFollowUps, useServices } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import type { ServiceFollowUp, ServiceFollowUpStatus } from "@/lib/api/types";
import {
  FOLLOW_UP_BUCKET_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  followUpBucket,
  followUpRuleSummary,
  leadDaysLabel,
  relativeDueLabel,
  reminderRuleRows,
  type FollowUpBucket,
} from "@/lib/follow-ups";
import { formatInTz } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

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
          canEditRules ? (
            <Button onClick={addRule}>
              <Plus className="size-4" />
              Add reminder
            </Button>
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
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Reminders about an upcoming {tenant.terminology.booking.toLowerCase()} (the day before,
          say) are under{" "}
          <Link
            to="/settings"
            search={{ tab: "notifications" }}
            className="font-medium text-primary hover:underline"
          >
            Settings → Notifications
          </Link>
          .
        </p>
      </section>

      <div className="surface-card overflow-hidden **:min-w-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-0.5">
            <h2 className="text-sm font-semibold">Who is due</h2>
            <p className="text-xs text-muted-foreground">
              Scheduled from finished {tenant.terminology.booking.toLowerCase()}s; book them in,
              snooze or dismiss.
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
                view !== "open"
                  ? "Nothing matches this view. Switch to “Open” to see what is due."
                  : rules.length > 0
                    ? EMPTY_WITH_RULES
                    : EMPTY_NO_RULES
              }
              action={
                view === "open" && rules.length === 0 && canEditRules ? (
                  <Button variant="outline" onClick={addRule}>
                    <Plus className="size-4" />
                    Add a reminder
                  </Button>
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
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
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
                            · last done{" "}
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

      <ReminderRuleDialog
        target={ruleTarget}
        onOpenChange={(open) => {
          if (!open) setRuleTarget(null);
        }}
        services={services.data ?? []}
        serviceNoun={serviceNoun}
      />
    </>
  );
}
