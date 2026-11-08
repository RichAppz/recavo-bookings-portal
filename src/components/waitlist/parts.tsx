import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Hourglass, X } from "lucide-react";
import { AVATAR_TINTS, TONE_PILL } from "@/components/client-profile/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WaitlistEntry, WaitlistSlotEvent, WaitlistTimeOfDay } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  TIME_OF_DAY_OPTIONS,
  WEEKDAYS,
  dayChips,
  dayDate,
  fitsLabel,
  parseFits,
  formatFitsParam,
  slotFreedCopy,
  slotLocal,
  slotWhen,
  type FitsValue,
} from "@/lib/waitlist";

export const MINT_TINT =
  "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.14)] dark:text-[#9fe3bf]";
export const MINT_TEXT = "text-[#1f6b41] dark:text-[#9fe3bf]";
export const AMBER_TEXT = "text-[#8a5300] dark:text-[#f3b878]";

function tintFor(id: string | null | undefined): string {
  if (!id) return AVATAR_TINTS[0]!;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length]!;
}

export function WaitlistAvatar({
  entry,
  size = 28,
}: {
  entry: Pick<WaitlistEntry, "customer" | "customerId">;
  size?: number;
}) {
  const initials = [entry.customer?.firstName, entry.customer?.lastName]
    .filter(Boolean)
    .map((s) => s!.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size >= 36 ? 13 : 11 }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-extrabold",
        tintFor(entry.customerId),
      )}
    >
      {initials || "?"}
    </span>
  );
}

/** 20px grey chip: "Sat", "Mornings", "Any day". */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-secondary px-1.5 text-[11.5px] font-bold text-muted-foreground">
      {children}
    </span>
  );
}

export function PreferenceChips({ entry }: { entry: Pick<WaitlistEntry, "preferences"> }) {
  const p = entry.preferences;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {dayChips(p).map((d) => (
        <Chip key={d}>{d}</Chip>
      ))}
      <Chip>
        {p.timeOfDay === "any"
          ? "Any time"
          : TIME_OF_DAY_OPTIONS.find((o) => o.value === p.timeOfDay)?.label}
      </Chip>
    </span>
  );
}

export function FitsPill({ value }: { value: FitsValue }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-extrabold whitespace-nowrap",
        TONE_PILL.green,
      )}
    >
      Fits {dayDate(value.date)}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  valueClass,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-extrabold tabular-nums", valueClass)}>{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="surface-card grid cursor-pointer gap-1 rounded-[14px] px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
    >
      {body}
    </button>
  ) : (
    <div className="surface-card grid gap-1 rounded-[14px] px-4 py-3.5">{body}</div>
  );
}

