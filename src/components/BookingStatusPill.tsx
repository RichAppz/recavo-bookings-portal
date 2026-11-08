import { Check } from "lucide-react";

import type { Booking } from "@/lib/api/types";
import { statusPill, type PillTone } from "@/lib/bookings-list";
import { cn } from "@/lib/utils";

const PILL_TONE: Record<PillTone, string> = {
  green: "bg-cal-paid-bg text-cal-paid-fg",
  amber: "bg-cal-deposit-bg text-cal-deposit-fg",
  red: "bg-cal-unpaid-bg text-cal-unpaid-fg",
  grey: "bg-secondary text-muted-foreground",
};

/**
 * Spec §5.1 status pill: Confirmed, Held, Unpaid, Cancelled, No-show, Attended.
 * The more specific wording ("Cancelled by client") stays as a tooltip.
 */
export function StatusPill({ booking, className }: { booking: Booking; className?: string }) {
  const pill = statusPill(booking);
  return (
    <span
      title={pill.detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
        PILL_TONE[pill.tone],
        className,
      )}
    >
      {pill.tick ? <Check className="size-3" aria-hidden /> : null}
      {pill.label}
    </span>
  );
}
