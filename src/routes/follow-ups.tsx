import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { FollowUpActions } from "@/components/FollowUpActions";
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
import { useFollowUps } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import type { ServiceFollowUp, ServiceFollowUpStatus } from "@/lib/api/types";
import {
  FOLLOW_UP_BUCKET_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  followUpBucket,
  relativeDueLabel,
  type FollowUpBucket,
} from "@/lib/follow-ups";
import { formatInTz } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/follow-ups")({
  head: () => ({
    meta: [
      { title: "Follow-ups — RECAVO" },
      {
        name: "description",
        content:
          "Clients due a repeat — ceramic top-ups, re-treatments — with reminders sent for you.",
      },
      { property: "og:title", content: "RECAVO Follow-ups" },
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

const EMPTY_COPY =
  "No follow-ups yet. Turn on a follow-up reminder on a service (e.g. ceramic coating, every 2 years) and they’ll appear here after each job.";

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
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const recordNoun = tenant.terminology.linkedRecord.toLowerCase();
  const [view, setView] = useState<View>("open");
  const followUps = useFollowUps({ status: VIEW_STATUSES[view] });
  const [booking, setBooking] = useState<ServiceFollowUp | null>(null);

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
        title="Follow-ups"
        description={`Clients due a repeat — a ceramic top-up, a re-treatment. Each is scheduled from a finished ${tenant.terminology.booking.toLowerCase()} and the client (and you) are reminded automatically.`}
      />

      <div className="surface-card overflow-hidden **:min-w-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
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
          <p className="text-xs text-muted-foreground">
            Set the interval on each service under{" "}
            <Link to="/services" className="font-medium text-primary hover:underline">
              Services
            </Link>
            .
          </p>
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
              title={view === "open" ? "No follow-ups yet" : "Nothing here"}
              description={
                view === "open"
                  ? EMPTY_COPY
                  : "Nothing matches this view. Switch to “Open” to see what is due."
              }
              action={
                view === "open" ? (
                  <Button asChild variant="outline">
                    <Link to="/services">Go to services</Link>
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
    </>
  );
}
