import { Link } from "@tanstack/react-router";
import { CalendarDays, CalendarPlus, Navigation } from "lucide-react";
import { toast } from "sonner";
import { ClientBookingActions } from "@/components/ClientBookingActions";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import {
  useLeavePortalWaitlist,
  usePortalWaitlist,
  usePublicBusiness,
  usePublicLocations,
  usePublicStaff,
  type FromStudio,
  type PortalBusinessSummary,
  type PortalCredit,
  type PortalWaitlistEntry,
} from "@/lib/api/hooks";
import type { Booking, Payment } from "@/lib/api/types";
import { bookingNeedsPayment, bookingSettlement } from "@/lib/booking-payment";
import { downloadIcs, directionsUrl, googleCalendarUrl } from "@/lib/calendar-links";
import { paymentChip, relativeWhen, type ChipTone } from "@/lib/client-account";
import { formatInTz, formatMoney } from "@/lib/format";
import { initials } from "@/lib/client-theme";
import { cn } from "@/lib/utils";

function Chip({
  label,
  tone,
  dark = false,
}: {
  label: string;
  tone: "ok" | "warn" | "neutral";
  dark?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap",
        dark
          ? tone === "warn"
            ? "bg-amber-400/20 text-amber-200"
            : "bg-emerald-400/20 text-emerald-200"
          : tone === "ok"
            ? "bg-success-soft text-success-foreground"
            : tone === "warn"
              ? "bg-warning-soft text-warning-foreground"
              : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export function AccountOverview({
  solo,
  studios,
  upcoming,
  usable,
  history,
  loading,
  payingId,
  onPay,
  onBook,
  pendingBanner,
}: {
  solo: boolean;
  studios: PortalBusinessSummary[];
  upcoming: FromStudio<Booking>[];
  usable: FromStudio<PortalCredit>[];
  history: FromStudio<Payment>[];
  loading: boolean;
  payingId: string | null;
  onPay: (booking: FromStudio<Booking>) => void;
  onBook: (studio: PortalBusinessSummary) => void;
  pendingBanner?: React.ReactNode;
}) {
  const next = upcoming[0];
  const rest = upcoming.slice(1);

  // One credits card per business that has any; the first is the headline card.
  const creditsByStudio = new Map<
    string,
    { studio: PortalBusinessSummary; total: number; useBy: string }
  >();
  for (const c of usable) {
    const cur = creditsByStudio.get(c.studio.id);
    if (cur) {
      cur.total += c.available;
      if (c.expiresAt < cur.useBy) cur.useBy = c.expiresAt;
    } else {
      creditsByStudio.set(c.studio.id, {
        studio: c.studio,
        total: c.available,
        useBy: c.expiresAt,
      });
    }
  }
  const creditCards = [...creditsByStudio.values()];

  return (
    <>
      {pendingBanner}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {loading && !next ? (
          <div className="h-[200px] animate-pulse rounded-3xl bg-foreground/90" />
        ) : next ? (
          <NextUpCard booking={next} payments={history} payingId={payingId} onPay={onPay} />
        ) : (
          <div className="surface-card p-5">
            <EmptyState
              icon={<CalendarDays className="size-5" />}
              title="Nothing booked yet"
              description="Book your next session and it'll show up here."
              action={
                solo ? (
                  <Button size="sm" onClick={() => onBook(studios[0]!)}>
                    Book now
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}

        <div className="space-y-4">
          {creditCards.length > 0 ? (
            creditCards.map((card) => (
              <div key={card.studio.id} className="surface-card flex items-center gap-4 p-4 sm:p-5">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-[26px] font-bold text-primary tabular-nums">
                  {card.total}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold">Session credits</p>
                  <p className="truncate text-[14px] text-muted-foreground">
                    {card.studio.tradingName} · Use by{" "}
                    {formatInTz(card.useBy, "Europe/London", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <Button className="shrink-0 rounded-full" onClick={() => onBook(card.studio)}>
                  Book
                </Button>
              </div>
            ))
          ) : solo ? (
            <div className="surface-card flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-[17px] font-semibold">{studios[0]!.tradingName}</p>
                <p className="text-[14px] text-muted-foreground">Book your next session</p>
              </div>
              <Button className="shrink-0 rounded-full" onClick={() => onBook(studios[0]!)}>
                Book
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-muted-foreground">Coming up</h2>
        <SectionCard bodyClassName="p-0 sm:p-0">
          {loading && upcoming.length === 0 ? (
            <TableGhost rows={3} />
          ) : rest.length === 0 ? (
            <p className="px-4 py-5 text-[15px] text-muted-foreground sm:px-5">
              {next ? "Nothing else booked yet." : "Nothing booked yet."}
              {solo ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => onBook(studios[0]!)}
                    className="font-semibold text-foreground underline underline-offset-4"
                  >
                    Book a session
                  </button>
                </>
              ) : null}
            </p>
          ) : (
            <ul className="divide-y">
              {rest.slice(0, 8).map((b) => {
                const chip = paymentChip(b, history);
                const needsPay = bookingNeedsPayment(b, history);
                const s = bookingSettlement(b);
                const payLabel =
                  s.depositMinor != null && s.paidMinor < s.depositMinor
                    ? `Pay ${formatMoney(s.dueNowMinor, b.currency)} deposit`
                    : `Pay ${formatMoney(s.dueNowMinor, b.currency)}`;
                return (
                  <li key={b.id} className="px-4 py-4 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[17px] font-semibold">
                          {relativeWhen(b.start, b.timezone)}
                        </p>
                        <p className="mt-0.5 text-[14px] text-muted-foreground">
                          {b.serviceSnapshot.name}
                          {solo ? "" : ` · ${b.studio.tradingName}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Chip label={chip.label} tone={chip.tone} />
                        <ClientBookingActions
                          booking={b}
                          businessId={b.studio.id}
                          businessName={b.studio.tradingName}
                          className="hidden sm:flex"
                        />
                      </div>
                    </div>
                    {needsPay ? (
                      <Button
                        variant="outline"
                        className="mt-3 h-11 w-full rounded-xl text-[15px] font-semibold"
                        disabled={payingId === b.id}
                        onClick={() => onPay(b)}
                      >
                        {payingId === b.id ? "Starting…" : payLabel}
                      </Button>
                    ) : null}
                    <ClientBookingActions
                      booking={b}
                      businessId={b.studio.id}
                      businessName={b.studio.tradingName}
                      className="mt-3 sm:hidden"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        {upcoming.length > 9 ? (
          <p className="mt-2 text-right text-[14px]">
            <Link
              to="/account"
              search={{ view: "calendar" }}
              className="font-semibold underline underline-offset-4"
            >
              See all in the calendar
            </Link>
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {studios.map((studio) => (
            <WaitlistCard key={studio.id} studio={studio} solo={solo} />
          ))}
        </div>
        {!solo ? (
          <SectionCard title="Businesses you book with" bodyClassName="p-0 sm:p-0">
            <ul className="divide-y">
              {studios.map((studio) => (
                <li
                  key={studio.id}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                      {initials(studio.tradingName)}
                    </span>
                    <p className="truncate text-[15px] font-medium">{studio.tradingName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBook(studio)}
                    className="text-[14px] font-semibold underline underline-offset-4"
                  >
                    Book
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}

function NextUpCard({
  booking,
  payments,
  payingId,
  onPay,
}: {
  booking: FromStudio<Booking>;
  payments: readonly Payment[];
  payingId: string | null;
  onPay: (booking: FromStudio<Booking>) => void;
}) {
  const studioId = booking.studio.id;
  const staff = usePublicStaff(studioId);
  const locations = usePublicLocations(studioId);
  const profile = usePublicBusiness(studioId, "id");
  const chip = paymentChip(booking, payments);
  const needsPay = bookingNeedsPayment(booking, payments);
  const s = bookingSettlement(booking);

  const staffName = staff.data?.find((p) => p.id === booking.staffId)?.displayName ?? null;
  const location = locations.data?.find((l) => l.id === booking.locationId) ?? null;
  const address = profile.data?.page?.venue?.address ?? profile.data?.address ?? null;

  const event = {
    title: `${booking.serviceSnapshot.name} at ${booking.studio.tradingName}`,
    start: booking.start,
    end: booking.end,
    location: [location?.name, address].filter(Boolean).join(", ") || null,
    details: `Booking reference ${booking.reference}`,
  };
  const addToCalendar = () => {
    if (!downloadIcs(event, `${booking.reference}.ics`)) {
      window.open(googleCalendarUrl(event), "_blank", "noopener");
      return;
    }
    toast.success("Calendar file saved");
  };

  const inkButton =
    "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/12 px-4 text-[15px] font-semibold text-white transition hover:bg-white/20";

  return (
    <div className="rounded-3xl bg-[#111214] p-5 text-white sm:p-6 dark:bg-[#1c1f25]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[14px] text-white/70">Next up · {booking.studio.tradingName}</p>
        <Chip label={chip.label} tone={chip.tone === "neutral" ? "ok" : chip.tone} dark />
      </div>
      <p className="mt-3 text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
        {relativeWhen(booking.start, booking.timezone)}
      </p>
      <p className="mt-1 truncate text-[15px] text-white/70">
        {booking.serviceSnapshot.name}
        {staffName ? ` with ${staffName}` : ""}
        {location ? ` · ${location.name}` : ""}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {needsPay ? (
          <button
            type="button"
            disabled={payingId === booking.id}
            onClick={() => onPay(booking)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-white px-4 text-[15px] font-semibold text-[#111214] transition hover:bg-white/90 disabled:opacity-60"
          >
            {payingId === booking.id
              ? "Starting…"
              : s.depositMinor != null && s.paidMinor < s.depositMinor
                ? `Pay ${formatMoney(s.dueNowMinor, booking.currency)} deposit`
                : `Pay ${formatMoney(s.dueNowMinor, booking.currency)}`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={addToCalendar}
          className={cn(inkButton, "hidden sm:inline-flex")}
        >
          <CalendarPlus className="size-4" /> Add to calendar
        </button>
        {address ? (
          <a href={directionsUrl(address)} target="_blank" rel="noreferrer" className={inkButton}>
            <Navigation className="size-4" /> Directions
          </a>
        ) : null}
        <ClientBookingActions
          booking={booking}
          businessId={studioId}
          businessName={booking.studio.tradingName}
          variant="ink"
          className="flex-1 flex-nowrap [&>button]:flex-1"
        />
      </div>
    </div>
  );
}

function describeWaitlistWindow(entry: PortalWaitlistEntry): string {
  const p = entry.preferences;
  const tod =
    p.timeOfDay === "any"
      ? "any time"
      : p.timeOfDay === "morning"
        ? "mornings"
        : p.timeOfDay === "afternoon"
          ? "afternoons"
          : "evenings";
  const day = p.from
    ? formatInTz(`${p.from}T12:00:00Z`, "UTC", { weekday: "short", day: "numeric", month: "short" })
    : "As soon as possible";
  const span =
    p.from && p.to && p.to !== p.from
      ? `${day} to ${formatInTz(`${p.to}T12:00:00Z`, "UTC", { weekday: "short", day: "numeric", month: "short" })}`
      : day;
  return `${span}, ${tod}`;
}

function WaitlistCard({ studio, solo }: { studio: PortalBusinessSummary; solo: boolean }) {
  const waitlist = usePortalWaitlist(studio.id);
  const leave = useLeavePortalWaitlist(studio.id);
  const entries = (waitlist.data ?? []).filter((e) => e.status === "waiting");
  if (entries.length === 0) return null;
  return (
    <div className="rounded-3xl border-2 border-dashed border-border bg-card p-4 sm:p-5">
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-semibold">On the waitlist</p>
              <p className="text-[14px] text-muted-foreground">
                {solo ? "" : `${studio.tradingName} · `}
                {entry.service ? `${entry.service.name} · ` : ""}
                {describeWaitlistWindow(entry)} · We'll text you if a space opens
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0 rounded-full"
              disabled={leave.isPending}
              onClick={() =>
                leave.mutate(
                  { entryId: entry.id },
                  { onSuccess: () => toast.success("You've left the waitlist") },
                )
              }
            >
              Leave
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
