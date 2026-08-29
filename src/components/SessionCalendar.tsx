import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-bits";
import { formatInTz, isoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface CalendarSession {
  readonly id: string;
  readonly start: string;
  readonly timezone: string;
  readonly title: string;
  readonly studio: string;
  readonly status: string;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** The Monday on or before the 1st, so every month starts in the left column. */
function gridStart(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - offset);
  return first;
}

/**
 * A month of sessions.
 *
 * Deliberately six fixed rows rather than as many as the month needs: a grid
 * that changes height when you page through it makes everything below jump,
 * and the cost is one mostly-empty row in short months.
 *
 * Days are bucketed by the session's own timezone, not the viewer's. A customer
 * reading this in Spain should see a London session on the day the studio will
 * expect them, not the day it happens to be where they are sitting.
 */
export function SessionCalendar({
  sessions,
  emptyHint,
}: {
  readonly sessions: readonly CalendarSession[];
  readonly emptyHint?: string;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string | null>(isoDate(today));

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();
    for (const session of sessions) {
      // en-CA gives ISO-shaped yyyy-mm-dd, which is what the grid keys on.
      const day = formatInTz(
        session.start,
        session.timezone,
        { year: "numeric", month: "2-digit", day: "2-digit" },
        "en-CA",
      );
      const bucket = map.get(day);
      if (bucket) bucket.push(session);
      else map.set(day, [session]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [sessions]);

  const start = gridStart(cursor.year, cursor.month);
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return date;
  });

  const todayKey = isoDate(today);
  const selectedSessions = selected ? (byDay.get(selected) ?? []) : [];

  function step(by: number) {
    const next = new Date(cursor.year, cursor.month + by, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="surface-card flex min-w-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold">{monthLabel(cursor.year, cursor.month)}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCursor({ year: today.getFullYear(), month: today.getMonth() });
                setSelected(todayKey);
              }}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => step(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => step(1)} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-7">
          {days.map((date) => {
            const key = isoDate(date);
            const dayed = byDay.get(key) ?? [];
            const outside = date.getMonth() !== cursor.month;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cn(
                  // The card draws its own edge, so the grid drops the borders
                  // that would otherwise double up along the right and bottom.
                  "min-h-[84px] border-r border-b p-1.5 text-left transition-colors hover:bg-secondary/60 [&:nth-child(7n)]:border-r-0 [&:nth-child(n+36)]:border-b-0",
                  outside && "bg-muted/30",
                  selected === key && "bg-primary-soft hover:bg-primary-soft",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    outside ? "text-muted-foreground/60" : "text-foreground",
                    key === todayKey && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {date.getDate()}
                </span>
                <span className="mt-1 flex flex-col gap-0.5">
                  {dayed.slice(0, 2).map((s) => (
                    <span
                      key={s.id}
                      className="truncate rounded bg-primary/12 px-1 py-0.5 text-[10px] leading-tight font-medium text-primary"
                    >
                      {formatInTz(s.start, s.timezone, { hour: "2-digit", minute: "2-digit" })}{" "}
                      {s.title}
                    </span>
                  ))}
                  {dayed.length > 2 ? (
                    <span className="px-1 text-[10px] text-muted-foreground">
                      +{dayed.length - 2} more
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface-card flex min-w-0 flex-col">
        <header className="border-b px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold">
            {selected
              ? new Date(`${selected}T00:00:00`).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : "Pick a day"}
          </h2>
        </header>
        <div className="min-w-0 space-y-3 p-4 sm:p-5">
          {selectedSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {emptyHint ?? "Nothing booked on this day."}
            </p>
          ) : (
            selectedSessions.map((s) => (
              <div key={s.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatInTz(s.start, s.timezone, { timeStyle: "short" })} · {s.studio}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
