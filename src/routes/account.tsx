import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CalendarClock, CalendarDays, Gift, Receipt, Store, Ticket, Wallet } from "lucide-react";
import { AccountProfileForm } from "@/components/AccountProfileForm";
import { AccountInvoices } from "@/components/AccountInvoices";
import { AccountShell, type AccountView } from "@/components/AccountShell";
import { BookWithCreditDialog } from "@/components/BookWithCreditDialog";
import { BookSessionDrawer, type BookingSeed } from "@/components/BookSessionDrawer";
import { businessIdPendingCardReturn } from "@/components/BookingFlow";
import { CalendarDayBooker } from "@/components/CalendarDayBooker";
import { OutstandingPaymentDialog } from "@/components/OutstandingPaymentDialog";
import { SessionCalendar, type CalendarSession } from "@/components/SessionCalendar";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useAuth } from "@/lib/auth/auth-store";
import { ApiError, toastApiError } from "@/lib/api";
import {
  usePortalAcrossStudios,
  usePortalBusinesses,
  usePortalLink,
  usePortalPackageLinksAcrossStudios,
  stripeCheckoutFrom,
  stripeCheckoutUnavailableMessage,
  useStartPortalBookingPayment,
  useSyncPortalBookingPayment,
  type FromStudio,
  type PortalBusinessSummary,
  type PortalCredit,
  type PublicBookingPayment,
  type PublicPackageLink,
} from "@/lib/api/hooks";
import type { Booking, Payment } from "@/lib/api/types";
import { userDisplayName } from "@/lib/api/types";
import { bookingNeedsPayment, isSettledPaymentState } from "@/lib/booking-payment";
import { formatDuration, formatInTz, formatMoney, isoDate } from "@/lib/format";
import { toast } from "sonner";

const searchSchema = z.object({
  view: z
    .enum(["overview", "calendar", "offers", "credits", "purchases", "invoices", "profile"])
    .optional(),
  // Stripe 3-D Secure returns here when checkout ran from the account drawer.
  payment_intent: z.string().optional(),
  payment_intent_client_secret: z.string().optional(),
  redirect_status: z.string().optional(),
});

export const Route = createFileRoute("/account")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "My account — RECAVO" },
      { name: "description", content: "Your bookings, credits and purchases in one place." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AccountPage />
    </RequireAuth>
  ),
});

const TITLES: Record<AccountView, { title: string; description: string }> = {
  overview: { title: "My account", description: "Your bookings, credits and payments." },
  calendar: { title: "Calendar", description: "Your bookings, month by month." },
  offers: { title: "Offers", description: "Sessions and packages picked out for you." },
  credits: { title: "Credits", description: "Bookings you've already paid for." },
  purchases: { title: "Purchases", description: "Everything you've bought, newest first." },
  invoices: { title: "Invoices", description: "Invoices businesses have sent you, as PDFs." },
  profile: { title: "Profile", description: "Your name and contact details." },
};

