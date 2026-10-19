import { SwipePager } from "@/components/SwipePager";
import { addDays, isoDate, startOfWeek } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Spec §3.5: seven cells for the week around the selected day, with a dot under
 * any day that has something on. Swipe to move a week; tap to select a day. The
 * weeks either side slide in beside it as the finger moves, highlighting the same
 * weekday the turn will land on.
 */
export function WeekStrip({
  selected,
  todayIso,
  busyDays,
  onSelect,
  onShiftWeek,
}: {
  selected: Date;
  todayIso: string;
  /** Days with something on, ideally covering the weeks either side as well. */
  busyDays: ReadonlySet<string>;
  onSelect: (day: Date) => void;
  onShiftWeek: (dir: 1 | -1) => void;
}) {
  const strip = (selectedDay: Date) => {
    const monday = startOfWeek(selectedDay);
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const selectedIso = isoDate(selectedDay);
    return (
      <div
        role="group"
        aria-label="Pick a day"
        className="grid grid-cols-7 gap-1 px-0.5 pt-1 pb-2.5 select-none"
      >
        {days.map((day) => {
          const iso = isoDate(day);
          const active = iso === selectedIso;
          const today = iso === todayIso;
          const busy = busyDays.has(iso);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={active}
              aria-label={`${day.toLocaleDateString("en-GB", { dateStyle: "full" })}${busy ? ", has sessions" : ""}`}
              className={cn(
                "flex min-h-[58px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[14px] py-1.5",
                active ? "bg-primary text-primary-foreground" : "hover:bg-secondary/60",
              )}
            >
              <span className={cn("text-[11px] font-bold uppercase", !active && "opacity-75")}>
                {day.toLocaleDateString("en-GB", { weekday: "short" })}
              </span>
              <span
                className={cn(
                  "text-[17px] leading-5 font-extrabold tabular-nums",
                  today && !active && "text-primary",
                )}
              >
                {day.getDate()}
              </span>
              <span
                aria-hidden
                className={cn(
                  "size-[5px] rounded-full",
                  busy ? (active ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>
    );
  };
  return (
    <SwipePager
      onPage={onShiftWeek}
      neighbour={(dir, shown) => (shown ? strip(addDays(selected, dir * 7)) : null)}
    >
      {strip(selected)}
    </SwipePager>
  );
}
