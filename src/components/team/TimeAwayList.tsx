import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { KindChip } from "@/components/team/parts";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Staff } from "@/lib/api/types";
import type { TimeAwayItem } from "@/lib/api/team";
import { useAddTimeAway, useRemoveTimeAway, useTimeAway } from "@/lib/api/team";
import { wallClock } from "@/lib/locations";
import type { TimeAwayKind } from "@/lib/team";
import { dateRangeText, feedWhen, firstName, KIND_LABEL } from "@/lib/team";
import { localDay } from "@/lib/working-days";

const YEAR = 365 * 24 * 3600 * 1000;

function isOwn(kind: TimeAwayItem["kind"]): kind is TimeAwayKind {
  return kind === "holiday" || kind === "block" || kind === "training";
}

function daysOf(item: TimeAwayItem, zone: string) {
  const startsOn = localDay(item.start, zone);
  const endsOn = item.allDay
    ? localDay(new Date(new Date(item.end).getTime() - 60_000).toISOString(), zone)
    : localDay(item.end, zone);
  return { startsOn, endsOn };
}

/**
 * A person's time away merged with their events and their locations' closures, in
 * date order. Upcoming by default; past (12 months) behind "Show past".
 */
export function TimeAwayList({
  person,
  zone,
  canEdit,
  limit,
  onAll,
}: {
  person: Staff;
  zone: string;
  canEdit: boolean;
  /** Show only the next few with an "All" link. */
  limit?: number;
  onAll?: () => void;
}) {
  const range = useMemo(() => {
    const now = Date.now();
    return {
      from: new Date(now - YEAR).toISOString(),
      to: new Date(now + YEAR).toISOString(),
    };
  }, []);
  const feed = useTimeAway(person.id, range);
  const remove = useRemoveTimeAway();
  const add = useAddTimeAway();
  const [showPast, setShowPast] = useState(false);
  const [confirming, setConfirming] = useState<{ item: TimeAwayItem; series: boolean } | null>(
    null,
  );

  const now = Date.now();
  const items = feed.data ?? [];
  const upcoming = items.filter((i) => new Date(i.end).getTime() > now);
  const past = items.filter((i) => new Date(i.end).getTime() <= now).reverse();
  const shown = limit ? upcoming.slice(0, limit) : upcoming;
  const first = firstName(person.displayName);

  const doRemove = async (item: TimeAwayItem, series: boolean) => {
    try {
      await remove.mutateAsync({ staffId: person.id, timeAwayId: item.id, series });
      const { startsOn, endsOn } = daysOf(item, zone);
      const kind = item.kind as TimeAwayKind;
      toast.success("Time away removed", {
        action: series
          ? undefined
          : {
              label: "Undo",
              onClick: () => {
                const start = wallClock(new Date(item.start), zone).minute;
                const end = wallClock(new Date(item.end), zone).minute;
                void add
                  .mutateAsync({
                    staffId: person.id,
                    body: {
                      kind,
                      startsOn,
                      endsOn,
                      startMinute: item.allDay ? null : start,
                      endMinute: item.allDay ? null : end,
                      note: item.note,
                      jobsInTheWay: "keep",
                    },
                  })
                  .then(() => toast.success("Time away put back"))
                  .catch(() => toast.error("Couldn't put it back. Add it again."));
              },
            },
      });
    } catch {
      toast.error("Couldn't remove it. Try again.");
    }
  };

  const row = (item: TimeAwayItem) => {
    const own = isOwn(item.kind);
    return (
      <li
        key={`${item.kind}-${item.id}-${item.start}`}
        className="flex items-center gap-3 px-3.5 py-2.5"
      >
        <KindChip kind={item.kind} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[13px] font-semibold">{feedWhen(item, zone)}</span>
          {item.title || item.note ? (
            <span className="truncate text-xs text-muted-foreground">
              {[item.title, item.note].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        {own && canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 max-sm:size-11"
                aria-label={`Options for ${KIND_LABEL[item.kind].toLowerCase()} ${feedWhen(item, zone)}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirming({ item, series: false })}
              >
                Remove
              </DropdownMenuItem>
              {item.seriesId ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirming({ item, series: true })}
                >
                  Remove every repeat
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : item.kind === "event" ? (
          <Link
            to="/events"
            className="shrink-0 text-[13px] font-semibold text-primary hover:underline"
          >
            Open
          </Link>
        ) : item.kind === "closure" && item.locationId ? (
          <Link
            to="/locations"
            search={{ location: item.locationId }}
            className="shrink-0 text-[13px] font-semibold text-primary hover:underline"
          >
            Open
          </Link>
        ) : null}
      </li>
    );
  };

  if (feed.isLoading) return <Skeleton className="h-20 w-full rounded-xl" />;
  if (feed.isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn't load time away.{" "}
        <button
          type="button"
          className="cursor-pointer font-semibold text-primary hover:underline"
          onClick={() => void feed.refetch()}
        >
          Try again
        </button>
      </p>
    );
  }

  const confirmDays = confirming ? daysOf(confirming.item, zone) : null;

  return (
    <div className="grid gap-2">
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing coming up.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">{shown.map(row)}</ul>
      )}
      {limit && onAll && (upcoming.length > limit || past.length > 0) ? (
        <button
          type="button"
          onClick={onAll}
          className="inline-flex w-fit cursor-pointer items-center text-[13px] font-semibold text-primary hover:underline"
        >
          All <ChevronRight className="size-3.5" aria-hidden />
        </button>
      ) : null}
      {!limit && past.length > 0 ? (
        showPast ? (
          <>
            <p className="pt-2 text-xs font-bold text-muted-foreground uppercase">Past</p>
            <ul className="divide-y overflow-hidden rounded-xl border opacity-80">
              {past.map(row)}
            </ul>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowPast(true)}
            className="w-fit cursor-pointer text-[13px] font-semibold text-primary hover:underline"
          >
            Show past
          </button>
        )
      ) : null}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(o) => (o ? undefined : setConfirming(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.series
                ? "Remove every repeat?"
                : `Remove this ${confirming ? KIND_LABEL[confirming.item.kind].toLowerCase() : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.series
                ? `${first} can be booked again at those times.`
                : confirmDays
                  ? `${first} can be booked again from ${dateRangeText(confirmDays.startsOn, confirmDays.endsOn)}.`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirming) void doRemove(confirming.item, confirming.series);
                setConfirming(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