/**
 * One page covering every studio a customer deals with.
 *
 * `/portal` still exists as a redirect so old links do not 404. Bookings,
 * payments and credits all live here.
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

  // Your profile belongs to you, not to a studio's record of you, so it has to
  // be reachable before — and whether or not — any studio is attached.
  if (view === "profile") {
    return (
      <AccountShell view={view} title={copy.title} description={copy.description}>
        <SectionCard title="Your details" className="max-w-xl">
          <AccountProfileForm />
        </SectionCard>
      </AccountShell>
    );
  }

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
          description="Once you book or buy with a business, everything you've got with them shows up here. Use the link the business gave you to get started."
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
  const { user } = useAuth();
  const { bookings, credits, payments } = usePortalAcrossStudios(studios);
  const offers = usePortalPackageLinksAcrossStudios(studios);
  const startPayment = useStartPortalBookingPayment(undefined);
  const syncPayment = useSyncPortalBookingPayment();
  const [bookingStudio, setBookingStudio] = useState<PortalBusinessSummary | null>(null);
  const [bookingSeed, setBookingSeed] = useState<BookingSeed | null>(null);
  const [bookingOffer, setBookingOffer] = useState<{ code: string; name: string } | null>(null);
  const [calDay, setCalDay] = useState(isoDate(new Date()));
  const [checkout, setCheckout] = useState<{
    payment: PublicBookingPayment;
    bookingId: string;
    businessId: string;
  } | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const solo = studios.length === 1;

  useEffect(() => {
    const id = businessIdPendingCardReturn(studios.map((s) => s.id));
    if (!id) return;
    const studio = studios.find((s) => s.id === id);
    if (studio) {
      setBookingSeed(null);
      setBookingOffer(null);
      setBookingStudio(studio);
    }
  }, [studios]);

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

  const payNow = async (booking: FromStudio<Booking>) => {
    setPayingId(booking.id);
    try {
      try {
        const existing = await syncPayment.mutateAsync({
          bookingId: booking.id,
          businessId: booking.studio.id,
        });
        if (isSettledPaymentState(existing.state)) {
          toast.success("Payment received");
          return;
        }
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) {
          toastApiError(err);
          return;
        }
      }
      const result = await startPayment.mutateAsync({
        bookingId: booking.id,
        businessId: booking.studio.id,
      });
      const started = stripeCheckoutFrom(result);
      if (!started) {
        toast.error(stripeCheckoutUnavailableMessage(result));
        return;
      }
      setCheckout({
        payment: started,
        bookingId: booking.id,
        businessId: booking.studio.id,
      });
    } catch {
      // Mutation onError already surfaced the problem.
    } finally {
      setPayingId(null);
    }
  };

  const openBooking = (studio: PortalBusinessSummary, seed?: BookingSeed | null) => {
    setBookingSeed(seed ?? null);
    setBookingOffer(null);
    setBookingStudio(studio);
  };

  const openOffer = (offer: FromStudio<PublicPackageLink>) => {
    setBookingSeed(null);
    setBookingOffer(offer.link);
    setBookingStudio(offer.studio);
  };

  return (
    <>
      <AccountShell
        view={view}
        title={copy.title}
        description={copy.description}
        actions={solo ? <BookButton onClick={() => openBooking(studios[0])} /> : undefined}
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
            payingId={payingId}
            onPay={(booking) => void payNow(booking)}
            onBook={(studio) => openBooking(studio)}
          />
        ) : view === "calendar" ? (
          <SessionCalendar
            sessions={sessions}
            selected={calDay}
            onSelectedChange={setCalDay}
            emptyHint="Nothing booked on this day."
            aside={
              <CalendarDayBooker
                date={calDay}
                studios={studios}
                credits={usable}
                onBookPaid={(paid) =>
                  openBooking(paid.studio, {
                    date: paid.date,
                    serviceId: paid.serviceId,
                    locationId: paid.locationId,
                    slot: paid.slot,
                  })
                }
              />
            }
          />
        ) : view === "offers" ? (
          <Offers offers={offers.data} loading={offers.isPending} solo={solo} onOpen={openOffer} />
        ) : view === "credits" ? (
          <Credits
            credits={usable}
            studios={studios}
            solo={solo}
            onBook={(studio) => openBooking(studio)}
          />
        ) : view === "invoices" ? (
          <AccountInvoices studios={studios} />
        ) : (
          <Purchases payments={history} solo={solo} />
        )}
      </AccountShell>
      <OutstandingPaymentDialog
        title="Pay for this booking"
        payment={checkout?.payment ?? null}
        contact={{
          name: userDisplayName(user),
          email: user?.email ?? null,
          phone: user?.phone ?? null,
        }}
        onPaid={async () => {
          if (!checkout) return;
          const { bookingId, businessId } = checkout;
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const pulled = await syncPayment.mutateAsync({ bookingId, businessId });
            if (isSettledPaymentState(pulled.state)) {
              setCheckout(null);
              toast.success("Payment received");
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 750));
          }
          setCheckout(null);
          toast.error(
            "Your payment went through, but it hasn't shown up yet. Refresh in a moment.",
          );
        }}
        onOpenChange={(open) => {
          if (!open) setCheckout(null);
        }}
      />
      <BookSessionDrawer
        studio={bookingStudio}
        seed={bookingSeed}
        offer={bookingOffer}
        open={bookingStudio !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBookingStudio(null);
            setBookingSeed(null);
            setBookingOffer(null);
          }
        }}
      />
    </>
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
  payingId,
  onPay,
  onBook,
}: {
  solo: boolean;
  studios: PortalBusinessSummary[];
  upcoming: FromStudio<Booking>[];
  usable: FromStudio<PortalCredit>[];
  history: FromStudio<Payment>[];
  sessions: CalendarSession[];
  loading: boolean;
  payingId: string | null;
  onPay: (booking: FromStudio<Booking>) => void;
  onBook: (studio: PortalBusinessSummary) => void;
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
          label="Next booking"
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
          hint={upcoming.length === 1 ? "booking" : "bookings"}
          icon={<CalendarDays className="size-4.5" />}
        />
        <StatCard
          label="Credits left"
          value={String(creditsLeft)}
          hint={
            usable[0]
              ? `Next expires ${formatInTz(usable[0].expiresAt, "Europe/London", { day: "numeric", month: "short" })}`
              : "No prepaid credits"
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
          title="Upcoming bookings"
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
                title="No upcoming bookings"
                description="Book your next one from the businesses listed here."
                action={solo ? <BookButton onClick={() => onBook(studios[0])} /> : undefined}
              />
            </div>
          ) : (
            <ul className="divide-y">
              {upcoming.slice(0, 6).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5"
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
                  <div className="flex shrink-0 items-center gap-2">
                    {bookingNeedsPayment(b, history) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={payingId === b.id}
                        onClick={() => onPay(b)}
                      >
                        {payingId === b.id ? "Starting…" : "Pay now"}
                      </Button>
                    ) : null}
                    <StatusBadge status={b.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            title={solo ? "Book now" : "Your businesses"}
            description={solo ? undefined : `${studios.length} businesses`}
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
                    </div>
                  </div>
                  <BookButton onClick={() => onBook(studio)} />
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

/**
 * Offer links a studio has handed to this customer. Each opens the booking drawer
 * in offer mode, so sessions and packages the studio keeps off its public page are
 * bookable here — that is usually the point of sending one.
 */
