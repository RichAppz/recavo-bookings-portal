import { useMemo, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useClosures } from "@/lib/api/hooks";
import { todayWithClosures } from "@/lib/closures";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/**
 * The location filter on a phone: a chip in the top bar that opens a "Show" sheet.
 * Same remembered choice as the desktop select, so both stay in step on this device.
 */
export function PhoneLocationSwitcher({ className }: { className?: string }) {
  const tenant = useTenant();
  const [open, setOpen] = useState(false);
  const active = tenant.locations.filter((l) => l.active);
  const range = useMemo(() => {
    const day = 24 * 3600 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    return { from: iso(Date.now() - day), to: iso(Date.now() + day) };
  }, []);
  const closures = useClosures({ ...range, enabled: open }).data ?? [];
  if (active.length < 2) return null;

  const current = active.find((l) => l.id === tenant.currentLocationId);
  const label = current?.name ?? "All locations";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-9 max-w-[150px] min-w-0 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm font-semibold",
          className,
        )}
        aria-label={`Showing ${label}. Change location`}
      >
        <MapPin aria-hidden className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="pb-safe gap-0 rounded-t-3xl p-0">
          <SheetHeader className="px-5 pt-5 pb-2 text-left">
            <SheetTitle>Show</SheetTitle>
            <SheetDescription>
              Applies to the calendar, jobs, overview, waitlist and messages on this device.
            </SheetDescription>
          </SheetHeader>
          <RadioGroup
            value={current ? current.id : "all"}
            onValueChange={(v) => {
              tenant.setCurrentLocationId(v);
              setOpen(false);
            }}
            className="grid gap-0 px-2 pb-4"
            aria-label="Location"
          >
            <Option value="all" title="All locations" line={`${active.length} locations`} />
            {active.map((l) => (
              <Option
                key={l.id}
                value={l.id}
                title={l.name}
                line={todayWithClosures(l, closures).pill}
              />
            ))}
          </RadioGroup>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Option({ value, title, line }: { value: string; title: string; line: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-secondary">
      <RadioGroupItem value={value} />
      <span className="grid min-w-0">
        <span className="truncate text-[15px] font-bold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{line}</span>
      </span>
    </label>
  );
}
