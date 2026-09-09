import { useMemo, useState } from "react";
import { Check, Palette, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CatalogueService } from "@/lib/api/types";
import { groupByCategory, hasCategories } from "@/lib/service-categories";
import { cn } from "@/lib/utils";

/** Show a search box once the list is long enough that scanning it is a chore. */
const SEARCH_THRESHOLD = 8;

/**
 * "Which colour is which service?" behind a button, instead of a row of dots
 * that grows with the catalogue. Rows are clickable: choosing one applies it as
 * the calendar's service filter, so the key doubles as a quick way to isolate a
 * service; the current filter is ticked.
 */
export function ServiceKey({
  services,
  fallbackColour,
  value,
  onValueChange,
  className,
}: {
  services: readonly CatalogueService[];
  fallbackColour: string;
  /** Current service filter value ("all", a service id, or a category token). */
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;
  }, [services, query]);
  const grouped = hasCategories(services);

  const pick = (id: string) => {
    onValueChange(value === id ? "all" : id);
    setOpen(false);
  };

  const row = (s: CatalogueService) => {
    const active = value === s.id;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => pick(s.id)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary",
          active && "bg-secondary font-medium",
        )}
        aria-pressed={active}
      >
        <span
          aria-hidden
          className="inline-block size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: s.colour ?? fallbackColour }}
        />
        <span className="min-w-0 flex-1 truncate">{s.name}</span>
        {active ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
      </button>
    );
  };

  if (services.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Palette className="size-4" /> Service key
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Service colours
          </p>
          {value !== "all" ? (
            <button
              type="button"
              onClick={() => {
                onValueChange("all");
                setOpen(false);
              }}
              className="cursor-pointer text-xs text-primary hover:underline"
            >
              Show all
            </button>
          ) : null}
        </div>
        {services.length > SEARCH_THRESHOLD ? (
          <div className="relative mb-2 px-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a service"
              aria-label="Find a service"
              className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        ) : null}
        <div className="max-h-72 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No services match.</p>
          ) : grouped ? (
            groupByCategory(visible).map((group) => (
              <div key={group.category ?? "__none"} className="mb-1 last:mb-0">
                <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-muted-foreground">
                  {group.category ?? "Other"}
                </p>
                {group.items.map(row)}
              </div>
            ))
          ) : (
            visible.map(row)
          )}
        </div>
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          Tap a service to show only its bookings.
        </p>
      </PopoverContent>
    </Popover>
  );
}
