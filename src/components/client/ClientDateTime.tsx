import { useEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";
import {
  BarSummary,
  BottomBar,
  ClientColumn,
  PageTitle,
  PrimaryButton,
  StepHeader,
} from "@/components/client/ClientPage";
import { PersonMark } from "@/components/client/ClientLanding";
import { LocationLine } from "@/components/client/ClientLocations";
import type { PublicLocation, PublicService, PublicStaff } from "@/lib/api/hooks";
import type { AvailabilitySlot, PublicServiceUpsell } from "@/lib/api/types";
import { addCalendarDays } from "@/lib/client-booking";
import { dedupeSlotsByStart, groupSlotsByDayPart, price } from "@/lib/client-journey";
import { formatDuration, formatInTz, formatTimeInTz, isoDateInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DayAvailability = Map<string, number>;

export function ClientDateTime({
  service,
  timezone,
  staff,
  staffId,
  onStaff,
  locations,
  locationId,
  onChangeLocation,
  extras,
  extraIds,
  onToggleExtra,
  date,
  onDate,
  today,
  horizonDays,
  dayCounts,
  slots,
  loading,
  selected,
  onSelect,
  onBack,
  onContinue,
  onWaitlist,
  nextAvailableDate,
  priceMinor,
  currency,
  offerNote = null,
}: {
  service: PublicService;
  timezone: string;
  staff: PublicStaff[];
  staffId: string | null;
  onStaff: (staffId: string | null) => void;
  locations: PublicLocation[];
  locationId: string | null;
  /** Back to the location step; offered when there is more than one location. */
  onChangeLocation: () => void;
  extras: PublicServiceUpsell[];
  extraIds: string[];
  onToggleExtra: (serviceId: string) => void;
  date: string;
  onDate: (date: string) => void;
  today: string;
  horizonDays: number;
  /** Slots per day across the loaded window; a day missing from the map has none. */
  dayCounts: DayAvailability | null;
  slots: AvailabilitySlot[];
  loading: boolean;
  selected: AvailabilitySlot | null;
  onSelect: (slot: AvailabilitySlot) => void;
  onBack: () => void;
  onContinue: () => void;
  /** Absent when the business has turned the waitlist off. */
  onWaitlist?: () => void;
  nextAvailableDate: string | null;
  priceMinor: number;
  currency: string;
  /** A line above the day strip, e.g. when an offer opens times not normally on sale. */
  offerNote?: string | null;
}) {
  const days = useMemo(
    () =>
      Array.from({ length: Math.min(Math.max(horizonDays, 7), 60) }, (_, i) =>
        addCalendarDays(today, i),
      ),
    [today, horizonDays],
  );
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the chosen day in view when it changes from a "next available" jump.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-day="${date}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [date]);

  const visible = useMemo(() => dedupeSlotsByStart(slots), [slots]);
  // "1 left" only means something for a session several people share; a one-to-one
  // always has exactly one place, so the badge would sit on every time.
  const sharedSession = useMemo(() => slots.some((s) => (s.remainingCapacity ?? 0) > 1), [slots]);
  const grouped = useMemo(
    () =>
      groupSlotsByDayPart(visible, (iso) =>
        Number(
          new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: timezone })
            .format(new Date(iso))
            .replace(/[^\d]/g, ""),
        ),
      ),
    [visible, timezone],
  );

  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
  const location = locations.find((l) => l.id === locationId) ?? null;
  const staffName = staffId ? staff.find((s) => s.id === staffId)?.displayName : null;
  const extrasTotal = extras
    .filter((u) => extraIds.includes(u.serviceId))
    .reduce((sum, u) => sum + u.priceMinor, 0);

  return (
    <div>
      <ClientColumn>
        <StepHeader step={1} total={3} label="Choose" onBack={onBack} />
        <PageTitle>Choose a time</PageTitle>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {service.name} · {formatDuration(service.durationMinutes)} ·{" "}
          {priceMinor === 0 ? "Free" : price(priceMinor, currency)}
        </p>

        {location ? (
          <LocationLine
            location={location}
            onChange={locations.length > 1 ? onChangeLocation : undefined}
          />
        ) : null}

        {/* One trainer means no choice to make; the chips only appear when there are several. */}
        {staff.length > 1 ? (
          <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <PersonChip
              label="Any trainer"
              active={staffId === null}
              onClick={() => onStaff(null)}
            />
            {staff.map((person) => (
              <PersonChip
                key={person.id}
                label={person.displayName}
                avatar
                active={staffId === person.id}
                onClick={() => onStaff(person.id)}
              />
            ))}
          </div>
        ) : null}

        {extras.length > 0 ? (
          <div className="mt-4">
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
                      "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition",
                      on
                        ? "border-primary bg-primary-soft text-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {on ? <Check className="h-4 w-4 text-primary" /> : null}
                    {u.name}
                    <span className="text-muted-foreground">
                      +{price(u.priceMinor, currency)} · {formatDuration(u.durationMinutes)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {offerNote ? (
          <p className="mt-4 rounded-[12px] border border-primary/30 bg-primary-soft px-3 py-2 text-[13px] text-foreground">
            {offerNote}
          </p>
        ) : null}

        <div className="mt-6 flex items-end justify-between">
          <p className="text-[17px] font-semibold">{monthLabel}</p>
          <p className="text-[13px] text-muted-foreground">Swipe for more</p>
        </div>
        <div
          ref={stripRef}
          className="-mx-4 mt-2 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0"
        >
          {days.map((day) => {
            const d = new Date(`${day}T12:00:00Z`);
            const weekday = new Intl.DateTimeFormat("en-GB", {
              weekday: "short",
              timeZone: "UTC",
            }).format(d);
            const dom = d.getUTCDate();
            const known = dayCounts !== null;
            const none = known && !(dayCounts.get(day) ?? 0);
            const active = day === date;
            return (
              <button
                key={day}
                type="button"
                data-day={day}
                onClick={() => onDate(day)}
                aria-pressed={active}
                aria-label={`${weekday} ${dom}${none ? ", nothing free" : ""}`}
                className={cn(
                  "flex h-[76px] w-[64px] shrink-0 snap-start flex-col items-center justify-center rounded-[var(--radius)] border text-center transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : none
                      ? "border-dashed border-border bg-transparent text-muted-foreground/70"
                      : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="text-[12px]">{day === today ? "Today" : weekday}</span>
                <span className="text-[20px] font-semibold leading-tight">{dom}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 min-h-[160px]" aria-busy={loading}>
          {loading && visible.length === 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-[52px] animate-pulse rounded-[var(--radius)] bg-card" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-border px-4 py-6 text-center">
              <p className="text-[16px] font-semibold">Nothing free this day</p>
              <p className="mt-1 text-[14px] text-muted-foreground">
                {nextAvailableDate && nextAvailableDate !== date ? (
                  <>
                    Next free day is{" "}
                    <button
                      type="button"
                      onClick={() => onDate(nextAvailableDate)}
                      className="font-semibold text-foreground underline underline-offset-2"
                    >
                      {formatInTz(`${nextAvailableDate}T12:00:00Z`, "UTC", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </button>
                    .
                  </>
                ) : onWaitlist ? (
                  "Try another day, or join the waitlist and we'll be in touch if a time opens."
                ) : (
                  "Try another day."
                )}
              </p>
            </div>
          ) : (
            <div className={cn("space-y-5", loading && "opacity-60")}>
              {grouped.map((group) => (
                <div key={group.part}>
                  <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
                    {group.part}
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {group.slots.map((slot) => {
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
                            "relative h-[52px] rounded-[var(--radius)] border bg-card text-[16px] font-medium transition",
                            active
                              ? "border-2 border-primary font-semibold"
                              : "border-border hover:bg-muted",
                          )}
                        >
                          {formatTimeInTz(slot.start, timezone)}
                          {sharedSession && left === 1 ? (
                            <span className="absolute -top-2 right-2 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                              1 left
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {onWaitlist && !(loading && visible.length === 0) ? (
            <button
              type="button"
              onClick={onWaitlist}
              className="mt-5 text-[15px] font-semibold underline underline-offset-4"
            >
              {visible.length === 0 ? "Join the waitlist" : "None of these work? Join the waitlist"}
            </button>
          ) : null}
        </div>
      </ClientColumn>

      <BottomBar>
        {selected ? (
          <BarSummary
            caption={`${formatInTz(selected.start, timezone, { weekday: "short", day: "numeric", month: "short" })} · ${staffName ?? "Any trainer"}`}
            value={`${formatTimeInTz(selected.start, timezone)} to ${formatTimeInTz(selected.end, timezone)}`}
          />
        ) : (
          <BarSummary
            caption="Pick a time"
            value={
              extrasTotal > 0
                ? `${price(priceMinor + extrasTotal, currency)} total`
                : isoDateInTz(new Date().toISOString(), timezone) === date
                  ? "Today"
                  : formatInTz(`${date}T12:00:00Z`, "UTC", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })
            }
          />
        )}
        <PrimaryButton onClick={onContinue} disabled={!selected}>
          Continue
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

function PersonChip({
  label,
  avatar = false,
  active,
  onClick,
}: {
  label: string;
  avatar?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={
        active
          ? {
              background: "var(--client-dark-button)",
              color: "var(--client-dark-button-foreground)",
            }
          : undefined
      }
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] font-semibold transition",
        active ? "border-transparent" : "border-border bg-card hover:bg-muted",
        avatar && "pl-1.5",
      )}
    >
      {avatar ? <PersonMark name={label} className="h-8 w-8 text-[11px]" /> : null}
      {label}
    </button>
  );
}
