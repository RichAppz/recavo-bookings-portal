import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CalendarClock, CalendarDays, Receipt, Store, Ticket, Wallet } from "lucide-react";
import { AccountShell, type AccountView } from "@/components/AccountShell";
import { SessionCalendar, type CalendarSession } from "@/components/SessionCalendar";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useAuth } from "@/lib/auth/auth-store";
import {
  usePortalAcrossStudios,
  usePortalBusinesses,
  usePortalLink,
  type FromStudio,
  type PortalBusinessSummary,
  type PortalCredit,
} from "@/lib/api/hooks";
import type { Booking, Payment } from "@/lib/api/types";
import { formatInTz, formatMoney } from "@/lib/format";

const searchSchema = z.object({
  view: z.enum(["overview", "calendar", "credits", "purchases"]).optional(),
});

export const Route = createFileRoute("/account")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "My account — RECAVO" },
      { name: "description", content: "Your sessions, credits and purchases in one place." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AccountPage />
    </RequireAuth>
  ),
});

const TITLES: Record<AccountView, { title: string; description: string }> = {
  overview: { title: "My account", description: "Everything you've booked and paid for." },
  calendar: { title: "Calendar", description: "Your sessions, month by month." },
  credits: { title: "Credits", description: "Sessions you've already paid for." },
  purchases: { title: "Purchases", description: "Everything you've bought, newest first." },
};

/**
 * One page covering every studio a customer deals with.
 *
 * The per-studio page at `/portal?businessId=` still exists, and still owns the
 * things that are inherently one studio's business — messages, their notes on
 * you, the records they keep. What does not divide that way is the question
 * someone actually opens this app to ask: what have I got booked, and what have
 * I already paid for. That answer should not depend on remembering which link
 * they used.
 */
function AccountPage() {
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const view = Route.useSearch().view ?? "overview";
  // Attach guest purchases first: someone who bought before signing up has
  // sessions under their address and no link to them until this runs.
  const link = usePortalLink(signedIn);
  const studios = usePortalBusinesses(signedIn && link.isFetched);

  const copy = TITLES[view];

  if (studios.isLoading || !studios.data) {
    return (
      <AccountShell view={view} title={copy.title}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="surface-card h-[124px] animate-pulse" />
          ))}
        </div>
      </AccountShell>
    );
  }

  if (studios.data.length === 0) {
    return (
      <AccountShell view={view} title={copy.title}>
        <EmptyState
          icon={<Store className="size-5" />}
          title="Nothing here yet"
          description="Once you book or buy with a studio, everything you've got with them shows up here. Use the link your studio gave you to get started."
        />
      </AccountShell>
    );
  }

  return <AccountContent view={view} copy={copy} studios={studios.data} />;
}

function AccountContent({
  view,
  copy,
  studios,
}: {
  view: AccountView;
  copy: { title: string; description: string };
  studios: PortalBusinessSummary[];
}) {
  const { bookings, credits, payments } = usePortalAcrossStudios(studios);
  const solo = studios.length === 1;

  const now = new Date().toISOString();
  const live = bookings.data.filter(
    (b) => b.status !== "cancelled_by_customer" && b.status !== "cancelled_by_business",
  );
  const upcoming = live
    .filter((b) => b.start >= now)
    .sort((a, b) => a.start.localeCompare(b.start));
  const usable = credits.data
    .filter((c) => c.status === "active" && c.available > 0 && Date.parse(c.expiresAt) > Date.now())
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const history = payments.data.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sessions: CalendarSession[] = live.map((b) => ({
    id: b.id,
    start: b.start,
    timezone: b.timezone,
    title: b.serviceSnapshot.name,
    studio: b.studio.tradingName,
    status: b.status,
  }));

  return (
    <AccountShell
      view={view}
      title={copy.title}
      description={copy.description}
      actions={solo ? <BookButton studio={studios[0]} /> : undefined}
    >
      {bookings.isPartial || credits.isPartial || payments.isPartial ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          One of your studios didn't load, so this may be incomplete. Refresh to try again.
        </p>
      ) : null}

      {view === "overview" ? (
        <Overview
          solo={solo}
          studios={studios}
          upcoming={upcoming}
          usable={usable}
          history={history}
          sessions={sessions}
          loading={bookings.isPending}
        />
      ) : view === "calendar" ? (
        <SessionCalendar
          sessions={sessions}
          emptyHint="Nothing booked on this day. Pick a studio below to book one."
        />
      ) : view === "credits" ? (
        <Credits credits={usable} studios={studios} solo={solo} />
      ) : (
        <Purchases payments={history} solo={solo} />
      )}
    </AccountShell>
  );
}

const SETTLED: ReadonlySet<Payment["state"]> = new Set([
  "succeeded",
  "partially_refunded",
  "refunded",
]);

