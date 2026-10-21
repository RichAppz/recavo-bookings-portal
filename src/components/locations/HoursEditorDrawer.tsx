import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useIsPhone } from "@/hooks/use-media-query";
import type { HoursRange, OpeningHour } from "@/lib/locations";
import { DAY_LONG, hm, rangeError, rangesOn } from "@/lib/locations";
import { parseTimeInput } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "set" | "team";
type Day = { open: boolean; ranges: HoursRange[] };
type Week = Record<number, Day>;

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const DEFAULT_RANGE: HoursRange = { openMinute: 9 * 60, closeMinute: 17 * 60 };

/** New locations start Monday to Friday, 09:00 to 17:00. */
export const DEFAULT_HOURS: OpeningHour[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  ...DEFAULT_RANGE,
}));

function weekFrom(hours: readonly OpeningHour[]): Week {
  const week: Week = {};
  for (const d of DAYS) {
    const ranges = rangesOn(hours, d);
    week[d] = ranges.length > 0 ? { open: true, ranges } : { open: false, ranges: [DEFAULT_RANGE] };
  }
  return week;
}

function hoursFrom(week: Week): OpeningHour[] {
  return DAYS.flatMap((d) =>
    week[d]!.open ? week[d]!.ranges.map((r) => ({ dayOfWeek: d, ...r })) : [],
  );
}

/** The next range after the last one on a day, an hour later and four hours long. */
function nextRange(ranges: HoursRange[]): HoursRange {
  const last = ranges[ranges.length - 1];
  const start = Math.min((last?.closeMinute ?? 12 * 60) + 60, 23 * 60);
  return { openMinute: start, closeMinute: Math.min(start + 4 * 60, 24 * 60 - 1) };
}

/**
 * Opening hours for one location: set hours (several ranges a day, with copy
 * shortcuts) or "Open when the team works", where staff hours alone decide.
 * Right drawer on desktop, bottom sheet on phone.
 */
