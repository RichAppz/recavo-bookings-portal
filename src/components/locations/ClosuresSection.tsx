import { useState } from "react";
import { CalendarOff, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ClosureFormDrawer } from "@/components/locations/ClosureFormDrawer";
import { SectionHeading } from "@/components/locations/parts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAddBankHolidays, useDeleteClosure } from "@/lib/api/hooks";
import type { Location } from "@/lib/api/types";
import { PUBLIC_HOLIDAY_REGIONS, publicHolidayRegionFrom } from "@/lib/calendar-settings";
import type { LocationClosure } from "@/lib/closures";
import { closureDatesText, upcomingClosures } from "@/lib/closures";
import { plural } from "@/lib/locations";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const SHOWN = 5;

/**
 * Upcoming closures at one location, with add, edit, remove and "Add bank
 * holidays". Past closures are hidden.
 */
export function ClosuresSection({
  location,
  closures,
  canEdit,
  className,
}: {
  location: Location;
  /** Closures for the business; this picks the ones at `location`. */
  closures: readonly LocationClosure[];
  canEdit: boolean;
  className?: string;
}) {
  const tenant = useTenant();
  const noun = tenant.terminology.booking.toLowerCase();
  const remove = useDeleteClosure();
  const bankHolidays = useAddBankHolidays();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<LocationClosure | null>(null);
  const [showAll, setShowAll] = useState(false);

  const region = publicHolidayRegionFrom(tenant.configuration) ?? "england-and-wales";
  const regionLabel = PUBLIC_HOLIDAY_REGIONS.find((r) => r.value === region)?.label ?? "England";
  const ahead = upcomingClosures(closures, location);
  const shown = showAll ? ahead : ahead.slice(0, SHOWN);

  const openAdd = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const addBankHolidays = async () => {
    const res = await bankHolidays.mutateAsync({ locationId: location.id, region });
    if (res.added.length === 0) {
      toast.message("The bank holidays for the next 12 months are already here.");
      return;
    }
    toast.success(`${plural(res.added.length, "bank holiday")} added`, {
      description:
        res.bookingsInTheWay > 0
          ? `${plural(res.bookingsInTheWay, noun)} already booked on them stay booked.`
          : undefined,
    });
  };

  return (
    <section className={cn("grid content-start gap-2", className)}>
      <SectionHeading
        action={
          canEdit ? (
            <Button variant="ghost" size="sm" onClick={openAdd}>
              <Plus className="size-3.5" /> Add
            </Button>
          ) : null
        }
      >
        Closures
      </SectionHeading>
      {ahead.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border text-sm">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3.5">
              <span className="grid min-w-0 flex-1 gap-0.5 py-0.5">
                <span className="font-semibold tabular-nums">{closureDatesText(c)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {c.reason ?? "No reason given"}
                </span>
              </span>
              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={`More for the closure on ${closureDatesText(c)}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(c);
                        setDrawerOpen(true);
                      }}
                    >
                      <Pencil className="size-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        remove.mutate(c.id, {
                          onSuccess: () =>
                            toast.success(`Closure on ${closureDatesText(c)} removed`),
                        })
                      }
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-4" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No closures coming up.</p>
      )}
      {ahead.length > SHOWN ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="cursor-pointer justify-self-start text-[13px] font-semibold text-primary hover:underline"
        >
          {showAll ? "Show fewer" : `Show all ${ahead.length}`}
        </button>
      ) : null}
      {canEdit ? (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={bankHolidays.isPending}
          onClick={() => void addBankHolidays().catch(() => undefined)}
        >
          <CalendarOff className="size-3.5" />
          {bankHolidays.isPending ? "Adding…" : `Add bank holidays (${regionLabel})`}
        </Button>
      ) : null}

      <ClosureFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        location={location}
        closure={editing}
      />
    </section>
  );
}
