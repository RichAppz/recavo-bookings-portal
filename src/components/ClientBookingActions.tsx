import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { ClientSheet, InkButton, PrimaryButton } from "@/components/client/ClientPage";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  useCancelPortalBooking,
  usePublicAvailability,
  useRequestPortalBookingMove,
  useReschedulePortalBooking,
} from "@/lib/api/hooks";
import type { AvailabilitySlot, Booking } from "@/lib/api/types";
import {
  addCalendarDays,
  bookingAdditionalServiceIds,
  canClientCancelBooking,
  canClientMoveBooking,
  clientCancelWindowHours,
  isWithinClientCancelWindow,
} from "@/lib/client-booking";
import { cancelOutcome } from "@/lib/client-account";
import { hoursLabel } from "@/lib/client-journey";
import { formatInTz, isoDateInTz, zonedDateTimeToIso } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_CHIPS = 10;

export type ClientBookingSheet = "move" | "cancel" | null;

/**
 * Move / Cancel for one of the customer's own bookings, as bottom sheets. The
 * cancel sheet states the exact money outcome before asking, and offers a move
 * first; a move inside the notice window is instant, outside it becomes a request
 * the business answers.
 */
export function ClientBookingActions({
  booking,
  businessId,
  businessName,
  variant = "default",
  className,
}: {
  booking: Booking;
  businessId: string;
  /** For the sheet copy ("Northside Strength's policy…"); falls back to "the business". */
  businessName?: string | null;
  /** `ink` renders the translucent buttons used on the dark "Next up" card. */
  variant?: "default" | "ink";
  className?: string;
}) {
  const [sheet, setSheet] = useState<ClientBookingSheet>(null);
  const canMove = canClientMoveBooking(booking);
  const canCancel = canClientCancelBooking(booking);
  if (!canMove && !canCancel) return null;

  const inkButton =
    "inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-white/12 px-4 text-[15px] font-semibold text-white transition hover:bg-white/20";

  return (
    <>
      <div className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}>
        {canMove ? (
          variant === "ink" ? (
            <button type="button" className={inkButton} onClick={() => setSheet("move")}>
              Move
            </button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setSheet("move")}>
              <CalendarClock className="size-4" /> Move
            </Button>
          )
        ) : null}
        {canCancel ? (
          variant === "ink" ? (
            <button type="button" className={inkButton} onClick={() => setSheet("cancel")}>
              Cancel
            </button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setSheet("cancel")}>
              <X className="size-4" /> Cancel
            </Button>
          )
        ) : null}
      </div>
      <ClientBookingSheets
        booking={booking}
        businessId={businessId}
        businessName={businessName ?? null}
        sheet={sheet}
        onSheetChange={setSheet}
      />
    </>
  );
}

/** The sheets on their own, for callers that draw their own Move / Cancel buttons. */
export function ClientBookingSheets({
  booking,
  businessId,
  businessName,
  sheet,
  onSheetChange,
}: {
  booking: Booking;
  businessId: string;
  businessName: string | null;
  sheet: ClientBookingSheet;
  onSheetChange: (sheet: ClientBookingSheet) => void;
}) {
  return (
    <>
      <CancelSheet
        booking={booking}
        businessId={businessId}
        businessName={businessName}
        open={sheet === "cancel"}
        onClose={() => onSheetChange(null)}
        onMoveInstead={() => onSheetChange("move")}
      />
      <MoveSheet
        booking={booking}
        businessId={businessId}
        businessName={businessName}
        open={sheet === "move"}
        onClose={() => onSheetChange(null)}
      />
    </>
  );
}

/** "tomorrow's session" / "Friday's session" / "this session". */
function sessionNoun(booking: Booking): string {
  const day = isoDateInTz(booking.start, booking.timezone);
  const today = isoDateInTz(new Date().toISOString(), booking.timezone);
  if (day === today) return "today's session";
  if (day === addCalendarDays(today, 1)) return "tomorrow's session";
  const weekday = formatInTz(booking.start, booking.timezone, { weekday: "long" });
  return `${weekday}'s session`;
}