function Offers({
  offers,
  loading,
  solo,
  onOpen,
}: {
  offers: FromStudio<PublicPackageLink>[];
  loading: boolean;
  solo: boolean;
  onOpen: (offer: FromStudio<PublicPackageLink>) => void;
}) {
  if (loading && offers.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="surface-card h-[164px] animate-pulse" />
        ))}
      </div>
    );
  }
  if (offers.length === 0) {
    return (
      <EmptyState
        icon={<Gift className="size-5" />}
        title="No offers yet"
        description="When a business picks out sessions or packages for you, they'll appear here ready to book."
      />
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {offers.map((offer) => {
        return (
          <div
            key={`${offer.studio.id}:${offer.link.code}`}
            className="surface-card flex flex-col gap-4 p-5"
          >
            <div>
              <p className="text-lg font-semibold">{offer.link.name}</p>
              {!solo ? (
                <p className="text-sm text-muted-foreground">{offer.studio.tradingName}</p>
              ) : null}
            </div>
            <ul className="space-y-1.5 text-sm">
              {offer.services.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{s.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatDuration(s.durationMinutes)} ·{" "}
                    {formatMoney(s.basePriceMinor, s.currency)}
                  </span>
                </li>
              ))}
              {offer.packages.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {p.creditsIssued} credits · {formatMoney(p.priceMinor, p.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <Button size="sm" className="mt-auto self-start" onClick={() => onOpen(offer)}>
              <Gift className="size-4" /> Book or buy
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function Credits({
  credits,
  studios,
  solo,
  onBook,
}: {
  credits: FromStudio<PortalCredit>[];
  studios: PortalBusinessSummary[];
  solo: boolean;
  onBook: (studio: PortalBusinessSummary) => void;
}) {
  if (credits.length === 0) {
    return (
      <EmptyState
        icon={<Ticket className="size-5" />}
        title="No prepaid credits"
        description="Buy a package and your credits land here, ready to book."
        action={solo ? <BookButton onClick={() => onBook(studios[0])} /> : undefined}
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
                of {c.unitsIssued} {c.unitsIssued === 1 ? "credit" : "credits"} left
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
  return `${n} ${n === 1 ? "credit" : "credits"}`;
}

function BookButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick}>
      <CalendarClock className="size-4" /> Book now
    </Button>
  );
}

function BookWithCredit({ studio, full }: { studio: PortalBusinessSummary; full?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={full ? "w-full" : undefined}
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="size-4" /> Book with a credit
      </Button>
      {open ? <BookWithCreditDialog businessId={studio.id} onOpenChange={setOpen} /> : null}
    </>
  );
}
