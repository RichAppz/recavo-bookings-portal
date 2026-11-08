import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlarmClock,
  AlarmClockOff,
  BellOff,
  CalendarDays,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFollowUpAction } from "@/lib/api/hooks";
import type { ServiceFollowUp, ServiceFollowUpAction } from "@/lib/api/types";
import { isOpenFollowUp } from "@/lib/follow-ups";
import { formatInTz } from "@/lib/format";
import { isSnoozed } from "@/lib/service-reminders";

const DAY_MS = 86_400_000;

/** 09:00 UTC on the day `days` from now — the worker sends once that moment passes. */
function daysFromNow(days: number): Date {
  const d = new Date(Date.now() + days * DAY_MS);
  d.setUTCHours(9, 0, 0, 0);
  return d;
}

function monthFromNow(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setUTCHours(9, 0, 0, 0);
  return d;
}

/**
 * The ··· on a reminder row: Send now, Snooze, Edit the repeat reminder, View client,
 * Dismiss — or Unsnooze / Restore depending on where it sits. One busy flag per row
 * so a double tap can't fire twice; the hook toasts API errors and refreshes lists.
 */
export function ReminderMenu({
  followUp,
  timezone,
  canAct,
  onEditRule,
  triggerClassName,
}: {
  followUp: ServiceFollowUp;
  timezone: string;
  /** booking.create: every action on a follow-up needs it. */
  canAct: boolean;
  /** Opens the repeat reminder this item came from; omitted for one-offs. */
  onEditRule?: () => void;
  triggerClassName?: string;
}) {
  const act = useFollowUpAction();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [pickDate, setPickDate] = useState(false);
  const [picked, setPicked] = useState<Date | undefined>(undefined);
  const open = isOpenFollowUp(followUp);
  const snoozed = isSnoozed(followUp);
  const who = followUp.customer?.firstName ?? "the client";
  const day = (d: Date | string) =>
    formatInTz(typeof d === "string" ? d : d.toISOString(), timezone, {
      day: "numeric",
      month: "short",
    });

  const run = async (action: ServiceFollowUpAction, success: string, until?: Date) => {
    if (busy) return;
    setBusy(true);
    try {
      await act.mutateAsync({ followUpId: followUp.id, action, until: until?.toISOString() });
      if (action === "dismiss") {
        toast.success(success, {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () =>
              act.mutate(
                { followUpId: followUp.id, action: "reopen" },
                { onSuccess: () => toast.success("Reminder back on") },
              ),
          },
        });
      } else {
        toast.success(success);
      }
    } catch {
      // Toasted by the hook.
    } finally {
      setBusy(false);
    }
  };

  const snooze = (until: Date) => void run("snooze", `Snoozed to ${day(until)}`, until);

  // There's no "unsnooze" on the API: hold it until its own reminder date instead, or
  // a few minutes from now when that has already passed.
  const unsnooze = () => {
    const remindAt = new Date(followUp.remindAt);
    const soon = new Date(Date.now() + 5 * 60_000);
    const until = remindAt > soon ? remindAt : soon;
    void run(
      "snooze",
      remindAt > soon
        ? `Back on. ${who} will be reminded on ${day(remindAt)}`
        : "Back on. Sending shortly",
      until,
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={triggerClassName ?? "size-8"}
            aria-label={`More actions for ${who}'s ${followUp.title}`}
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {canAct && open && !snoozed ? (
            <DropdownMenuItem
              onSelect={() => void run("send_now", `Reminder sent to ${who}`)}
              disabled={
                followUp.sentAt !== null &&
                Date.now() - new Date(followUp.sentAt).getTime() < DAY_MS
              }
            >
              <Send className="size-4" /> Send now
            </DropdownMenuItem>
          ) : null}
          {canAct && open ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <AlarmClock className="size-4" /> {snoozed ? "Snooze longer" : "Snooze"}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => snooze(daysFromNow(7))}>1 week</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => snooze(daysFromNow(14))}>
                  2 weeks
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => snooze(monthFromNow())}>1 month</DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setPicked(undefined);
                    setPickDate(true);
                  }}
                >
                  <CalendarDays className="size-4" /> Pick a date…
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {canAct && snoozed ? (
            <DropdownMenuItem onSelect={unsnooze}>
              <AlarmClockOff className="size-4" /> Unsnooze
            </DropdownMenuItem>
          ) : null}
          {onEditRule ? (
            <DropdownMenuItem onSelect={onEditRule}>
              <Pencil className="size-4" /> Edit repeat reminder
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() =>
              void navigate({ to: "/clients/$clientId", params: { clientId: followUp.customerId } })
            }
          >
            <UserRound className="size-4" /> View client
          </DropdownMenuItem>
          {canAct && open ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void run("dismiss", "Reminder dismissed")}>
                <BellOff className="size-4" /> Dismiss
              </DropdownMenuItem>
            </>
          ) : null}
          {canAct && followUp.status === "dismissed" ? (
            <DropdownMenuItem onSelect={() => void run("reopen", "Reminder restored")}>
              <RotateCcw className="size-4" /> Restore
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pickDate} onOpenChange={setPickDate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Snooze until</DialogTitle>
            <DialogDescription>
              {who} is reminded on this day instead, and the item waits under Snoozed until then.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={picked}
              onSelect={setPicked}
              disabled={{ before: new Date(Date.now() + DAY_MS) }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickDate(false)}>
              Cancel
            </Button>
            <Button
              disabled={!picked || busy}
              onClick={() => {
                if (!picked) return;
                const until = new Date(
                  Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate(), 9),
                );
                setPickDate(false);
                snooze(until);
              }}
            >
              {picked ? `Snooze to ${day(picked)}` : "Pick a date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
