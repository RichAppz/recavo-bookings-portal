import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Spec §3.2: the phone title is the month name with a small ▾; tapping it opens a
 * month and year picker. Picking a month lands on its 1st (or today, for the
 * current month) in whatever view is open.
 */
export function MonthPicker({
  anchor,
  onPick,
  className,
}: {
  anchor: Date;
  onPick: (date: Date) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(anchor.getFullYear());
  const today = new Date();
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setYear(anchor.getFullYear());
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex cursor-pointer items-center gap-1 text-left text-[28px] leading-8 font-extrabold tracking-[-0.02em]",
            className,
          )}
          aria-label={`${anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}. Change month`}
        >
          {anchor.toLocaleDateString("en-GB", { month: "long" })}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-secondary"
            aria-label="Previous year"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-bold tabular-nums">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-secondary"
            aria-label="Next year"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((label, m) => {
            const current = anchor.getFullYear() === year && anchor.getMonth() === m;
            const isThisMonth = today.getFullYear() === year && today.getMonth() === m;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onPick(isThisMonth ? new Date() : new Date(year, m, 1));
                  setOpen(false);
                }}
                className={cn(
                  "cursor-pointer rounded-lg py-2 text-sm font-semibold hover:bg-secondary",
                  current && "bg-primary text-primary-foreground hover:bg-primary",
                  isThisMonth && !current && "text-primary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
