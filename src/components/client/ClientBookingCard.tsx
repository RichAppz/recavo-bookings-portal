import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { ClientMonthCalendar } from "@/components/client/ClientMonthCalendar";
import { PersonMark } from "@/components/client/ClientLanding";
import { PrimaryButton } from "@/components/client/ClientPage";
import type { PublicPackage, PublicService, PublicStaff } from "@/lib/api/hooks";
import type { AvailabilitySlot, PublicServiceUpsell } from "@/lib/api/types";
import { addCalendarDays, monthOf } from "@/lib/client-booking";
import { dedupeSlotsByStart, hoursLabel, price } from "@/lib/client-journey";
import { formatInTz, formatTimeInTz, isoDateInTz } from "@/lib/format";
import { validityLabel } from "@/lib/packages";
import { cn } from "@/lib/utils";

/**
 * The desktop booking card on the right of the landing page: trainer, month
 * calendar, times for the chosen day, then Continue. The same choices as the
 * phone's date-and-time screen, on one card.
 */
export function ClientBookingCard({
  service,
  pkg,
  timezone,
  staff,
  staffId,
  onStaff,
  extras,
  extraIds,
  onToggleExtra,
  date,
  onDate,
  today,
  horizonDays,
  dayCounts,
  slots,
  allSlots,
  loading,
  selected,
  onSelect,
  onContinue,
  onBuyPackage,
  onWaitlist,
  priceMinor,
  currency,
  cancellationWindowHours,
}: {
  service: PublicService | null;
  /** A package picked instead of a session: the card becomes a buy card. */
  pkg: PublicPackage | null;
  timezone: string;
  staff: PublicStaff[];
  staffId: string | null;
  onStaff: (staffId: string | null) => void;
  extras: PublicServiceUpsell[];
  extraIds: string[];
  onToggleExtra: (serviceId: string) => void;
  date: string;
  onDate: (date: string) => void;
  today: string;
  horizonDays: number;
  dayCounts: Map<string, number> | null;
  /** Free times on the chosen day. */
  slots: AvailabilitySlot[];
  /** Every loaded slot, for the "Next free" chips on an empty day. */
  allSlots: AvailabilitySlot[];
  loading: boolean;
  selected: AvailabilitySlot | null;
  onSelect: (slot: AvailabilitySlot) => void;
  onContinue: () => void;
  onBuyPackage: (packageId: string) => void;
  onWaitlist: () => void;
  priceMinor: number;
  currency: string;
  cancellationWindowHours: number;
}) {
  const [month, setMonth] = useState(() => monthOf(date));
  // A "next free" jump can land in another month; follow it.
  useEffect(() => setMonth(monthOf(date)), [date]);

  const lastDay = addCalendarDays(today, horizonDays - 1);
  const visible = useMemo(() => dedupeSlotsByStart(slots), [slots]);
  const sharedSession = useMemo(() => slots.some((s) => (s.remainingCapacity ?? 0) > 1), [slots]);
  const nextFree = useMemo(
    () =>
      dedupeSlotsByStart(
        allSlots
          .filter((s) => isoDateInTz(s.start, timezone) > date)
          .sort((a, b) => a.start.localeCompare(b.start)),
      ).slice(0, 2),
    [allSlots, date, timezone],
  );
  const dayLabel = formatInTz(`${date}T12:00:00Z`, "UTC", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (pkg) {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <p className="text-[13px] font-semibold text-muted-foreground">Package</p>
        <p className="mt-1 text-[20px] font-semibold leading-tight">{pkg.name}</p>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {pkg.creditsIssued} {pkg.creditsIssued === 1 ? "session" : "sessions"} · Use within{" "}
          {validityLabel(pkg.validity)}
        </p>
        {pkg.description ? (
          <p className="mt-3 text-[14px] leading-relaxed text-foreground/80">{pkg.description}</p>
        ) : null}
        <PrimaryButton full className="mt-5" onClick={() => onBuyPackage(pkg.id)}>
          Continue · {price(pkg.priceMinor, pkg.currency)}
        </PrimaryButton>
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          Book your sessions one at a time once you have the package.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      {staff.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <TrainerChip
            label="Any trainer"
            active={staffId === null}
            onClick={() => onStaff(null)}
          />
          {staff.map((person) => (
            <TrainerChip
              key={person.id}
              label={person.displayName.split(/\s+/)[0] ?? person.displayName}
              fullName={person.displayName}
              active={staffId === person.id}
              onClick={() => onStaff(person.id)}
            />
          ))}
        </div>
      ) : null}

      <ClientMonthCalendar
        month={month}
        onMonth={setMonth}
        date={date}
        onDate={onDate}
        today={today}
        lastDay={lastDay}
        dayCounts={dayCounts}
      />

      {extras.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
            Add to your session
          </p>
          <div className="flex flex-wrap gap-2">
            {extras.map((u) => {
              const on = extraIds.includes(u.serviceId);
              return (
                <button
                  key={u.serviceId}
                  type="button"
                  onClick={() => onToggleExtra(u.serviceId)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition",
                    on
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  {u.name}
                  <span className="text-muted-foreground">+{price(u.priceMinor, currency)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-border pt-4" aria-busy={loading}>
        <p className="text-[14px] font-semibold">{dayLabel}</p>
        {!service ? (
          <p className="mt-2 text-[14px] text-muted-foreground">Pick a session to see times.</p>
        ) : loading && visible.length === 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-[10px] bg-muted" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-3">
            <p className="text-[14px] text-muted-foreground">
              Nothing free on{" "}
              {formatInTz(`${date}T12:00:00Z`, "UTC", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
              .
            </p>
            {nextFree.length > 0 ? (
              <>
                <p className="mt-3 text-[13px] font-semibold text-muted-foreground">Next free</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {nextFree.map((slot) => (
                    <button
                      key={slot.slotToken}
                      type="button"
                      onClick={() => {
                        onDate(isoDateInTz(slot.start, timezone));
                        onSelect(slot);
                      }}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-semibold transition hover:bg-muted"
                    >
                      {formatInTz(slot.start, timezone, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                      , {formatTimeInTz(slot.start, timezone)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <button
              type="button"
              onClick={onWaitlist}
              className="mt-3 text-[14px] font-semibold underline underline-offset-4"
            >
              Join the waitlist
            </button>
          </div>
        ) : (
          <div className={cn("mt-3 grid grid-cols-3 gap-2", loading && "opacity-60")}>
            {visible.map((slot) => {
              const active = selected?.start === slot.start;
              const left = slot.remainingCapacity ?? null;
              return (
                <button
                  key={slot.slotToken}
                  type="button"
                  data-slot-start={slot.start}
                  onClick={() => onSelect(slot)}
                  aria-pressed={active}
                  className={cn(
                    "relative h-11 rounded-[10px] border bg-card text-[14px] font-medium transition",
                    active
                      ? "border-2 border-primary font-semibold"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {formatTimeInTz(slot.start, timezone)}
                  {sharedSession && left === 1 ? (
                    <span className="absolute -top-2 right-1.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                      1 left
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <PrimaryButton full className="mt-4" onClick={onContinue} disabled={!selected || !service}>
        Continue
        {service ? ` · ${priceMinor === 0 ? "Free" : price(priceMinor, currency)}` : ""}
      </PrimaryButton>
      {cancellationWindowHours > 0 ? (
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          Free to cancel up to {hoursLabel(cancellationWindowHours)} before
        </p>
      ) : null}
    </div>
  );
}

function TrainerChip({
  label,
  fullName,
  active,
  onClick,
}: {
  label: string;
  fullName?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={fullName}
      style={
        active
          ? {
              background: "var(--client-dark-button)",
              color: "var(--client-dark-button-foreground)",
            }
          : undefined
      }
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition",
        active ? "border-transparent" : "border-border bg-card hover:bg-muted",
        fullName && "pl-1",
      )}
    >
      {fullName ? <PersonMark name={fullName} className="h-7 w-7 text-[10px]" /> : null}
      {label}
    </button>
  );
}
