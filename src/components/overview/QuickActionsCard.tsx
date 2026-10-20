import type { ComponentType } from "react";
import {
  CalendarPlus,
  CalendarX,
  Clock,
  Hourglass,
  Link2,
  MessageSquarePlus,
  Package,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { type QuickActionKey } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { CardTitle, OvCard } from "./shared";

export const QUICK_ICONS: Record<QuickActionKey, ComponentType<{ className?: string }>> = {
  add_booking: CalendarPlus,
  group: UsersRound,
  add_event: Clock,
  add_client: UserPlus,
  add_waitlist: Hourglass,
  sell_package: Package,
  send_message: MessageSquarePlus,
  block_time: CalendarX,
  copy_link: Link2,
};

export function quickActionLabel(key: QuickActionKey, bookingNoun: string): string {
  switch (key) {
    case "add_booking":
      return `Add ${bookingNoun.trim().toLowerCase() || "booking"}`;
    case "group":
      return "Group session";
    case "add_event":
      return "Add event";
    case "add_client":
      return "Add client";
    case "add_waitlist":
      return "Add to waitlist";
    case "sell_package":
      return "Sell package";
    case "send_message":
      return "Send message";
    case "block_time":
      return "Block time";
    case "copy_link":
      return "Copy booking link";
  }
}

export function QuickActionsCard({
  actions,
  bookingNoun,
  onAction,
  bare = false,
}: {
  actions: QuickActionKey[];
  bookingNoun: string;
  onAction: (key: QuickActionKey) => void;
  /** Phone: a heading over the grid instead of a card. */
  bare?: boolean;
}) {
  if (actions.length === 0) return null;
  const grid = (
    <div className={cn("grid grid-cols-2 gap-2", !bare && "px-[18px] pb-[18px]")}>
      {actions.map((key) => {
        const Icon = QUICK_ICONS[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onAction(key)}
            className="flex h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-secondary px-2.5 text-left text-[13.5px] font-bold transition-colors hover:bg-secondary/70"
          >
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-card text-foreground dark:bg-[#2a303a]"
            >
              <Icon className="size-3.5" />
            </span>
            <span className="truncate">{quickActionLabel(key, bookingNoun)}</span>
          </button>
        );
      })}
    </div>
  );
  if (bare) {
    return (
      <section aria-labelledby="quick-title" className="min-w-0">
        <div className="px-1 pb-2">
          <CardTitle id="quick-title">Quick actions</CardTitle>
        </div>
        {grid}
      </section>
    );
  }
  return (
    <OvCard label="Quick actions">
      <div className="px-[18px] pt-4 pb-3">
        <CardTitle>Quick actions</CardTitle>
      </div>
      {grid}
    </OvCard>
  );
}
