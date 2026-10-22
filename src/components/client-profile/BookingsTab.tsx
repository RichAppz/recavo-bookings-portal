import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { ProfileCard, TonePill } from "@/components/client-profile/parts";
import type { Booking, BookingSettlementLine } from "@/lib/api/types";
import {
  BOOKING_FILTER_EMPTY,
  BOOKING_FILTER_LABELS,
  BOOKING_FILTERS,
  bookingFilterCounts,
  bookingPaidView,
  bookingStatusView,
  bookingTitle,
  groupByMonth,
  isCancelledBooking,
  matchesBookingFilter,
  sortBookingsFor,
  type BookingFilter,
} from "@/lib/client-profile";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE = 25;

export function BookingsTab({
  bookings,
  filter,
  onFilter,
  record,
  onClearRecord,
  timezone,
  nowMs,
  staffName,
  money,
  settlements,
  serviceNoun,
  staffNoun,
  bookingNoun,
  onOpenBooking,
  isPhone,
}: {
  bookings: readonly Booking[];
  filter: BookingFilter;
  onFilter: (f: BookingFilter) => void;
  /** Only bookings for this {record} (from the Records tab). */
  record: { id: string; label: string } | null;
  onClearRecord: () => void;
  timezone: string;
  nowMs: number;
  staffName: (id: string) => string | null;
  money: (minor: number, currency: string) => string;
  settlements: ReadonlyMap<string, readonly BookingSettlementLine[] | undefined>;
  serviceNoun: string;
  staffNoun: string;
  bookingNoun: string;
  onOpenBooking: (id: string) => void;
  isPhone: boolean;
}) {
  const scoped = useMemo(
    () => (record ? bookings.filter((b) => b.linkedRecordId === record.id) : bookings),
    [bookings, record],
  );
  const counts = useMemo(() => bookingFilterCounts(scoped, nowMs), [scoped, nowMs]);
  const rows = useMemo(
    () =>
      sortBookingsFor(
        scoped.filter((b) => matchesBookingFilter(b, filter, nowMs)),
        filter,
      ),
    [scoped, filter, nowMs],
  );
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [filter, record?.id]);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || visible >= rows.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rows.length]);

  const groups = groupByMonth(rows.slice(0, visible), (b) => b.start, timezone);
  const unit = bookingNoun.toLowerCase();

  const pills = (
    <div
      role="tablist"
      aria-label="Filter bookings"
      className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {BOOKING_FILTERS.map((f) => {
        const selected = f === filter;
        return (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onFilter(f)}
            className={cn(
              "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors",
              selected
                ? "border-foreground bg-foreground text-background"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {BOOKING_FILTER_LABELS[f]}
            <span className={cn("text-xs", selected ? "opacity-80" : "opacity-70")}>
              {counts[f]}
            </span>
          </button>
        );
      })}
    </div>
  );

  const monthTotals = (items: readonly Booking[]) => {
    const live = items.filter((b) => !isCancelledBooking(b));
    const total = live.reduce(
      (sum, b) => sum + (b.paymentMethod === "credit" ? 0 : b.priceMinor),
      0,
    );
    const currency = items[0]?.currency ?? "GBP";
    return `${live.length} ${unit}${live.length === 1 ? "" : "s"}${total > 0 ? ` · ${money(total, currency)}` : ""}`;
  };

  const priceOf = (b: Booking) =>
    b.paymentMethod === "credit"
      ? `${Math.max(1, b.seatCount ?? 1)} credit${(b.seatCount ?? 1) > 1 ? "s" : ""}`
      : money(b.priceMinor, b.currency);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {pills}
        {record ? (
          <span className="inline-flex h-8 items-center gap-1 rounded-full bg-secondary px-3 text-[13px] font-semibold">
            {record.label}
            <button
              type="button"
              onClick={onClearRecord}
              aria-label={`Show bookings for every ${record.label}`}
              className="-mr-1 cursor-pointer rounded-full p-0.5 hover:bg-background"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>

      <ProfileCard bodyClassName="overflow-hidden rounded-2xl">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {BOOKING_FILTER_EMPTY[filter]}
          </p>
        ) : isPhone ? (
          <div>
            {groups.map((g) => (
              <div key={g.key}>
                <MonthBand label={g.label} totals={monthTotals(g.items)} />
                <ul>
                  {g.items.map((b) => {
                    const status = bookingStatusView(b, nowMs);
                    const tz = b.timezone || timezone;
                    return (
                      <li
                        key={b.id}
                        className={cn("border-t first:border-t-0", status.faded && "opacity-60")}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenBooking(b.id)}
                          className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left"
                        >
                          <span className="w-14 shrink-0">
                            <span className="block text-sm font-bold">
                              {formatInTz(b.start, tz, { day: "numeric", month: "short" })}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {b.allDay
                                ? "All day"
                                : formatInTz(b.start, tz, { timeStyle: "short" })}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">
                              {bookingTitle(b)}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[staffName(b.staffId), priceOf(b)].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <TonePill tone={status.tone}>{status.label}</TonePill>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Date</th>
                <th>{serviceNoun}</th>
                <th>{staffNoun}</th>
                <th>Status</th>
                <th>Price</th>
                <th>Paid</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr>
                  <td colSpan={6} className="p-0">
                    <MonthBand label={g.label} totals={monthTotals(g.items)} />
                  </td>
                </tr>
                {g.items.map((b) => {
                  const status = bookingStatusView(b, nowMs);
                  const paid = bookingPaidView(b, settlements.get(b.id), nowMs, (m) =>
                    money(m, b.currency),
                  );
                  const tz = b.timezone || timezone;
                  const multi = (b.lineItems?.length ?? 0) > 1;
                  return (
                    <tr
                      key={b.id}
                      tabIndex={0}
                      onClick={() => onOpenBooking(b.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenBooking(b.id);
                        }
                      }}
                      className={cn(
                        "cursor-pointer border-t outline-none hover:bg-secondary/40 focus-visible:bg-secondary/40",
                        status.faded && "opacity-60",
                      )}
                    >
                      <td className="w-[120px] px-4 py-2.5 align-top">
                        <span className="block text-sm font-bold">
                          {formatInTz(b.start, tz, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {b.allDay ? "All day" : formatInTz(b.start, tz, { timeStyle: "short" })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="block font-semibold">{bookingTitle(b)}</span>
                        {multi ? (
                          <span className="block text-xs text-muted-foreground">
                            {b.lineItems.length} services
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 align-top text-muted-foreground">
                        {staffName(b.staffId) ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <TonePill tone={status.tone}>{status.label}</TonePill>
                      </td>
                      <td className="px-3 py-2.5 text-right align-top tabular-nums">
                        {priceOf(b)}
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <span
                          className={cn(
                            "text-[13px] font-semibold",
                            paid.tone === "red"
                              ? "text-destructive"
                              : paid.tone === "amber"
                                ? "text-warning-foreground"
                                : paid.tone === "green"
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                          )}
                        >
                          {paid.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        )}
        <div ref={sentinel} aria-hidden />
      </ProfileCard>
    </div>
  );
}

function MonthBand({ label, totals }: { label: string; totals: string }) {
  return (
    <div className="flex h-[34px] items-center justify-between bg-secondary/50 px-4 text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">
      <span>{label}</span>
      <span className="normal-case">{totals}</span>
    </div>
  );
}