function whenLine(booking: Booking): string {
  return `${booking.serviceSnapshot.name} · ${formatInTz(booking.start, booking.timezone, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function CancelSheet({
  booking,
  businessId,
  businessName,
  open,
  onClose,
  onMoveInstead,
}: {
  booking: Booking;
  businessId: string;
  businessName: string | null;
  open: boolean;
  onClose: () => void;
  onMoveInstead: () => void;
}) {
  const cancel = useCancelPortalBooking(businessId);
  const outcome = cancelOutcome(booking, businessName);
  const timely = isWithinClientCancelWindow(booking);
  const canMove = canClientMoveBooking(booking);
  const credit = booking.paymentMethod === "credit";

  const submit = () => {
    cancel.mutate(
      { bookingId: booking.id },
      {
        onSuccess: (next) => {
          const returned = credit && (next.cancellation?.timely ?? timely);
          toast.success(returned ? "Cancelled — your credit is back" : "Booking cancelled", {
            description: returned ? "You can book another session with it." : undefined,
          });
          onClose();
        },
      },
    );
  };

  return (
    <ClientSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !cancel.isPending) onClose();
      }}
      title={`Cancel ${sessionNoun(booking)}?`}
      description={whenLine(booking)}
    >
      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl px-4 py-3.5 text-[15px] leading-snug",
          outcome.tone === "warn"
            ? "bg-warning-soft text-warning-foreground"
            : "bg-success-soft text-success-foreground",
        )}
      >
        {outcome.tone === "warn" ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <Check className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <p>
          {outcome.before}
          {outcome.emphasis ? <b>{outcome.emphasis}</b> : null}
          {outcome.after}
        </p>
      </div>

      {canMove ? (
        <button
          type="button"
          onClick={onMoveInstead}
          className="mt-4 flex w-full items-center justify-between rounded-2xl border border-border px-4 py-3.5 text-left transition hover:bg-muted"
        >
          <span>
            <span className="block text-[16px] font-semibold">Move it instead</span>
            <span className="block text-[14px] text-muted-foreground">
              {timely
                ? "Pick a new time. Your payment stays on the booking."
                : `Ask for a new time. ${businessName ?? "The business"} decides.`}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      ) : null}

      <InkButton full className="mt-4" onClick={onClose} disabled={cancel.isPending}>
        Keep my booking
      </InkButton>
      <button
        type="button"
        onClick={submit}
        disabled={cancel.isPending}
        className="mt-3 w-full py-2 text-center text-[16px] font-semibold text-destructive disabled:opacity-50"
      >
        {cancel.isPending ? "Cancelling…" : "Cancel anyway"}
      </button>
    </ClientSheet>
  );
}

function MoveSheet({
  booking,
  businessId,
  businessName,
  open,
  onClose,
}: {
  booking: Booking;
  businessId: string;
  businessName: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const timely = isWithinClientCancelWindow(booking);
  return timely ? (
    <ReschedulePicker booking={booking} businessId={businessId} open={open} onClose={onClose} />
  ) : (
    <MoveRequest
      booking={booking}
      businessId={businessId}
      businessName={businessName}
      open={open}
      onClose={onClose}
    />
  );
}

/** Inside the notice window: the client picks from live availability and the move is instant. */
function ReschedulePicker({
  booking,
  businessId,
  open,
  onClose,
}: {
  booking: Booking;
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const timezone = booking.timezone;
  const today = isoDateInTz(new Date().toISOString(), timezone);
  const [date, setDate] = useState(today);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const move = useReschedulePortalBooking(businessId);

  useEffect(() => {
    if (open) {
      setDate(isoDateInTz(booking.start, timezone));
      setSlotStart(null);
    }
  }, [open, booking.id, booking.start, timezone]);

  const dayStartIso = zonedDateTimeToIso(date, "00:00", timezone);
  const dayStart = dayStartIso ? new Date(dayStartIso) : new Date(NaN);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const extras = bookingAdditionalServiceIds(booking);

  const availability = usePublicAvailability(businessId, {
    serviceId: booking.serviceSnapshot.serviceId,
    locationId: booking.locationId,
    from: Number.isNaN(dayStart.getTime()) ? undefined : dayStart.toISOString(),
    to: Number.isNaN(dayStart.getTime()) ? undefined : dayEnd.toISOString(),
    additionalServiceIds: extras,
    enabled: open && !Number.isNaN(dayStart.getTime()),
  });

  const slots = useMemo(
    () =>
      (availability.data ?? [])
        .filter((s) => s.start !== booking.start)
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data, booking.start],
  );
  const selected: AvailabilitySlot | null = slots.find((s) => s.start === slotStart) ?? null;
  const chips = Array.from({ length: DAY_CHIPS }, (_, i) => addCalendarDays(today, i));

  const submit = () => {
    if (!selected) return;
    move.mutate(
      { bookingId: booking.id, slotToken: selected.slotToken },
      {
        onSuccess: (next) => {
          toast.success("Booking moved", {
            description: formatInTz(next.start, next.timezone, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
            toast.error("That time was just taken. Pick another.");
            setSlotStart(null);
            void availability.refetch();
          }
        },
      },
    );
  };

  return (
    <ClientSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !move.isPending) onClose();
      }}
      title={`Move ${booking.serviceSnapshot.name}`}
      description={
        booking.paymentMethod === "credit"
          ? "Pick a new time. Your credit stays on it."
          : "Pick a new time. Anything you've paid stays on the booking."
      }
    >
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {chips.map((d) => {
          const on = d === date;
          const iso = zonedDateTimeToIso(d, "12:00", timezone);
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDate(d);
                setSlotStart(null);
              }}
              aria-pressed={on}
              className={cn(
                "flex h-[68px] w-[60px] shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="text-[12px]">
                {d === today ? "Today" : iso ? formatInTz(iso, timezone, { weekday: "short" }) : d}
              </span>
              <span className="text-[18px] font-semibold leading-tight">
                {iso ? formatInTz(iso, timezone, { day: "numeric" }) : d.slice(8)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 min-h-[120px]">
        {availability.isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[15px] text-muted-foreground">
            Nothing free this day. Try another.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => {
              const on = s.start === selected?.start;
              return (
                <button
                  key={`${s.start}-${s.staffId}`}
                  type="button"
                  onClick={() => setSlotStart(s.start)}
                  aria-pressed={on}
                  className={cn(
                    "h-12 rounded-xl border text-[15px] tabular-nums transition",
                    on ? "border-2 border-primary font-semibold" : "border-border hover:bg-muted",
                  )}
                >
                  {formatInTz(s.start, s.displayTimezone, { hour: "2-digit", minute: "2-digit" })}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <PrimaryButton full className="mt-5" disabled={!selected || move.isPending} onClick={submit}>
        {move.isPending
          ? "Moving…"
          : selected
            ? `Move to ${formatInTz(selected.start, timezone, { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
            : "Pick a new time"}
      </PrimaryButton>
      <button
        type="button"
        onClick={onClose}
        disabled={move.isPending}
        className="mt-3 w-full py-2 text-center text-[15px] font-semibold"
      >
        Keep this time
      </button>
    </ClientSheet>
  );
}

/** Outside the notice window: the client asks, and the business decides in Messages. */
function MoveRequest({
  booking,
  businessId,
  businessName,
  open,
  onClose,
}: {
  booking: Booking;
  businessId: string;
  businessName: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const request = useRequestPortalBookingMove(businessId);
  const [preferred, setPreferred] = useState("");
  const [note, setNote] = useState("");
  const hours = clientCancelWindowHours(booking);
  const who = businessName ?? "The business";

  useEffect(() => {
    if (open) {
      setPreferred("");
      setNote("");
    }
  }, [open]);

  const submit = () => {
    if (!preferred.trim()) return;
    request.mutate(
      { bookingId: booking.id, preferredTimes: preferred.trim(), note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success("Request sent", {
            description: `${who} will reply by message. Your booking stays as it is until they do.`,
          });
          onClose();
        },
      },
    );
  };

  return (
    <ClientSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !request.isPending) onClose();
      }}
      title="Ask for a new time"
      description={
        hours > 0
          ? `It's less than ${hoursLabel(hours)} away, so moving it is ${who}'s call. Tell them what suits and they'll reply by message.`
          : `Tell ${who} what suits and they'll reply by message.`
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-[15px] font-semibold">When would suit you?</span>
        <textarea
          value={preferred}
          onChange={(e) => setPreferred(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Any evening next week, or Saturday morning"
          className="w-full resize-none rounded-2xl border border-input bg-field px-4 py-3 text-[16px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1.5 block text-[15px] font-semibold">Anything else? (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full resize-none rounded-2xl border border-input bg-field px-4 py-3 text-[16px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </label>
      <PrimaryButton
        full
        className="mt-5"
        disabled={!preferred.trim() || request.isPending}
        onClick={submit}
      >
        {request.isPending ? "Sending…" : "Send request"}
      </PrimaryButton>
      <button
        type="button"
        onClick={onClose}
        disabled={request.isPending}
        className="mt-3 w-full py-2 text-center text-[15px] font-semibold"
      >
        Keep my booking
      </button>
    </ClientSheet>
  );
}
