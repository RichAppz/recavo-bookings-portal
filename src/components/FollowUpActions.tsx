import { useState } from "react";
import { AlarmClock, BellOff, CalendarPlus, MoreHorizontal, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFollowUpAction } from "@/lib/api/hooks";
import type { ServiceFollowUp } from "@/lib/api/types";
import { isOpenFollowUp, oneMonthFrom } from "@/lib/follow-ups";
import { toast } from "sonner";

/**
 * The actions on one follow-up: Book (opens the booking form prefilled), Send now,
 * Snooze 1 month, Dismiss — or Reopen once it is closed. One busy flag per row so a
 * double tap cannot fire twice; the hook toasts API errors and refreshes the lists.
 */
export function FollowUpActions({
  followUp,
  onBook,
  compact = false,
}: {
  followUp: ServiceFollowUp;
  /** Omit to hide the Book button (e.g. the row already sits on the client's page). */
  onBook?: (followUp: ServiceFollowUp) => void;
  /** Icon-only trigger for tight rows. */
  compact?: boolean;
}) {
  const act = useFollowUpAction();
  const [busy, setBusy] = useState(false);
  const open = isOpenFollowUp(followUp);

  const run = async (
    action: "dismiss" | "snooze" | "send_now" | "reopen",
    success: string,
    until?: string,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await act.mutateAsync({ followUpId: followUp.id, action, until });
      toast.success(success);
    } catch {
      // Toasted by the hook.
    } finally {
      setBusy(false);
    }
  };

  const who = followUp.customer?.firstName ?? "the client";

  return (
    <div className="flex items-center gap-1">
      {onBook && open ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBook(followUp)}
          disabled={busy}
          title={`Book ${who} in for their ${followUp.title}`}
        >
          <CalendarPlus className="size-4" />
          <span className={compact ? "sr-only sm:not-sr-only" : ""}>Book</span>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Actions for ${followUp.title}`}
            disabled={busy}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {open ? (
            <>
              <DropdownMenuItem
                onSelect={() => void run("send_now", `Reminder sent to ${who} — and a copy to you`)}
              >
                <Send className="size-4" /> Send reminder now
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void run("snooze", "Snoozed for a month", oneMonthFrom())}
              >
                <AlarmClock className="size-4" /> Snooze 1 month
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void run("dismiss", "Follow-up dismissed")}>
                <BellOff className="size-4" /> Dismiss
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => void run("reopen", "Follow-up reopened")}>
              <RotateCcw className="size-4" /> Reopen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
