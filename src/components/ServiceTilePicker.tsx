import { useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

/** Above this many services a find box appears so a long menu stays tappable. */
const SEARCH_THRESHOLD = 8;

/**
 * Tap-to-add service picker for the Add booking form. Every service in the
 * catalogue is a tile; tapping adds it to the job, tapping again takes it off. The
 * first one tapped is the main service (it sets the slot search and the record
 * rule); the rest ride along as additional services. Variants are chosen on the
 * selected rows underneath, so the tiles themselves stay one tap.
 */
export function ServiceTilePicker({
  services,
  value,
  onChange,
  multi,
  singleReason,
}: {
  services: CatalogueService[];
  value: PickedService[];
  onChange: (next: PickedService[]) => void;
  /** False when only one service may be booked (group sessions, paying by credit). */
  multi: boolean;
  /** Why only one can be picked, shown when someone taps a second. */
  singleReason?: string;
}) {
  const [query, setQuery] = useState("");
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
    // A second service can only join an individual job; otherwise the tap swaps.
    const main = picked[0] ? byId.get(picked[0].serviceId) : undefined;
    const canAdd = multi && (main ? main.bookingMode === "individual" : true);
    if (picked.length === 0 || !canAdd) {
      if (picked.length > 0 && singleReason) setNudge(singleReason);
      onChange([{ serviceId: s.id, variantId: null }]);
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

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? services.filter((s) =>
        [s.name, s.category ?? ""].some((text) => text.toLowerCase().includes(needle)),
      )
    : services;
  const grouped = hasCategories(services);

  const priceTag = (s: CatalogueService) => {
    const prices = [s.basePriceMinor, ...s.variants.map((v) => v.priceMinor ?? s.basePriceMinor)];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max
      ? formatMoney(min, s.currency)
      : `from ${formatMoney(min, s.currency, { compact: true })}`;
  };

  const tile = (s: CatalogueService) => {
    const on = isPicked(s.id);
    return (
      <button
        key={s.id}
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => toggle(s)}
        className={cn(
          "inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
          on
            ? "border-primary bg-primary/10 text-foreground"
            : "bg-card text-foreground hover:bg-secondary",
        )}
      >
        {on ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
        <span className="min-w-0 truncate">{s.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{priceTag(s)}</span>
      </button>
    );
  };

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

  return (
    <div className="grid gap-2">
      {services.length > SEARCH_THRESHOLD ? (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a service"
            aria-label="Find a service"
            className="h-9 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      ) : null}

      <div className="max-h-56 overflow-y-auto rounded-lg border p-2">
        {visible.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">No services match.</p>
        ) : grouped ? (
          groupByCategory(visible).map((group) => (
            <div key={group.category ?? "__none"} className="mb-2 last:mb-0">
              <p className="mb-1 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {group.category ?? "Other"}
              </p>
              <div className="flex flex-wrap gap-1.5">{group.items.map(tile)}</div>
            </div>
          ))
        ) : (
          <div className="flex flex-wrap gap-1.5">{visible.map(tile)}</div>
        )}
      </div>

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
                    <SelectTrigger className="h-8 w-40" aria-label={`${s.name} variant`}>
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

      <p className="text-xs text-muted-foreground">
        {nudge ??
          (picked.length === 0
            ? multi
              ? "Tap every service that's part of this job. The first one is the main service."
              : "Tap a service."
            : picked.length === 1
              ? multi
                ? "Tap more to add them to the same job."
                : `${formatMoney(total, currency)} · ${formatDuration(minutes)}`
              : `${picked.length} services · ${formatMoney(total, currency)} · ${formatDuration(minutes)}. Booked back to back; the server confirms the final price and end time.`)}
      </p>
    </div>
  );
}
