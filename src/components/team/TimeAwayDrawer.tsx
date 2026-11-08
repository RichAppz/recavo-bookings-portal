import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RadioList, TeamAvatar } from "@/components/team/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsPhone } from "@/hooks/use-media-query";
import { useBusinessId } from "@/lib/api/hooks";
import { ApiError, describeApiError } from "@/lib/api/errors";
import type { Location, Staff } from "@/lib/api/types";
import type { JobsChoice, JobsPreview, TimeAwayBody } from "@/lib/api/team";
import { previewTimeAway, useAddTimeAway } from "@/lib/api/team";
import { parseTimeInput } from "@/lib/format";
import { hm, plural, timezoneLabel } from "@/lib/locations";
import type { TimeAwayKind } from "@/lib/team";
import { firstName, KIND_LABEL, timeAwayAddedText, timeAwaySubmitLabel } from "@/lib/team";
import { useTenant } from "@/lib/tenant/tenant-context";
import { localDay } from "@/lib/working-days";
import { cn } from "@/lib/utils";

const SHOWN_ROWS = 5;
const NOTE_MAX = 200;

/** The zone a person's time away is entered in: their one location's, else the business's. */
export function zoneForPerson(
  person: Pick<Staff, "locationIds"> | null,
  locations: readonly Location[],
  businessZone: string,
): string {
  const places = person
    ? locations.filter(
        (l) => l.active && (person.locationIds.length === 0 || person.locationIds.includes(l.id)),
      )
    : [];
  return places.length === 1 ? places[0]!.timezone : businessZone;
}