/** Seven toggle buttons, Mon to Sun. None pressed means any day. */
export function DayToggles({
  value,
  onChange,
  short = false,
  label = "Days they can do",
  accent,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  /** Two-letter labels for narrow screens. */
  short?: boolean;
  label?: string;
  /** Pressed colour override (the public sheet uses the business's brand). */
  accent?: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={label}>
      {WEEKDAYS.map((d) => {
        const on = value.includes(d.value);
        return (
          <button
            key={d.value}
            type="button"
            aria-pressed={on}
            aria-label={d.long}
            onClick={() =>
              onChange(
                on ? value.filter((x) => x !== d.value) : [...value, d.value].sort((a, b) => a - b),
              )
            }
            style={
              on && accent ? { background: accent, borderColor: accent, color: "#fff" } : undefined
            }
            className={cn(
              "h-10 cursor-pointer rounded-lg border text-[13px] font-bold transition-colors",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            {short ? d.two : d.short}
          </button>
        );
      })}
    </div>
  );
}

/** Any time / Mornings / Afternoons / Evenings, one choice. */
export function TimeOfDayButtons({
  value,
  onChange,
  accent,
  name = "time-of-day",
}: {
  value: WaitlistTimeOfDay;
  onChange: (v: WaitlistTimeOfDay) => void;
  accent?: string;
  name?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Time of day"
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
    >
      {TIME_OF_DAY_OPTIONS.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            name={name}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = TIME_OF_DAY_OPTIONS.findIndex((x) => x.value === value);
              const step =
                e.key === "ArrowRight" || e.key === "ArrowDown"
                  ? 1
                  : e.key === "ArrowLeft" || e.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!step) return;
              e.preventDefault();
              const next =
                TIME_OF_DAY_OPTIONS[
                  (i + step + TIME_OF_DAY_OPTIONS.length) % TIME_OF_DAY_OPTIONS.length
                ]!;
              onChange(next.value);
              const group = e.currentTarget.parentElement;
              requestAnimationFrame(() =>
                (group?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus(),
              );
            }}
            style={
              on && accent ? { background: accent, borderColor: accent, color: "#fff" } : undefined
            }
            className={cn(
              "h-10 cursor-pointer rounded-lg border px-2 text-[13px] font-bold transition-colors",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Fits a day ▾": a date with an optional time. On, it reads "Fits Sat 25 Oct ✕". */
export function FitsPicker({
  value,
  onChange,
  defaultDate,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  defaultDate: string;
}) {
  const current = parseFits(value);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current?.date ?? defaultDate);
  const [time, setTime] = useState(current?.time ?? "");

  if (current) {
    return (
      <span
        className={cn(
          "inline-flex h-[34px] items-center gap-1 rounded-full pr-1 pl-3 text-[13px] font-bold",
          MINT_TINT,
        )}
      >
        Fits {fitsLabel(current)}
        <button
          type="button"
          className="flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          aria-label={`Stop filtering to ${fitsLabel(current)}`}
          onClick={() => onChange(undefined)}
        >
          <X className="size-3.5" />
        </button>
      </span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDate(defaultDate);
          setTime("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-[34px] gap-1.5 font-semibold">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          Fits a day
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 gap-3">
        <p className="text-[13px] text-muted-foreground">
          Show only who could take a time on this day.
        </p>
        <label className="grid gap-1 text-[13px] font-bold">
          Day
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="grid gap-1 text-[13px] font-bold">
          <span>
            Time <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <Button
          disabled={!parseFits(date)}
          onClick={() => {
            const v = parseFits(time ? `${date}T${time.slice(0, 5)}` : date);
            if (!v) return;
            onChange(formatFitsParam(v));
            setOpen(false);
          }}
        >
          Show who fits
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/* ---------------- Slot freed ---------------- */

/**
 * Mint strip shown when a cancellation freed time someone waiting could take.
 * `compact` is the calendar version; `onShow` gets the event chosen.
 */
export function SlotFreedBanner({
  events,
  onShow,
  onDismiss,
  compact = false,
}: {
  events: WaitlistSlotEvent[];
  onShow: (event: WaitlistSlotEvent) => void;
  onDismiss: (event: WaitlistSlotEvent) => void;
  compact?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  if (events.length === 0) return null;
  const copy = slotFreedCopy(events);
  const single = events.length === 1 ? events[0]! : null;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-2 rounded-[14px] border border-ring/30",
        MINT_TINT,
        compact ? "px-3 py-2" : "px-4 py-3",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-ring font-extrabold text-[#10172a]",
            compact ? "size-6 text-xs" : "size-[26px] text-sm",
          )}
        >
          !
        </span>
        <p className={cn("min-w-0 flex-1 text-foreground", compact ? "text-[13px]" : "text-sm")}>
          <span className="font-bold">{copy.lead}</span> {copy.rest}
        </p>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => (single ? onShow(single) : setPicking((p) => !p))}
          aria-expanded={single ? undefined : picking}
        >
          Show them
        </Button>
        {single ? (
          <button
            type="button"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground/60 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            aria-label={`Dismiss: ${copy.lead}`}
            onClick={() => onDismiss(single)}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {!single && picking ? (
        <ul className="grid gap-1 border-t border-ring/20 pt-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-[13px] text-foreground">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold">{slotWhen(e)}</span>
                {e.serviceName ? ` · ${e.serviceName}` : ""} · {e.fitCount} could take it
              </span>
              <Button size="sm" variant="outline" className="h-8" onClick={() => onShow(e)}>
                Show
              </Button>
              <button
                type="button"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-foreground/60 hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={`Dismiss the ${slotWhen(e)} slot`}
                onClick={() => onDismiss(e)}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Phone: "Slot freed: Sat 25 Oct, 09:00" / "3 waiting could take it" / Show. */
export function SlotFreedCard({
  event,
  onShow,
  onDismiss,
}: {
  event: WaitlistSlotEvent;
  onShow: () => void;
  onDismiss: () => void;
}) {
  const l = slotLocal(event);
  return (
    <div
      role="status"
      className={cn("flex items-center gap-3 rounded-[14px] px-4 py-3", MINT_TINT)}
    >
      <Hourglass className="size-5 shrink-0" aria-hidden />
      <span className="grid min-w-0 flex-1 text-foreground">
        <span className="truncate text-sm font-bold">
          Slot freed: {dayDate(l.date)}
          {l.time ? `, ${l.time}` : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {event.fitCount} waiting could take it
        </span>
      </span>
      <Button size="sm" className="h-11 shrink-0" onClick={onShow}>
        Show
      </Button>
      <button
        type="button"
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground/60"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