function Overview({
  solo,
  studios,
  upcoming,
  usable,
  history,
  sessions,
  loading,
}: {
  solo: boolean;
  studios: PortalBusinessSummary[];
  upcoming: FromStudio<Booking>[];
  usable: FromStudio<PortalCredit>[];
  history: FromStudio<Payment>[];
  sessions: CalendarSession[];
  loading: boolean;
}) {
  const next = upcoming[0];
  const creditsLeft = usable.reduce((sum, c) => sum + c.available, 0);
  // What actually left the customer's account: attempts that never settled are
  // not spend, and anything sent back is not either.
  const spent = history.reduce(
    (sum, p) => (SETTLED.has(p.state) ? sum + p.amountMinor - p.amountRefundedMinor : sum),
    0,
  );
  const currency = history[0]?.currency ?? "GBP";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Next session"
          value={
            next
              ? formatInTz(next.start, next.timezone, { day: "numeric", month: "short" })
              : "None booked"
          }
          hint={
            next
              ? `${formatInTz(next.start, next.timezone, { timeStyle: "short" })} · ${next.serviceSnapshot.name}`
              : "Book one below"
          }
          icon={<CalendarClock className="size-4.5" />}
        />
        <StatCard
          label="Upcoming"
          value={String(upcoming.length)}
          hint={upcoming.length === 1 ? "session booked" : "sessions booked"}
          icon={<CalendarDays className="size-4.5" />}
        />
        <StatCard
          label="Credits left"
          value={String(creditsLeft)}
          hint={
            usable[0]
              ? `Next expires ${formatInTz(usable[0].expiresAt, "Europe/London", { day: "numeric", month: "short" })}`
              : "No prepaid sessions"
          }
          icon={<Ticket className="size-4.5" />}
        />
        <StatCard
          label="Total spent"
          value={formatMoney(spent, currency)}
          hint={`${history.length} ${history.length === 1 ? "payment" : "payments"}`}
          icon={<Wallet className="size-4.5" />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SectionCard
          title="Upcoming sessions"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/account" search={{ view: "calendar" }}>
                Calendar
              </Link>
            </Button>
          }
          bodyClassName="p-0 sm:p-0"
        >
          {loading && upcoming.length === 0 ? (
            <TableGhost rows={4} />
          ) : upcoming.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<CalendarDays className="size-5" />}
                title="No upcoming sessions"
                description="Book your next one from the studios listed here."
                action={solo ? <BookButton studio={studios[0]} /> : undefined}
              />
            </div>
          ) : (
            <ul className="divide-y">
              {upcoming.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <Link
                    to="/portal"
                    search={{ businessId: b.studio.id }}
                    className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-secondary/50 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.serviceSnapshot.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatInTz(b.start, b.timezone, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {solo ? "" : ` · ${b.studio.tradingName}`}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            title={solo ? "Book a session" : "Your studios"}
            description={solo ? undefined : `${studios.length} studios`}
            bodyClassName="p-0 sm:p-0"
          >
            <ul className="divide-y">
              {studios.map((studio) => (
                <li
                  key={studio.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xs font-bold text-primary">
                      {studio.tradingName.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{studio.tradingName}</p>
                      <Link
                        to="/portal"
                        search={{ businessId: studio.id }}
                        className="text-xs text-primary hover:underline"
                      >
                        Messages and records
                      </Link>
                    </div>
                  </div>
                  <BookButton studio={studio} />
                </li>
              ))}
            </ul>
          </SectionCard>

          {usable.length > 0 ? (
            <SectionCard
              title="Credits"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/account" search={{ view: "credits" }}>
                    All
                  </Link>
                </Button>
              }
              bodyClassName="p-0 sm:p-0"
            >
              <ul className="divide-y">
                {usable.slice(0, 4).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{sessionCount(c.available)} left</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        Expires {formatInTz(c.expiresAt, "Europe/London", { dateStyle: "medium" })}
                        {solo ? "" : ` · ${c.studio.tradingName}`}
                      </p>
                    </div>
                    <BookWithCredit studio={c.studio} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Credits({
  credits,
  studios,
  solo,
}: {
  credits: FromStudio<PortalCredit>[];
  studios: PortalBusinessSummary[];
  solo: boolean;
}) {
  if (credits.length === 0) {
    return (
      <EmptyState
        icon={<Ticket className="size-5" />}
        title="No prepaid sessions"
        description="Buy a package from your studio and the sessions land here, ready to book."
        action={solo ? <BookButton studio={studios[0]} /> : undefined}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {credits.map((c) => (
        <div key={c.id} className="surface-card flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{c.available}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                of {c.unitsIssued} {c.unitsIssued === 1 ? "session" : "sessions"} left
              </p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Ticket className="size-4.5" />
            </span>
          </div>
          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {solo ? null : <p className="truncate font-medium">{c.studio.tradingName}</p>}
            <p>Expires {formatInTz(c.expiresAt, "Europe/London", { dateStyle: "medium" })}</p>
            {c.reserved > 0 ? <p>{c.reserved} held against a pending booking</p> : null}
          </div>
          <BookWithCredit studio={c.studio} full />
        </div>
      ))}
    </div>
  );
}

function Purchases({ payments, solo }: { payments: FromStudio<Payment>[]; solo: boolean }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="size-5" />}
        title="No payments yet"
        description="Anything you buy will be listed here, with its receipt."
      />
    );
  }

  return (
    <SectionCard bodyClassName="p-0 sm:p-0">
      <ul className="divide-y">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">
                {formatMoney(p.amountMinor, p.currency)}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {formatInTz(p.createdAt, "Europe/London", { dateStyle: "medium" })}
                {solo ? "" : ` · ${p.studio.tradingName}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusBadge status={p.state} />
              {p.receiptUrl ? (
                <a
                  href={p.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Receipt
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function sessionCount(n: number): string {
  return `${n} ${n === 1 ? "session" : "sessions"}`;
}

function BookButton({ studio }: { studio: PortalBusinessSummary }) {
  return (
    <Button asChild size="sm">
      <Link to="/$slug" params={{ slug: studio.slug }}>
        <CalendarClock className="size-4" /> Book a session
      </Link>
    </Button>
  );
}

/**
 * Spending a credit needs the studio's slot picker and the eligibility rules
 * attached to the bucket, both of which live on the per-studio page. Sending
 * them there beats maintaining that machinery in two places.
 */
function BookWithCredit({ studio, full }: { studio: PortalBusinessSummary; full?: boolean }) {
  return (
    <Button asChild size="sm" variant="outline" className={full ? "w-full" : undefined}>
      <Link to="/portal" search={{ businessId: studio.id }}>
        <CalendarClock className="size-4" /> Book with a credit
      </Link>
    </Button>
  );
}
