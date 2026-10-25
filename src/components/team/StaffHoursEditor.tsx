import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useIsPhone } from "@/hooks/use-media-query";
import { useUpdateStaff } from "@/lib/api/hooks";
import type { Location, Staff } from "@/lib/api/types";
import { parseTimeInput } from "@/lib/format";
import { DAY_LONG, hm } from "@/lib/locations";
import type { WorkingRule } from "@/lib/team";
import {
  copyMondayToAll,
  firstName,
  hoursAWeek,
  presetSameAs,
  presetWeekdays,
  slotsError,
  slotWarning,
  sortRules,
  weeklyMinutes,
} from "@/lib/team";
import { cn } from "@/lib/utils";

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const DEFAULT_SLOT = { startMinute: 9 * 60, endMinute: 17 * 60 };

type Slot = Omit<WorkingRule, "dayOfWeek">;
type Week = Record<number, { on: boolean; slots: Slot[] }>;

function weekFrom(rules: readonly WorkingRule[]): Week {
  const week: Week = {};
  for (const d of DAYS) {
    const slots = sortRules(rules.filter((r) => r.dayOfWeek === d)).map(
      ({ startMinute, endMinute, locationId }) => ({ startMinute, endMinute, locationId }),
    );
    week[d] = { on: slots.length > 0, slots };
  }
  return week;
}

function rulesFrom(week: Week): WorkingRule[] {
  return DAYS.flatMap((d) =>
    week[d]!.on ? week[d]!.slots.map((s) => ({ dayOfWeek: d, ...s })) : [],
  );
}

function nextSlot(slots: Slot[]): Slot {
  const last = slots[slots.length - 1];
  if (!last) return { ...DEFAULT_SLOT, locationId: null };
  const start = Math.min(last.endMinute + 60, 23 * 60);
  return {
    startMinute: start,
    endMinute: Math.min(start + 3 * 60, 24 * 60 - 15),
    locationId: last.locationId,
  };
}

/**
 * "{name}'s hours": presets, split shifts, a location per slot and an amber line
 * when a slot is outside that location's opening hours. Right drawer on desktop,
 * bottom sheet on phone.
 */
