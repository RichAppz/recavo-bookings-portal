import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  useCancelCalendarBlock,
  useCreateCalendarBlock,
  useStaffList,
  useUpdateCalendarBlock,
} from "@/lib/api/hooks";
import type { CalendarBlock } from "@/lib/api/types";
import { isoDate } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/** Server default; kept in step with `DEFAULT_BLOCK_COLOUR` in the API. */
export const DEFAULT_EVENT_COLOUR = "#64748B";

/** A short palette so most events are one click; the picker covers the rest. */
const EVENT_COLOURS: { value: string; label: string }[] = [
  { value: "#64748B", label: "Slate" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#EF4444", label: "Red" },
  { value: "#8B5CF6", label: "Violet" },
  { value: "#10B981", label: "Green" },
  { value: "#0EA5E9", label: "Sky" },
];

const pad = (n: number) => `${n}`.padStart(2, "0");

/** Local wall-clock parts for an instant, matching what `<input type=time>` shows. */
function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: isoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/**
 * Create or edit a staff event ("calendar block", RECA-531): personal time that keeps
 * bookings off the diary — a dentist appointment, the school run. Nothing to do with
 * customers or payment, so it is deliberately a small form.
 */
export function EventModal({
  open,
  onOpenChange,
  block,
  defaultDate,
  defaultTime,
  defaultStaffId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing event to edit; omit to create a new one. */
  block?: CalendarBlock | null;
  /** ISO date (YYYY-MM-DD) to start on — the day clicked in the calendar. */
  defaultDate?: string;
  /** HH:MM local, when the click landed on a specific hour of the grid. */
  defaultTime?: string;
  defaultStaffId?: string;
}) {
  const tenant = useTenant();
  const staff = useStaffList();
  const create = useCreateCalendarBlock();
  const update = useUpdateCalendarBlock();
  const cancel = useCancelCalendarBlock();
  const editing = Boolean(block);

  const [title, setTitle] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [colour, setColour] = useState(DEFAULT_EVENT_COLOUR);
  const [notes, setNotes] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConflict(false);
    setConfirmDelete(false);
    if (block) {
      const s = localParts(block.start);
      const e = localParts(block.end);
      setTitle(block.title);
      setStaffId(block.staffId);
      setDate(s.date);
      setFrom(s.time);
      // An event ending at midnight the next day is "all day" on its start date.
      const wholeDay = s.time === "00:00" && e.time === "00:00" && e.date !== s.date;
      setAllDay(wholeDay);
      setTo(wholeDay ? "23:59" : e.time);
      setColour(block.colour);
      setNotes(block.notes ?? "");
      return;
    }
    setTitle("");
    setStaffId(defaultStaffId ?? "");
    setDate(defaultDate ?? isoDate(new Date()));
    const start = defaultTime ?? "09:00";
    setFrom(start);
    setTo(addMinutesToTime(start, 60));
    setAllDay(false);
    setColour(DEFAULT_EVENT_COLOUR);
    setNotes("");
  }, [open, block, defaultDate, defaultTime, defaultStaffId]);

  // Only one staff member? Save the click.
  useEffect(() => {
    if (!open || editing || staffId) return;
    const list = staff.data ?? [];
    if (list.length === 1 && list[0]) setStaffId(list[0].id);
  }, [open, editing, staffId, staff.data]);

  const saving = create.isPending || update.isPending || cancel.isPending;
  const staffLabel = tenant.terminology.staff || "Staff member";
  const bookingLabel = (tenant.terminology.booking || "Booking").toLowerCase();

  const interval = (): { start: string; end: string } | null => {
    if (allDay) {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    const start = new Date(`${date}T${from}:00`);
    const end = new Date(`${date}T${to}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end.getTime() <= start.getTime()) return null;
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const valid = title.trim().length > 0 && staffId.length > 0 && interval() !== null;

  const submit = async () => {
    const range = interval();
    if (!range) return;
    setConflict(false);
    try {
      if (block) {
        await update.mutateAsync({
          blockId: block.id,
          body: {
            title: title.trim(),
            staffId,
            start: range.start,
            end: range.end,
            colour,
            notes: notes.trim() || null,
          },
        });
        toast.success("Event updated");
      } else {
        await create.mutateAsync({
          staffId,
          title: title.trim(),
          start: range.start,
          end: range.end,
          colour,
          notes: notes.trim() || null,
        });
        toast.success("Event added to the calendar");
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "BOOKING_CONFLICT") {
        setConflict(true);
        return;
      }
      // Anything else has already been toasted by the mutation hook.
    }
  };

  const remove = async () => {
    if (!block) return;
    try {
      await cancel.mutateAsync(block.id);
      toast.success("Event removed");
      onOpenChange(false);
    } catch {
      // Toasted by the hook.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit event" : "Add event"}</DialogTitle>
          <DialogDescription>
            Personal time on the calendar — a dentist appointment, a school run. No {bookingLabel}{" "}
            can be made over it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ev-title">Title</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dentist"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>{staffLabel}</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder={`Choose ${staffLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {(staff.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="ev-date">Date</Label>
              <Input
                id="ev-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ev-from">From</Label>
              <Input
                id="ev-from"
                type="time"
                value={from}
                disabled={allDay}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ev-to">To</Label>
              <Input
                id="ev-to"
                type="time"
                value={to}
                disabled={allDay}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day
          </label>

          <div className="grid gap-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap items-center gap-2">
              {EVENT_COLOURS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={colour === c.value}
                  onClick={() => setColour(c.value)}
                  className={cn(
                    "size-7 cursor-pointer rounded-full border-2 border-transparent transition-transform hover:scale-110",
                    colour === c.value && "border-foreground",
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom colour"
                value={colour}
                onChange={(e) => setColour(e.target.value.toUpperCase())}
                className="size-7 cursor-pointer rounded-full border bg-transparent p-0"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ev-notes">Notes (optional)</Label>
            <Textarea
              id="ev-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>

          {conflict ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              That time is already taken by a {bookingLabel} or another event. Pick a different
              time.
            </p>
          ) : null}
          {!allDay && interval() === null && from && to ? (
            <p className="text-xs text-muted-foreground">End time must be after the start.</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Remove this event?</span>
                <Button variant="destructive" size="sm" disabled={saving} onClick={remove}>
                  Yes, remove
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={saving}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" /> Remove
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!valid || saving} onClick={submit}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add event"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
