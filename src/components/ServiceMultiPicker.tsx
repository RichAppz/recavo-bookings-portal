import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogueService } from "@/lib/api/types";
import { formatDuration, formatMoney } from "@/lib/format";
import { groupByCategory, hasCategories } from "@/lib/service-categories";
import { cn } from "@/lib/utils";

/** One booked service: the catalogue entry plus which variant, if any. */
export type PickedService = { serviceId: string; variantId: string | null };

/**
 * Type-to-find service dropdown for the Add booking form that takes more than one
 * pick. Clicking a service ticks it and leaves the list open so the next one is a
 * click away; clicking again unticks it. The first picked is the main service (it
 * sets the slot search and the record rule); the rest ride along as additional
 * services. Variants are chosen on the selected rows underneath.
 */
export function ServiceMultiPicker({
  services,
  value,
  onChange,
  multi,
  singleReason,
  id,
}: {
  services: CatalogueService[];
  value: PickedService[];
  onChange: (next: PickedService[]) => void;
  /** False when only one service may be booked (group sessions, paying by credit). */
  multi: boolean;
  /** Why only one can be picked, shown when someone clicks a second. */
  singleReason?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [nudge, setNudge] = useState<string | null>(null);
  const byId = new Map(services.map((s) => [s.id, s]));
  const picked = value.filter((p) => byId.has(p.serviceId));
  const isPicked = (id: string) => picked.some((p) => p.serviceId === id);

  const toggle = (s: CatalogueService) => {
    setNudge(null);
    if (isPicked(s.id)) {
      onChange(picked.filter((p) => p.serviceId !== s.id));
      return;
    }
    // A second service can only join an individual job; otherwise the click swaps.
    const main = picked[0] ? byId.get(picked[0].serviceId) : undefined;
    const canAdd = multi && (main ? main.bookingMode === "individual" : true);
    if (picked.length === 0 || !canAdd) {
      if (picked.length > 0 && singleReason) setNudge(singleReason);
      onChange([{ serviceId: s.id, variantId: null }]);
      if (!multi) setOpen(false);
      return;
    }
    if (s.bookingMode !== "individual") {
      setNudge(`${s.name} is booked on its own, so it replaced the other services.`);
      onChange([{ serviceId: s.id, variantId: null }]);
      return;
    }
    onChange([...picked, { serviceId: s.id, variantId: null }]);
  };

  const setVariant = (serviceId: string, variantId: string | null) =>
    onChange(picked.map((p) => (p.serviceId === serviceId ? { ...p, variantId } : p)));

  const needle = search.trim().toLowerCase();
  const matches = needle
    ? services.filter((s) =>
        [s.name, s.category ?? "", s.description ?? ""].some((text) =>
          text.toLowerCase().includes(needle),
        ),
      )
    : services;
  const grouped = hasCategories(services);

  const total = picked.reduce((sum, p) => {
    const s = byId.get(p.serviceId)!;
    const v = p.variantId ? s.variants.find((x) => x.id === p.variantId) : undefined;
    return sum + (v?.priceMinor ?? s.basePriceMinor);
  }, 0);
  const minutes = picked.reduce((sum, p) => {
    const s = byId.get(p.serviceId)!;
    const v = p.variantId ? s.variants.find((x) => x.id === p.variantId) : undefined;
    return sum + (v?.durationMinutes ?? s.durationMinutes);
  }, 0);
  const currency = picked[0] ? byId.get(picked[0].serviceId)!.currency : "GBP";

  const triggerText =
    picked.length === 0
      ? multi
        ? "Choose services"
        : "Choose a service"
      : picked.length === 1
        ? byId.get(picked[0].serviceId)!.name
        : `${byId.get(picked[0].serviceId)!.name} + ${picked.length - 1} more`;

  return (
    <div className="grid gap-2">
      {/* `modal` so the list gets its own scroll-lock shard: without it the hosting
          Dialog's lock swallows touch scrolling in the portalled popover on iOS. */}
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
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", picked.length === 0 && "text-muted-foreground")}>
              {triggerText}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search services…" value={search} onValueChange={setSearch} />
            <CommandList>
              {matches.length === 0 ? (
                <CommandEmpty>No services match.</CommandEmpty>
              ) : (
                groupByCategory(matches).map((group) => (
                  <CommandGroup
                    key={group.category ?? "__none"}
                    heading={grouped ? (group.category ?? "Other") : undefined}
                  >
                    {group.items.map((s) => {
                      const on = isPicked(s.id);
                      return (
                        <CommandItem
                          key={s.id}
                          value={s.id}
                          onSelect={() => toggle(s)}
                          aria-checked={on}
                          role="option"
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                              on ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                            )}
                            aria-hidden
                          >
                            {on ? <Check className="size-3" /> : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{s.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[
                                formatDuration(s.durationMinutes),
                                formatMoney(s.basePriceMinor, s.currency),
                                grouped ? null : s.category,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))
              )}
            </CommandList>
            {multi ? (
              <div className="flex items-center justify-between border-t px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {picked.length === 0
                    ? "Tick every service in this job."
                    : `${picked.length} picked · ${formatMoney(total, currency)}`}
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>

      {picked.length > 0 ? (
        <ul className="grid gap-1.5" aria-label="Selected services">
          {picked.map((p, idx) => {
            const s = byId.get(p.serviceId)!;
            const v = p.variantId ? s.variants.find((x) => x.id === p.variantId) : undefined;
            return (
              <li
                key={p.serviceId}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                {idx === 0 && picked.length > 1 ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Main
                  </Badge>
                ) : null}
                {s.variants.length > 0 ? (
                  <Select
                    value={p.variantId ?? "none"}
                    onValueChange={(next) => setVariant(s.id, next === "none" ? null : next)}
                  >
                    {/* On a phone the variant drops to its own full-width line under the
                        name/price/remove row; beside them it left the name a few letters. */}
                    <SelectTrigger
                      className="order-last h-8 basis-full sm:order-none sm:w-40 sm:basis-auto"
                      aria-label={`${s.name} variant`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      {s.variants.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {[
                            x.name,
                            x.durationMinutes != null ? formatDuration(x.durationMinutes) : null,
                            x.priceMinor != null ? formatMoney(x.priceMinor, s.currency) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney(v?.priceMinor ?? s.basePriceMinor, s.currency)}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  aria-label={`Remove ${s.name}`}
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {nudge || picked.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          {nudge ??
            `${picked.length} services · ${formatMoney(total, currency)} · ${formatDuration(minutes)}. Booked back to back; the server confirms the final price and end time.`}
        </p>
      ) : null}
    </div>
  );
}
