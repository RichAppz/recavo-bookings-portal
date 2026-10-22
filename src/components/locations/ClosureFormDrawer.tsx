import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import { previewClosure, useBusinessId, useSaveClosure } from "@/lib/api/hooks";
import type { ClosureBody } from "@/lib/api/hooks";
import { ApiError, describeApiError } from "@/lib/api/errors";
import type { Location } from "@/lib/api/types";
import type { BookingInTheWay, JobsInTheWay, LocationClosure } from "@/lib/closures";
import { CLOSURE_REASON_MAX, closureAddedText, closureDatesText } from "@/lib/closures";
import { hm, plural } from "@/lib/locations";
import { parseTimeInput } from "@/lib/format";
import { localDay } from "@/lib/working-days";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type InTheWay = { count: number; bookings: BookingInTheWay[] };

const SHOWN_ROWS = 5;

/**
 * Add or change a closure at one location. Bookings already inside the new time
 * are previewed as you type, and you choose what happens to them. Right drawer on
 * desktop, bottom sheet on phone.
 */
export function ClosureFormDrawer({
  open,
  onOpenChange,
  location,
  closure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: Location;
  /** Editing this closure; null adds a new one. */
  closure: LocationClosure | null;
}) {
  const phone = useIsPhone();
  const tenant = useTenant();
  const businessId = useBusinessId();
  const save = useSaveClosure();
  const noun = tenant.terminology.booking.toLowerCase();

  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [partDay, setPartDay] = useState(false);
  const [startMinute, setStartMinute] = useState(12 * 60);
  const [endMinute, setEndMinute] = useState(14 * 60);
  const [reason, setReason] = useState("");
  const [choice, setChoice] = useState<JobsInTheWay>("rebook");
  const [inTheWay, setInTheWay] = useState<InTheWay | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = localDay(new Date().toISOString(), location.timezone);
    setFrom(closure?.startsOn ?? today);
    setUntil(closure?.endsOn ?? today);
    setPartDay(closure?.startMinute != null);
    setStartMinute(closure?.startMinute ?? 12 * 60);
    setEndMinute(closure?.endMinute ?? 14 * 60);
    setReason(closure?.reason ?? "");
    setChoice("rebook");
    setInTheWay(null);
    setFormError(null);
  }, [open, closure, location.timezone]);

  const datesError =
    !from || !until ? "Pick the dates." : until < from ? "Until is before From." : null;
  const timesError =
    partDay && from === until && endMinute <= startMinute ? "The end is before the start." : null;
  const invalid = Boolean(datesError || timesError);

  const body: ClosureBody = {
    startsOn: from,
    endsOn: until,
    startMinute: partDay ? startMinute : null,
    endMinute: partDay ? endMinute : null,
    reason: reason.trim() || null,
  };
  const bodyKey = JSON.stringify(body);

  useEffect(() => {
    if (!open || invalid || !businessId) return;
    let live = true;
    const timer = setTimeout(() => {
      previewClosure(businessId, {
        ...body,
        locationId: location.id,
        ...(closure ? { closureId: closure.id } : {}),
      })
        .then((p) => live && setInTheWay(p))
        .catch(() => live && setInTheWay(null));
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // bodyKey stands in for the fields of `body`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invalid, businessId, bodyKey, location.id, closure]);

  const submit = async () => {
    if (invalid) return;
    setFormError(null);
    // Without a choice the API refuses if bookings are in the way, so a preview
    // that hadn't landed yet still ends in the question rather than a silent keep.
    const withChoice: ClosureBody =
      inTheWay && inTheWay.count > 0 ? { ...body, jobsInTheWay: choice } : body;
    try {
      const outcome = await save.mutateAsync(
        closure
          ? { kind: "update", closureId: closure.id, version: closure.version, body: withChoice }
          : { kind: "create", locationId: location.id, body: withChoice },
      );
      if (closure) toast.success(`Closure changed to ${closureDatesText(outcome.closure)}`);
      else toast.success(closureAddedText(outcome.closure, outcome));
      if (outcome.failed.length > 0) {
        toast.warning(
          `${plural(outcome.failed.length, noun)} couldn't be changed. Check them in Bookings.`,
        );
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.extensions.reason === "bookings_in_the_way") {
        setInTheWay({
          count: Number(err.extensions.count ?? 0),
          bookings: (err.extensions.bookings as BookingInTheWay[] | undefined) ?? [],
        });
        setFormError(`Some ${noun}s were booked in this time. Choose what happens to them.`);
        return;
      }
      if (err instanceof ApiError && err.isConflict) {
        setFormError("Someone else just changed this closure. Close and try again.");
        return;
      }
      setFormError(describeApiError(err, "Couldn't save the closure."));
    }
  };

  const count = inTheWay?.count ?? 0;
  const options: { value: JobsInTheWay; title: string; help: string }[] = [
    {
      value: "rebook",
      title: "Ask the clients to pick a new time",
      help: `We email them a link to rebook. Their ${noun}s stay until they do.`,
    },
    {
      value: "keep",
      title: "Keep them booked",
      help: `The closure starts after these ${noun}s.`,
    },
    {
      value: "cancel",
      title: "Cancel them and tell the clients",
      help: "Any deposits are refunded.",
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-sheet-peek rounded-t-3xl" : "sm:max-w-[480px]",
        )}
      >
        {phone ? (
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        <SheetHeader className="border-b px-6 pt-6 pb-4 text-left">
          <SheetTitle className="text-xl font-extrabold">
            {closure ? "Change closure" : "Add closure"}
          </SheetTitle>
          <SheetDescription>{location.name}</SheetDescription>
        </SheetHeader>

        <form
          id="closure-form"
          className="no-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {formError ? (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-semibold">
              From
              <Input
                type="date"
                value={from}
                aria-invalid={Boolean(datesError)}
                onChange={(e) => {
                  const v = e.target.value;
                  setFrom(v);
                  if (!until || until < v) setUntil(v);
                }}
                className="h-10"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              Until
              <Input
                type="date"
                value={until}
                min={from || undefined}
                aria-invalid={Boolean(datesError)}
                onChange={(e) => setUntil(e.target.value)}
                className="h-10"
              />
            </label>
          </div>
          {datesError && from && until ? (
            <p role="alert" className="-mt-2 text-xs text-destructive">
              {datesError}
            </p>
          ) : null}

          <div
            role="radiogroup"
            aria-label="How long"
            className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
          >
            {(
              [
                [false, "All day"],
                [true, "Part of the day"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={partDay === value}
                onClick={() => setPartDay(value)}
                className={cn(
                  "min-h-10 cursor-pointer rounded-lg px-3 py-2 text-[13px] font-bold transition-colors",
                  partDay === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {partDay ? (
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  step={900}
                  aria-label={from === until ? "Closed from" : "Closed from, on the first day"}
                  aria-invalid={Boolean(timesError)}
                  value={hm(startMinute)}
                  onChange={(e) => {
                    const m = parseTimeInput(e.target.value);
                    if (m !== null) setStartMinute(m);
                  }}
                  className="h-10 w-[112px]"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  step={900}
                  aria-label={from === until ? "Closed until" : "Closed until, on the last day"}
                  aria-invalid={Boolean(timesError)}
                  value={hm(endMinute)}
                  onChange={(e) => {
                    const m = parseTimeInput(e.target.value);
                    if (m !== null) setEndMinute(m);
                  }}
                  className="h-10 w-[112px]"
                />
              </div>
              {timesError ? (
                <p role="alert" className="text-xs text-destructive">
                  {timesError}
                </p>
              ) : from !== until ? (
                <p className="text-xs text-muted-foreground">
                  Closed from {hm(startMinute)} on the first day until {hm(endMinute)} on the last.
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="grid gap-1.5 text-sm font-semibold">
            <span>
              Reason <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Input
              value={reason}
              maxLength={CLOSURE_REASON_MAX}
              placeholder="Christmas"
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="closure-reason-help"
              className="h-10"
            />
            <span id="closure-reason-help" className="text-xs font-normal text-muted-foreground">
              Clients see "{reason.trim() ? `Closed for ${reason.trim()}` : "Closed"}" on the
              booking page.
            </span>
          </label>

          {count > 0 && inTheWay ? (
            <div className="grid gap-3">
              <div
                role="status"
                className="grid gap-2 rounded-xl bg-amber-500/12 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200"
              >
                <strong>
                  {plural(count, noun)} {count === 1 ? "is" : "are"} already booked in this time.
                </strong>
                <ul className="grid gap-1">
                  {inTheWay.bookings.slice(0, SHOWN_ROWS).map((b) => (
                    <li key={b.bookingId} className="flex gap-2 text-[13px]">
                      <span className="w-[104px] shrink-0 font-semibold whitespace-nowrap">
                        {bookingWhen(b, location.timezone)}
                      </span>
                      <span className="min-w-0 truncate">
                        {[b.recordLabel, [b.clientName ?? "Client", b.serviceName].join(" · ")]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
                {count > SHOWN_ROWS ? (
                  <span className="text-[13px]">and {count - SHOWN_ROWS} more</span>
                ) : null}
              </div>
              <div
                role="radiogroup"
                aria-label="What should happen to them?"
                className="grid gap-2"
              >
                <span className="text-sm font-bold">What should happen to them?</span>
                {options.map((o) => {
                  const on = choice === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setChoice(o.value)}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                        on && "border-primary bg-primary/5",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                          on && "border-primary",
                        )}
                      >
                        {on ? <span className="size-2 rounded-full bg-primary" /> : null}
                      </span>
                      <span className="grid gap-0.5">
                        <span className="text-sm font-bold">{o.title}</span>
                        <span className="text-xs text-muted-foreground">{o.help}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </form>

        <footer className="flex items-center justify-end gap-2 border-t px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {phone ? null : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            form="closure-form"
            disabled={save.isPending || invalid}
            className={cn(phone && "h-12 w-full")}
          >
            {save.isPending ? "Saving…" : closure ? "Save closure" : "Add closure"}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

/** "Mon 22 Dec 09:00", or without the time for an all-day job. */
function bookingWhen(b: BookingInTheWay, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(b.allDay ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }),
  })
    .format(new Date(b.start))
    .replace(",", "");
}