export function HoursEditorDrawer({
  open,
  onOpenChange,
  locationName,
  zoneLabel,
  hours,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationName: string;
  zoneLabel: string;
  hours: readonly OpeningHour[];
  /** Resolve to close; throw to keep the drawer open (the error is shown). */
  onSave: (hours: OpeningHour[]) => Promise<void> | void;
}) {
  const phone = useIsPhone();
  const [mode, setMode] = useState<Mode>("set");
  const [week, setWeek] = useState<Week>(() => weekFrom(hours));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(hours.length === 0 ? "team" : "set");
    setWeek(weekFrom(hours));
    setTried(false);
    setFormError(null);
  }, [open, hours]);

  const dayErrors = Object.fromEntries(
    DAYS.map((d) => [d, week[d]!.open ? rangeError(week[d]!.ranges) : null]),
  ) as Record<number, string | null>;
  const noDays = mode === "set" && DAYS.every((d) => !week[d]!.open);
  const invalid = mode === "set" && (noDays || DAYS.some((d) => dayErrors[d]));

  const setDay = (d: number, next: Day) => setWeek((w) => ({ ...w, [d]: next }));

  const copy = (targets: readonly number[]) => {
    const monday = week[1]!;
    setWeek((w) => {
      const next = { ...w };
      for (const d of targets)
        next[d] = { open: monday.open, ranges: monday.ranges.map((r) => ({ ...r })) };
      return next;
    });
  };

  const save = async () => {
    setTried(true);
    if (invalid) return;
    setSaving(true);
    setFormError(null);
    try {
      await onSave(mode === "team" ? [] : hoursFrom(week));
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error && err.message ? err.message : "Couldn't save the hours.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-[60px] rounded-t-3xl" : "sm:max-w-[480px]",
        )}
      >
        {phone ? (
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        <SheetHeader className="border-b px-6 pt-6 pb-4 text-left">
          <SheetTitle className="text-xl font-extrabold">Opening hours</SheetTitle>
          <SheetDescription>
            {locationName} · {zoneLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 py-5">
          {formError ? (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}

          <div
            role="radiogroup"
            aria-label="How opening hours work"
            className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
          >
            {(
              [
                ["set", "Set opening hours"],
                ["team", "Open when the team works"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "min-h-10 cursor-pointer rounded-lg px-3 py-2 text-[13px] font-bold transition-colors",
                  mode === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "team" ? (
            <p className="rounded-xl bg-secondary/60 px-3.5 py-3 text-sm text-muted-foreground">
              Clients can book whenever someone on the team is working here.
            </p>
          ) : (
            <>
              <ul className="grid gap-2">
                {DAYS.map((d) => {
                  const day = week[d]!;
                  const error = tried || day.ranges.length > 1 ? dayErrors[d] : null;
                  const errorId = error ? `hours-${d}-error` : undefined;
                  return (
                    <li key={d} className="grid gap-2 rounded-xl border px-3 py-2.5">
                      <div className="flex items-start gap-3">
                        <Switch
                          checked={day.open}
                          aria-label={`Open on ${DAY_LONG[d]}`}
                          onCheckedChange={(v) => setDay(d, { ...day, open: v })}
                          className="mt-2.5"
                        />
                        <span className="mt-2.5 w-12 text-[14.5px] font-extrabold">
                          {DAY_LONG[d].slice(0, 3)}
                        </span>
                        {day.open ? (
                          <div className="grid flex-1 gap-2">
                            {day.ranges.map((r, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <Input
                                  type="time"
                                  step={900}
                                  aria-label={`${DAY_LONG[d]} opens`}
                                  aria-invalid={Boolean(error)}
                                  aria-describedby={errorId}
                                  value={hm(r.openMinute)}
                                  onChange={(e) => {
                                    const m = parseTimeInput(e.target.value);
                                    if (m === null) return;
                                    const ranges = day.ranges.map((x, j) =>
                                      j === i ? { ...x, openMinute: m } : x,
                                    );
                                    setDay(d, { ...day, ranges });
                                  }}
                                  className="h-10 w-[104px]"
                                />
                                <span className="text-xs text-muted-foreground">to</span>
                                <Input
                                  type="time"
                                  step={900}
                                  aria-label={`${DAY_LONG[d]} closes`}
                                  aria-invalid={Boolean(error)}
                                  aria-describedby={errorId}
                                  value={hm(r.closeMinute)}
                                  onChange={(e) => {
                                    const m = parseTimeInput(e.target.value);
                                    if (m === null) return;
                                    const ranges = day.ranges.map((x, j) =>
                                      j === i ? { ...x, closeMinute: m } : x,
                                    );
                                    setDay(d, { ...day, ranges });
                                  }}
                                  className="h-10 w-[104px]"
                                />
                                {i === 0 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-9"
                                    aria-label={`Add more hours on ${DAY_LONG[d]}`}
                                    onClick={() =>
                                      setDay(d, {
                                        ...day,
                                        ranges: [...day.ranges, nextRange(day.ranges)],
                                      })
                                    }
                                  >
                                    <Plus className="size-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-9"
                                    aria-label={`Remove these hours on ${DAY_LONG[d]}`}
                                    onClick={() =>
                                      setDay(d, {
                                        ...day,
                                        ranges: day.ranges.filter((_, j) => j !== i),
                                      })
                                    }
                                  >
                                    <X className="size-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="mt-2.5 text-sm text-muted-foreground">Closed</span>
                        )}
                      </div>
                      {error ? (
                        <p id={errorId} className="pl-[100px] text-xs text-destructive max-sm:pl-0">
                          {error}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy([2, 3, 4, 5])}
                >
                  Copy Monday to weekdays
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy([2, 3, 4, 5, 6, 7])}
                >
                  Copy to all days
                </Button>
              </div>
              {tried && noDays ? (
                <p role="alert" className="text-xs text-destructive">
                  Open at least one day, or choose Open when the team works.
                </p>
              ) : null}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {phone ? null : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={cn(phone && "h-12 w-full")}
          >
            {saving ? "Saving…" : "Save hours"}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
