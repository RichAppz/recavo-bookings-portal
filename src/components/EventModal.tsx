import { useEffect, useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
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
import {
  eventDatesFromInterval,
  eventInterval,
  eventSpanDays,
  formatEventDateRange,
  isMultiDay,
  MAX_EVENT_DAYS,
  rangeFromTaps,
} from "@/lib/event-dates";
import { addDays, isoDate, parseIso } from "@/lib/format";
import { useSoleStaff } from "@/lib/sole";
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
  // First and last day the event covers (local YYYY-MM-DD, inclusive). A one-day
  // event has both the same; "Holiday Mon–Fri" has Friday as its endDate.
  const [startDate, setStartDate] = useState(isoDate(new Date()));
  const [endDate, setEndDate] = useState(isoDate(new Date()));
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [colour, setColour] = useState(DEFAULT_EVENT_COLOUR);
  const [notes, setNotes] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The inline range picker: closed until "Dates" is tapped; the first tap on it
  // sets the start day, the second the last day (the same day twice = one day).
  const [pickerOpen, setPickerOpen] = useState(false);
  // start → end → review: the range stays lit until "Confirm", so the dates can be
  // double-checked before the picker folds away.
  const [picking, setPicking] = useState<"start" | "end" | "review">("start");

  useEffect(() => {
    if (!open) return;
    setConflict(false);
    setConfirmDelete(false);
    setPickerOpen(false);
    setPicking("start");
    if (block) {
      const dates = eventDatesFromInterval(block.start, block.end);
      setTitle(block.title);
      setStaffId(block.staffId);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
      setFrom(dates.from);
      setTo(dates.to);
      setAllDay(dates.allDay);
      setColour(block.colour);
      setNotes(block.notes ?? "");
      return;
    }
    setTitle("");
    setStaffId(defaultStaffId ?? "");
    const day = defaultDate ?? isoDate(new Date());
    setStartDate(day);
    setEndDate(day);
    const start = defaultTime ?? "09:00";
    setFrom(start);
    setTo(addMinutesToTime(start, 60));
    setAllDay(false);
    setColour(DEFAULT_EVENT_COLOUR);
    setNotes("");
  }, [open, block, defaultDate, defaultTime, defaultStaffId]);

  // A one-person business: pick them silently and drop the field.
  const soleStaff = useSoleStaff();
  useEffect(() => {
    if (!open || editing || staffId || !soleStaff) return;
    setStaffId(soleStaff.id);
  }, [open, editing, staffId, soleStaff]);

  const saving = create.isPending || update.isPending || cancel.isPending;
  const staffLabel = tenant.terminology.staff || "Staff member";
  const bookingLabel = (tenant.terminology.booking || "Booking").toLowerCase();

  // More than one day is always whole days: the primary case is "Holiday Mon–Fri",
  // and a Mon 09:00 – Fri 10:00 block is never what someone meant by that.
  const multiDay = isMultiDay(startDate, endDate);
  const wholeDays = allDay || multiDay;
  const spanDays = eventSpanDays(startDate, endDate);
  const interval = () => eventInterval({ startDate, endDate, allDay: wholeDays, from, to });

  const valid = title.trim().length > 0 && staffId.length > 0 && interval() !== null;

  const openPicker = () => {
    setPicking("start");
    setPickerOpen((o) => !o);
  };
  const tapDay = (day: Date) => {
    const iso = isoDate(day);
    if (picking === "start") {
      setStartDate(iso);
      setEndDate(iso);
      setPicking("end");
      return;
    }
    if (picking === "review") {
      // A tap while reviewing starts a fresh pick from that day.
      setStartDate(iso);
      setEndDate(iso);
      setPicking("end");
      return;
    }
    const range = rangeFromTaps(startDate, iso);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setPicking("review");
  };
  const confirmDates = () => {
    setPicking("start");
    setPickerOpen(false);
  };
  const pickerStart = parseIso(startDate);
  // While the last day is being chosen, only the first is lit; keep the second tap
  // within the API's 31-day limit either side of it.
  const pickerSelected =
    picking === "end"
      ? { from: pickerStart, to: undefined }
      : { from: pickerStart, to: parseIso(endDate) };
  const pickerDisabled =
    picking === "end"
      ? [
          { before: addDays(pickerStart, -(MAX_EVENT_DAYS - 1)) },
          { after: addDays(pickerStart, MAX_EVENT_DAYS - 1) },
        ]
      : undefined;

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

          {soleStaff ? null : (
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
          )}

          <div className="grid gap-2">
            <Label htmlFor="ev-dates">Dates</Label>
            <Button
              id="ev-dates"
              type="button"
              variant="outline"
              aria-expanded={pickerOpen}
              aria-controls="ev-dates-picker"
              onClick={openPicker}
              className="h-auto min-h-10 w-full justify-start gap-2 px-3 py-2 text-left font-normal"
            >
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {formatEventDateRange(startDate, endDate)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {spanDays === 1 ? "1 day" : `${spanDays} days`}
              </span>
            </Button>
            {pickerOpen ? (
              <div id="ev-dates-picker" className="rounded-lg border bg-card">
                <p className="px-3 pt-3 text-xs text-muted-foreground" aria-live="polite">
                  {picking === "start"
                    ? "Tap the first day."
                    : picking === "end"
                      ? "Now tap the last day (the same day again for one day)."
                      : `${formatEventDateRange(startDate, endDate)} · ${
                          spanDays === 1 ? "1 day" : `${spanDays} days`
                        } — happy with that? Tap a day to start again.`}
                </p>
                <Calendar
                  mode="range"
                  weekStartsOn={1}
                  defaultMonth={pickerStart}
                  selected={pickerSelected}
                  onSelect={(_range, day) => tapDay(day)}
                  disabled={pickerDisabled}
                  fixedWeeks
                  className="bg-transparent [--cell-size:2.5rem]"
                  classNames={{ root: "w-full" }}
                />
                {picking === "review" ? (
                  <div className="flex justify-end gap-2 border-t px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPicking("start")}
                    >
                      Change
                    </Button>
                    <Button type="button" size="sm" onClick={confirmDates}>
                      Confirm dates
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {wholeDays ? null : (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ev-from">From</Label>
                <Input
                  id="ev-from"
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ev-to">To</Label>
                <Input id="ev-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          )}
          <label
            className={cn("flex items-start gap-2 text-sm", multiDay && "text-muted-foreground")}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={wholeDays}
              disabled={multiDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <span>
              All day
              {multiDay ? (
                <span className="block text-xs">
                  An event over several days holds each of them whole.
                </span>
              ) : null}
            </span>
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
          {!wholeDays && interval() === null && from && to ? (
            <p className="text-xs text-muted-foreground">End time must be after the start.</p>
          ) : null}
          {wholeDays && interval() === null ? (
            <p className="text-xs text-muted-foreground">
              An event can cover up to {MAX_EVENT_DAYS} days.
            </p>
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
