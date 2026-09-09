import { useMemo } from "react";
import type { Booking } from "@/lib/api/types";
import { formatHours, summariseBookings } from "@/lib/calendar-stats";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The numbers behind whatever the calendar is showing: how many jobs, what they
 * are worth, what has actually come in, and how much time is booked. Follows the
 * range and filters in play, so narrowing to one staff member or service
 * narrows the figures too.
 */
export function CalendarStats({
  bookings,
  currency,
  bookingLabel,
  loading,
  className,
}: {
  bookings: readonly Booking[];
  currency: string;
  /** Singular noun for a booking in this business's terminology ("Job", "Session"). */
  bookingLabel: string;
  loading?: boolean;
  className?: string;
}) {
  const s = useMemo(() => summariseBookings(bookings), [bookings]);
  const noun = bookingLabel.toLowerCase();
  const plural = `${noun}s`;
  const money = (minor: number) => formatMoney(minor, currency);

  const tiles: { label: string; value: string; sub?: string }[] = [
    {
      label: s.active === 1 ? bookingLabel : `${bookingLabel}s`,
      value: String(s.active),
      sub: s.cancelled > 0 ? `${s.cancelled} cancelled` : undefined,
    },
    {
      label: "Booked",
      value: money(s.bookedMinor),
      sub: s.active > 1 ? `${money(Math.round(s.bookedMinor / s.active))} avg` : undefined,
    },
    {
      label: "Collected",
      value: money(s.collectedMinor),
      sub:
        s.bookedMinor > 0
          ? `${Math.min(100, Math.round((s.collectedMinor / s.bookedMinor) * 100))}% of booked`
          : undefined,
    },
    {
      label: "To collect",
      value: money(s.outstandingMinor),
      sub: s.outstandingMinor > 0 ? "still owed" : undefined,
    },
    {
      label: "Time booked",
      value: s.timedMinutes > 0 ? formatHours(s.timedMinutes) : s.allDay > 0 ? "—" : "0 h",
      sub: s.allDay > 0 ? `+ ${s.allDay} all-day ${s.allDay === 1 ? noun : plural}` : undefined,
    },
    {
      label: s.clients === 1 ? "Client" : "Clients",
      value: String(s.clients),
      sub:
        s.clients > 0 && s.active > s.clients
          ? `${(s.active / s.clients).toFixed(1)} ${plural} each`
          : undefined,
    },
  ];

  return (
    <div
      className={cn(
        "surface-card grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-x",
        className,
      )}
      aria-busy={loading || undefined}
      aria-label="Totals for the dates in view"
    >
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 px-4 py-3">
          <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {t.label}
          </p>
          {loading ? (
            <div className="mt-1.5 h-6 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <p className="truncate text-lg font-semibold tabular-nums">{t.value}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {loading ? "\u00a0" : (t.sub ?? "\u00a0")}
          </p>
        </div>
      ))}
    </div>
  );
}