export function StaffHoursEditor({
  open,
  onOpenChange,
  person,
  locations,
  initialRules,
  suggestSameAs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Staff;
  /** Active locations the person can work at. */
  locations: Location[];
  /** A preset to start from (the panel's "Mon to Fri, 9 to 5" link). */
  initialRules?: WorkingRule[] | null;
  /** New people: point at "Same as {location}". */
  suggestSameAs?: boolean;
}) {
  const phone = useIsPhone();
  const update = useUpdateStaff();
  const [week, setWeek] = useState<Week>(() => weekFrom(person.workingRules));
  const [undo, setUndo] = useState<Week | null>(null);
  const [tried, setTried] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const places = locations.filter(
    (l) => person.locationIds.length === 0 || person.locationIds.includes(l.id),
  );
  const several = places.length > 1;
  const first = firstName(person.displayName);

  useEffect(() => {
    if (!open) return;
    setWeek(weekFrom(initialRules ?? person.workingRules));
    setUndo(null);
    setTried(false);
    setFormError(null);
    // Re-seed only when the drawer opens or the person changes underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person.id, person.version]);

  const rules = rulesFrom(week);
  const errors = Object.fromEntries(
    DAYS.map((d) => [d, week[d]!.on ? slotsError(week[d]!.slots) : null]),
  ) as Record<number, string | null>;
  const invalid = DAYS.some((d) => errors[d]);

  const apply = (next: WorkingRule[]) => {
    setUndo(week);
    setWeek(weekFrom(next));
  };
  const setDay = (d: number, next: Week[number]) => setWeek((w) => ({ ...w, [d]: next }));
  const setSlot = (d: number, i: number, patch: Partial<Slot>) =>
    setDay(d, {
      ...week[d]!,
      slots: week[d]!.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });

  const save = async () => {
    setTried(true);
    if (invalid) return;
    setFormError(null);
    try {
      await update.mutateAsync({
        staffId: person.id,
        version: person.version,
        body: { workingRules: rules },
      });
      toast.success("Hours saved");
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error && err.message ? err.message : "Couldn't save the hours.");
    }
  };

  const chip =
    "inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors hover:bg-secondary";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-[50px] h-auto rounded-t-3xl" : "sm:max-w-[480px]",
        )}
      >
        {phone ? (
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        <SheetHeader className="border-b px-4 pt-6 pb-4 text-left sm:px-6">
          <SheetTitle className="text-xl font-extrabold">{first}'s hours</SheetTitle>
          <SheetDescription>When clients can book {first}</SheetDescription>
        </SheetHeader>

        <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-5 sm:px-6">
          {formError ? (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}

          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            <button type="button" className={chip} onClick={() => apply(presetWeekdays())}>
              Mon to Fri, 9 to 5
            </button>
            {places
              .filter((l) => l.openingHours.length > 0)
              .map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  className={cn(chip, suggestSameAs && i === 0 && "border-primary bg-primary/5")}
                  onClick={() => apply(presetSameAs(l, several))}
                >
                  Same as {l.name}
                </button>
              ))}
            <button
              type="button"
              className={chip}
              disabled={!week[1]!.on}
              onClick={() =>
                apply(
                  copyMondayToAll(
                    rules,
                    DAYS.filter((d) => week[d]!.on),
                  ),
                )
              }
            >
              Copy Monday to all
            </button>
          </div>
          {undo ? (
            <p className="-mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
              Hours replaced.
              <button
                type="button"
                className="cursor-pointer font-semibold text-primary hover:underline"
                onClick={() => {
                  setWeek(undo);
                  setUndo(null);
                }}
              >
                Undo
              </button>
            </p>
          ) : null}

          <ul className="grid gap-2">
            {DAYS.map((d) => {
              const day = week[d]!;
              const error = tried || day.slots.length > 1 ? errors[d] : null;
              const errorId = error ? `staff-hours-${d}-error` : undefined;
              return (
                <li key={d} className="grid gap-2 rounded-xl border px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <Switch
                      checked={day.on}
                      aria-label={`Working on ${DAY_LONG[d]}`}
                      onCheckedChange={(on) =>
                        setDay(d, {
                          on,
                          slots:
                            on && day.slots.length === 0
                              ? [{ ...DEFAULT_SLOT, locationId: null }]
                              : day.slots,
                        })
                      }
                      className="mt-2.5"
                    />
                    <span className="mt-2.5 w-10 text-[14.5px] font-extrabold">
                      {DAY_LONG[d].slice(0, 3)}
                    </span>
                    {day.on ? (
                      <div className="grid flex-1 gap-2.5">
                        {day.slots.map((s, i) => {
                          const warning = slotWarning({ dayOfWeek: d, ...s }, places);
                          const warnId = warning ? `staff-hours-${d}-${i}-warn` : undefined;
                          const described =
                            [errorId, warnId].filter(Boolean).join(" ") || undefined;
                          return (
                            <div key={i} className="grid gap-1">
                              <div className="flex items-center gap-2">
                                <Input
                                  type="time"
                                  step={900}
                                  aria-label={`${DAY_LONG[d]} slot ${i + 1} starts`}
                                  aria-invalid={Boolean(error)}
                                  aria-describedby={described}
                                  value={hm(s.startMinute)}
                                  onChange={(e) => {
                                    const m = parseTimeInput(e.target.value);
                                    if (m !== null) setSlot(d, i, { startMinute: m });
                                  }}
                                  className={cn(
                                    "h-[38px] w-[100px]",
                                    warning && "border-amber-500",
                                  )}
                                />
                                <span className="text-xs text-muted-foreground">to</span>
                                <Input
                                  type="time"
                                  step={900}
                                  aria-label={`${DAY_LONG[d]} slot ${i + 1} ends`}
                                  aria-invalid={Boolean(error)}
                                  aria-describedby={described}
                                  value={hm(s.endMinute)}
                                  onChange={(e) => {
                                    const m = parseTimeInput(e.target.value);
                                    if (m !== null) setSlot(d, i, { endMinute: m });
                                  }}
                                  className={cn(
                                    "h-[38px] w-[100px]",
                                    warning && "border-amber-500",
                                  )}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-9 max-sm:size-11"
                                  aria-label={`Remove ${DAY_LONG[d]} slot ${i + 1}`}
                                  onClick={() => {
                                    const slots = day.slots.filter((_, j) => j !== i);
                                    setDay(d, { on: slots.length > 0, slots });
                                  }}
                                >
                                  <X className="size-4" />
                                </Button>
                              </div>
                              {several ? (
                                <Select
                                  value={s.locationId ?? "any"}
                                  onValueChange={(v) =>
                                    setSlot(d, i, { locationId: v === "any" ? null : v })
                                  }
                                >
                                  <SelectTrigger
                                    aria-label={`${DAY_LONG[d]} slot ${i + 1} location`}
                                    className="h-8 w-fit gap-1 border-0 bg-transparent px-0 text-[13px] text-muted-foreground shadow-none"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="any">Any location</SelectItem>
                                    {places.map((l) => (
                                      <SelectItem key={l.id} value={l.id}>
                                        {l.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : null}
                              {warning ? (
                                <p
                                  id={warnId}
                                  className="text-xs font-semibold text-amber-700 dark:text-amber-300"
                                >
                                  {warning}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-fit"
                          aria-label={`Add another slot on ${DAY_LONG[d]}`}
                          onClick={() =>
                            setDay(d, { ...day, slots: [...day.slots, nextSlot(day.slots)] })
                          }
                        >
                          <Plus className="size-3.5" /> Add time
                        </Button>
                      </div>
                    ) : (
                      <span className="mt-2.5 text-sm text-muted-foreground">Not working</span>
                    )}
                  </div>
                  {error ? (
                    <p id={errorId} role="alert" className="text-xs text-destructive">
                      {error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t px-4 py-4 max-sm:flex-col max-sm:items-stretch max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <span className="text-[12.5px] text-muted-foreground">
            {hoursAWeek(weeklyMinutes(rules))}
          </span>
          <div className="flex items-center gap-2">
            {phone ? null : (
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void save()}
              disabled={update.isPending}
              className={cn(phone && "h-12 w-full")}
            >
              {update.isPending ? "Saving…" : "Save hours"}
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
