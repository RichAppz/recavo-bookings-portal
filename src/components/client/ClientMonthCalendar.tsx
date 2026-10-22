import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, monthGrid, monthOf } from "@/lib/client-booking";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * The desktop month picker in the booking card. Days before today, past the
 * booking horizon, or with nothing free are greyed and disabled; the chosen day
 * is filled in the accent.
 */
export function ClientMonthCalendar({
  month,
  onMonth,
  date,
  onDate,
  today,
  lastDay,
  dayCounts,
}: {
  month: string;
  onMonth: (month: string) => void;
  date: string;
  onDate: (date: string) => void;
  today: string;
  /** The last bookable day, inclusive. */
  lastDay: string;
  /** Free slots per day; null while loading (every in-range day stays enabled). */
  dayCounts: Map<string, number> | null;
}) {
  const title = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const canPrev = month > monthOf(today);
  const canNext = month < monthOf(lastDay);

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[16px] font-semibold">{title}</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onMonth(addMonths(month, -1))}
            disabled={!canPrev}
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card transition hover:bg-muted disabled:opacity-40 disabled:hover:bg-card"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMonth(addMonths(month, 1))}
            disabled={!canNext}
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card transition hover:bg-muted disabled:opacity-40 disabled:hover:bg-card"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center" role="grid">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="text-[11px] font-semibold text-muted-foreground" aria-hidden>
            {d}
          </span>
        ))}
        {monthGrid(month).map((day, i) => {
          if (!day) return <span key={`blank-${i}`} aria-hidden />;
          const inRange = day >= today && day <= lastDay;
          const none = inRange && dayCounts !== null && !(dayCounts.get(day) ?? 0);
          const enabled = inRange && !none;
          const active = day === date;
          const label = new Intl.DateTimeFormat("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }).format(new Date(`${day}T12:00:00Z`));
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              data-day={day}
              onClick={() => onDate(day)}
              disabled={!enabled}
              aria-pressed={active}
              aria-label={`${label}${none ? ", nothing free" : ""}`}
              className={cn(
                "mx-auto flex h-9 w-9 items-center justify-center rounded-[10px] text-[14px] transition",
                active
                  ? "bg-primary font-semibold text-primary-foreground"
                  : enabled
                    ? "bg-card font-medium ring-1 ring-border hover:bg-muted"
                    : "text-muted-foreground/50",
              )}
            >
              {Number(day.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
