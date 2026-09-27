import { useState } from "react";
import { CalendarPlus, MoreHorizontal, Pencil, RotateCcw, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWaitlistAction } from "@/lib/api/hooks";
import type { WaitlistEntry } from "@/lib/api/types";

/**
 * The actions on one waitlist entry: Book (opens the booking form prefilled, the
 * entry closes itself once the booking is created), Edit, Remove — or Reopen once it
 * is closed. One busy flag per row so a double tap cannot fire twice.
 */
export function WaitlistActions({
  entry,
  onBook,
  onEdit,
  compact = false,
}: {
  entry: WaitlistEntry;
  onBook?: (entry: WaitlistEntry) => void;
  onEdit?: (entry: WaitlistEntry) => void;
  /** Icon-only trigger for tight rows. */
  compact?: boolean;
}) {
  const act = useWaitlistAction();
  const [busy, setBusy] = useState(false);
  const open = entry.status === "waiting";
  const who = entry.customer?.firstName ?? "the client";

  const run = async (action: "cancel" | "reopen", success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await act.mutateAsync({ entryId: entry.id, action });
      toast.success(success);
    } catch {
      // Toasted by the hook.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {onBook && open ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBook(entry)}
          disabled={busy}
          title={`Book ${who} in for their ${entry.service?.name ?? "service"}`}
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
            aria-label={`Actions for ${who}'s waitlist entry`}
            disabled={busy}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {open ? (
            <>
              {onEdit ? (
                <DropdownMenuItem onSelect={() => onEdit(entry)}>
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
              ) : null}
              {onEdit ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                onSelect={() => void run("cancel", `${who} removed from the waitlist`)}
              >
                <UserRoundX className="size-4" /> Remove from waitlist
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => void run("reopen", `${who} is back on the waitlist`)}>
              <RotateCcw className="size-4" /> Put back on the waitlist
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
