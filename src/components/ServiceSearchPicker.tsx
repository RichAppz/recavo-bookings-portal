import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CatalogueService } from "@/lib/api/types";
import { formatDuration, formatMoney } from "@/lib/format";
import { groupByCategory, hasCategories } from "@/lib/service-categories";
import { cn } from "@/lib/utils";

/**
 * Type-to-find service picker for staff forms. The catalogue is already loaded, so
 * this filters locally on name, category and description.
 */
export function ServiceSearchPicker({
  services,
  value,
  onSelect,
  placeholder = "Choose a service",
  searchPlaceholder = "Search services…",
  emptyMessage = "No services match.",
  disabled,
  id,
}: {
  services: CatalogueService[];
  /** Selected service id; null/"" shows the placeholder. */
  value: string | null;
  onSelect: (service: CatalogueService) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const selected = value ? services.find((s) => s.id === value) : undefined;
  // Categories only appear as headings once the catalogue actually uses them.
  const grouped = hasCategories(services);
  const matches = needle
    ? services.filter((s) =>
        [s.name, s.category ?? "", s.description ?? ""].some((text) =>
          text.toLowerCase().includes(needle),
        ),
      )
    : services;

  // `modal` so the list gets its own scroll-lock shard: without it the hosting
  // Dialog's lock swallows touch scrolling in the portalled popover on iOS.
  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            {matches.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              groupByCategory(matches).map((group) => (
                <CommandGroup
                  key={group.category ?? "__none"}
                  heading={grouped ? (group.category ?? "Other") : undefined}
                >
                  {group.items.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.id}
                      onSelect={() => {
                        onSelect(s);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          selected?.id === s.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            formatDuration(s.durationMinutes),
                            formatMoney(s.basePriceMinor, s.currency),
                            // Already the heading when grouped.
                            grouped ? null : s.category,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
