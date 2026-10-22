import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PinTile } from "@/components/locations/parts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useArchiveLocation, useDeleteLocation } from "@/lib/api/hooks";
import type { LocationActivity } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import type { CatalogueService, Location, Staff } from "@/lib/api/types";
import type { PlanSeat } from "@/lib/locations";
import { plural } from "@/lib/locations";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type Choice = "move" | "cancel" | "later";

function nextLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(",", "")
    .replace(/(\d{1,2} \w{3}) /, "$1 at ");
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * "Archive {name}?" When bookings are still to come it asks what happens to them:
 * move them to another location, cancel them (clients told, deposits refunded), or
 * not yet, so staff can move them by hand first.
 */
export function ArchiveLocationDialog({
  location,
  activity,
  locations,
  staff,
  services,
  onOpenChange,
  onArchived,
  onSortFirst,
}: {
  location: Location | null;
  activity: LocationActivity | undefined;
  locations: Location[];
  staff: Staff[];
  services: CatalogueService[];
  onOpenChange: (open: boolean) => void;
  onArchived?: (location: Location) => void;
  onSortFirst: (location: Location) => void;
}) {
  const tenant = useTenant();
  const archive = useArchiveLocation();
  const noun = tenant.terminology.booking.toLowerCase();
  const [choice, setChoice] = useState<Choice>("move");
  const [moveTo, setMoveTo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const others = useMemo(
    () => locations.filter((l) => l.active && l.id !== location?.id),
    [locations, location?.id],
  );
  const future = activity?.futureBookings ?? 0;

  useEffect(() => {
    if (!location) return;
    setChoice("move");
    setMoveTo(others[0]?.id ?? "");
    setError(null);
  }, [location, others]);

  if (!location) return null;
  const only = others.length === 0;
  const onlyHere = staff
    .filter((s) => s.locationIds.length === 1 && s.locationIds[0] === location.id)
    .map((s) => s.displayName);
  const servicesOnlyHere = services.filter(
    (s) => s.locationIds.length === 1 && s.locationIds[0] === location.id,
  ).length;
  const jobs = plural(future, noun);

  const label =
    future === 0
      ? "Archive"
      : choice === "move"
        ? `Move ${jobs} and archive`
        : choice === "cancel"
          ? `Cancel ${jobs} and archive`
          : `Show the ${jobs}`;

  const confirm = async () => {
    if (future > 0 && choice === "later") {
      onOpenChange(false);
      onSortFirst(location);
      return;
    }
    setError(null);
    try {
      const result = await archive.mutateAsync({
        locationId: location.id,
        version: location.version,
        ...(future > 0
          ? choice === "move"
            ? { futureBookings: "move" as const, moveToLocationId: moveTo }
            : { futureBookings: "cancel" as const }
          : {}),
      });
      toast.success(`${location.name} archived`);
      const stuck = result.notMoved.length;
      if (stuck > 0) {
        toast.warning(
          `${plural(stuck, noun)} couldn't move, so ${stuck === 1 ? "it stays" : "they stay"} at ${location.name}. Move ${stuck === 1 ? "it" : "them"} from Bookings.`,
          { duration: 10_000 },
        );
      }
      if (result.refundsFailed.length > 0) {
        toast.warning(
          `${plural(result.refundsFailed.length, "deposit")} couldn't be refunded automatically. Refund from the ${noun}.`,
          { duration: 10_000 },
        );
      }
      onOpenChange(false);
      onArchived?.(result.location);
    } catch (err) {
      if (err instanceof ApiError && err.extensions.reason === "future_bookings") {
        setError(`More ${noun}s were booked here just now. Check the numbers and try again.`);
        return;
      }
      setError(err instanceof ApiError ? err.detail || err.title : "Couldn't archive. Try again.");
    }
  };

  const options: { value: Choice; title: string; help: string }[] = [
    {
      value: "move",
      title: "Move them to",
      help: "Same times. Clients get an email saying where to go.",
    },
    {
      value: "cancel",
      title: "Cancel them and tell the clients",
      help: "Any deposits are refunded.",
    },
    {
      value: "later",
      title: "Not yet, I'll sort them first",
      help: `Shows the ${jobs} so you can move them yourself.`,
    },
  ];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Archive {location.name}?</DialogTitle>
          <DialogDescription>
            {only
              ? "This is your only location. Add another before archiving it."
              : `Nobody will be able to book here, and it frees a place on your plan. Past ${noun}s keep their records. You can restore it later.`}
          </DialogDescription>
        </DialogHeader>

        {!only && future > 0 ? (
          <div className="grid gap-3">
            <p
              role="status"
              className="rounded-xl bg-amber-500/12 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200"
            >
              <strong>
                {jobs} {future === 1 ? "is" : "are"} booked here from today.
              </strong>
              {activity?.nextBookingAt ? (
                <> The next is {nextLabel(activity.nextBookingAt, location.timezone)}.</>
              ) : null}
            </p>
            <div role="radiogroup" aria-label="What should happen to them?" className="grid gap-2">
              {options.map((o) => {
                const on = choice === o.value;
                return (
                  <div
                    key={o.value}
                    className={cn(
                      "grid gap-2 rounded-xl border p-3 transition-colors",
                      on && "border-primary bg-primary/5",
                    )}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setChoice(o.value)}
                      className="flex cursor-pointer items-start gap-3 text-left"
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
                    {o.value === "move" && on ? (
                      <Select value={moveTo} onValueChange={setMoveTo}>
                        <SelectTrigger aria-label="Move them to" className="ml-7 w-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {others.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {!only && (onlyHere.length > 0 || servicesOnlyHere > 0) ? (
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {onlyHere.length > 0 ? (
              <li>
                {joinNames(onlyHere)} only {onlyHere.length === 1 ? "works" : "work"} here. They'll
                be set to work anywhere.
              </li>
            ) : null}
            {servicesOnlyHere > 0 ? (
              <li>
                {plural(servicesOnlyHere, tenant.terminology.service.toLowerCase())} only offered
                here will be offered at all locations.
              </li>
            ) : null}
          </ul>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {only ? "OK" : "Cancel"}
          </Button>
          {only ? null : (
            <Button
              variant={choice === "cancel" && future > 0 ? "destructive" : "default"}
              disabled={archive.isPending || (future > 0 && choice === "move" && !moveTo)}
              onClick={() => void confirm()}
            >
              {archive.isPending ? "Archiving…" : label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Delete {name}?" Only offered for a location that was never booked. */
export function DeleteLocationDialog({
  location,
  onOpenChange,
  onDeleted,
}: {
  location: Location | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const remove = useDeleteLocation();
  return (
    <AlertDialog open={Boolean(location)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {location?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It's never been booked, so it'll be removed for good.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={remove.isPending}
            onClick={async (e) => {
              e.preventDefault();
              if (!location) return;
              try {
                await remove.mutateAsync(location.id);
                toast.success(`${location.name} deleted`);
                onOpenChange(false);
                onDeleted?.();
              } catch (err) {
                toast.error(
                  err instanceof ApiError ? err.detail || err.title : "Couldn't delete. Try again.",
                );
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * "Your Business plan includes 2 locations", with the way up (or archiving one).
 * Shown instead of an error whenever Add or Restore would go over the plan.
 */
export function PlanLimitDialog({
  open,
  onOpenChange,
  seat,
  onArchiveOne,
  onSeePlans,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seat: PlanSeat;
  onArchiveOne: () => void;
  onSeePlans: () => void;
}) {
  const allowed = seat.allowed ?? seat.used;
  const nextAllowed = seat.next?.limits["locations.active"];
  const body =
    seat.next === null
      ? `${seat.planName} is our largest plan. Contact us if you need more.`
      : seat.planCode === "solo"
        ? `Move to Business for 2 locations, or Growth for up to 5.`
        : `You're using ${allowed === 2 ? "both" : `all ${allowed}`}. Move to ${seat.next.name} for up to ${nextAllowed} locations, or archive one you no longer use.`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <PinTile kind="premises" />
          <DialogTitle className="pt-2">
            Your {seat.planName} plan includes {plural(allowed, "location")}
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onArchiveOne();
            }}
          >
            {seat.used > 1 ? "Archive one" : "OK"}
          </Button>
          {seat.next ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                onSeePlans();
              }}
            >
              See {seat.next.name}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