function jobWhen(b: { start: string; allDay: boolean }, timeZone: string): string {
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

/**
 * Holiday, blocked time or training for one person, as real dates in the location's
 * (or business's) time zone. Jobs already booked in the time are previewed as you
 * type and you choose what happens to them. Replaces the old Block availability form.
 */
export function TimeAwayDrawer({
  open,
  onOpenChange,
  people,
  person,
  defaultKind = "holiday",
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who can be picked; ignored when `person` is fixed. */
  people: Staff[];
  /** Opened from a person (or Solo): the picker is hidden. */
  person?: Staff | null;
  defaultKind?: TimeAwayKind;
  locations: Location[];
}) {
  const phone = useIsPhone();
  const tenant = useTenant();
  const businessId = useBusinessId();
  const add = useAddTimeAway();
  const noun = tenant.terminology.booking.toLowerCase();
  const businessZone = tenant.business?.defaultTimezone ?? "Europe/London";

  const [staffId, setStaffId] = useState("");
  const [kind, setKind] = useState<TimeAwayKind>(defaultKind);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [partDay, setPartDay] = useState(false);
  const [startMinute, setStartMinute] = useState(9 * 60);
  const [endMinute, setEndMinute] = useState(12 * 60);
  const [repeat, setRepeat] = useState<"none" | "1" | "2">("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<JobsChoice>("reassign");
  const [inTheWay, setInTheWay] = useState<JobsPreview | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const who = person ?? people.find((p) => p.id === staffId) ?? null;
  const zone = zoneForPerson(who, locations, businessZone);

  useEffect(() => {
    if (!open) return;
    const today = localDay(new Date().toISOString(), zone);
    setStaffId(person?.id ?? (people.length === 1 ? people[0]!.id : ""));
    setKind(defaultKind);
    setFrom(today);
    setUntil(today);
    setPartDay(defaultKind === "block");
    setStartMinute(9 * 60);
    setEndMinute(12 * 60);
    setRepeat("none");
    setRepeatUntil("");
    setNote("");
    setChoice("reassign");
    setInTheWay(null);
    setFormError(null);
    // Reset only when the drawer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const repeating = kind === "block" && repeat !== "none";
  const datesError =
    !from || !until ? "Pick the dates." : until < from ? "Until is before From." : null;
  const timesError =
    partDay && endMinute <= startMinute ? "Finish time must be after start time." : null;
  const repeatError =
    repeating && (!repeatUntil || repeatUntil < from) ? "Pick when the repeat ends." : null;
  const invalid = !who || Boolean(datesError || timesError || repeatError);

  const body: TimeAwayBody = {
    kind,
    startsOn: from,
    endsOn: repeating ? from : until,
    startMinute: partDay ? startMinute : null,
    endMinute: partDay ? endMinute : null,
    repeat: repeating ? { everyWeeks: repeat === "2" ? 2 : 1, until: repeatUntil } : null,
    note: note.trim() || null,
  };
  const bodyKey = JSON.stringify(body);

  useEffect(() => {
    if (!open || invalid || !businessId || !who) return;
    let live = true;
    const timer = setTimeout(() => {
      previewTimeAway(businessId, who.id, body)
        .then((p) => live && setInTheWay(p))
        .catch(() => live && setInTheWay(null));
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // bodyKey stands in for the fields of `body`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invalid, businessId, bodyKey, who?.id]);

  const submit = async () => {
    if (invalid || !who) return;
    setFormError(null);
    const withChoice: TimeAwayBody =
      inTheWay && inTheWay.count > 0 ? { ...body, jobsInTheWay: choice } : body;
    try {
      const out = await add.mutateAsync({ staffId: who.id, body: withChoice });
      toast.success(timeAwayAddedText(kind, who.displayName, from, repeating ? from : until));
      if (out.unmoved.length > 0) {
        toast.warning(
          `${plural(out.unmoved.length, noun)} couldn't be given to anyone else and stayed with ${firstName(who.displayName)}.`,
          { duration: 10_000 },
        );
      }
      if (out.asked > 0) {
        toast.message(`${plural(out.asked, "client")} asked to pick a new time`);
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.extensions.reason === "bookings_in_the_way") {
        setInTheWay({
          count: Number(err.extensions.count ?? 0),
          bookings: (err.extensions.bookings as JobsPreview["bookings"] | undefined) ?? [],
        });
        setFormError(`Some ${noun}s are booked in this time. Choose what happens to them.`);
        return;
      }
      setFormError(describeApiError(err, "Couldn't save the time away."));
    }
  };

  const count = inTheWay?.count ?? 0;
  const name = who ? firstName(who.displayName) : "They";

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
        <SheetHeader className="border-b px-4 pt-6 pb-4 text-left sm:px-6">
          <SheetTitle className="text-xl font-extrabold">Add time away</SheetTitle>
          <SheetDescription>
            {person ? `${person.displayName} · ` : ""}Times are in {timezoneLabel(zone)}
          </SheetDescription>
        </SheetHeader>

        <form
          id="time-away-form"
          className="no-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-5 sm:px-6"
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

          {person ? null : (
            <label className="grid gap-1.5 text-sm font-semibold">
              Who
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choose someone" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <TeamAvatar
                          name={p.displayName}
                          photoUrl={p.photoUrl}
                          colour={p.calendarColour}
                          size={32}
                          className="scale-75"
                        />
                        {p.displayName}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}

          <div role="radiogroup" aria-label="What kind" className="grid gap-1.5">
            <span className="text-sm font-semibold">What kind</span>
            <div className="flex flex-wrap gap-2">
              {(["holiday", "block", "training"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    setKind(k);
                    if (k !== "block") setRepeat("none");
                  }}
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors max-sm:h-11",
                    kind === k
                      ? "bg-primary font-extrabold text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

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
            {repeating ? null : (
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
            )}
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
                  aria-label="Starts"
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
                  aria-label="Ends"
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
              ) : !repeating && from !== until ? (
                <p className="text-xs text-muted-foreground">
                  {hm(startMinute)} to {hm(endMinute)} on each day.
                </p>
              ) : null}
            </div>
          ) : null}

          {kind === "block" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm font-semibold">
                Repeat
                <Select value={repeat} onValueChange={(v) => setRepeat(v as typeof repeat)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Doesn't repeat</SelectItem>
                    <SelectItem value="1">Every week</SelectItem>
                    <SelectItem value="2">Every 2 weeks</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {repeating ? (
                <label className="grid gap-1.5 text-sm font-semibold">
                  Until
                  <Input
                    type="date"
                    value={repeatUntil}
                    min={from || undefined}
                    aria-invalid={Boolean(repeatError)}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    className="h-10"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <label className="grid gap-1.5 text-sm font-semibold">
            <span>
              Note <span className="font-normal text-muted-foreground">(optional, staff only)</span>
            </span>
            <Textarea
              rows={2}
              value={note}
              maxLength={NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {count > 0 && inTheWay ? (
            <div className="grid gap-3">
              <div
                role="status"
                className="grid gap-2 rounded-xl bg-amber-500/12 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200"
              >
                <strong>
                  {name} has {plural(count, noun)} booked in this time.
                </strong>
                <ul className="grid gap-1">
                  {inTheWay.bookings.slice(0, SHOWN_ROWS).map((b) => (
                    <li key={b.bookingId} className="flex gap-2 text-[13px]">
                      <span className="w-[112px] shrink-0 font-semibold whitespace-nowrap">
                        {jobWhen(b, inTheWay.timezone ?? zone)}
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
              <RadioList
                label="What should happen to them?"
                value={choice}
                onChange={setChoice}
                options={[
                  {
                    value: "reassign",
                    title: "Give them to someone else",
                    help: "We'll pick whoever is free at the same time. You can change it.",
                  },
                  {
                    value: "ask_rebook",
                    title: "Ask the clients to pick a new time",
                    help: "We email them a link to rebook.",
                  },
                  {
                    value: "keep",
                    title: `Leave them with ${name}`,
                    help: "Only new bookings are stopped.",
                  },
                ]}
              />
            </div>
          ) : null}
        </form>

        <footer className="flex items-center justify-end gap-2 border-t px-4 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {phone ? null : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            form="time-away-form"
            disabled={add.isPending || invalid}
            className={cn(phone && "h-12 w-full")}
          >
            {add.isPending ? "Saving…" : timeAwaySubmitLabel(kind)}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
