import { useEffect, useRef, useState } from "react";
import { Check, Minus, Package, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { Consumable } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  formatQuantity,
  parseQuantity,
  quantityLabel,
  stepQuantity,
  unitCostLabel,
} from "@/lib/consumables";

export function ItemTile({ size = 34 }: { size?: 34 | 44 }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[10px] bg-secondary text-muted-foreground"
    >
      <Package className={size === 44 ? "size-5" : "size-4"} />
    </span>
  );
}

/**
 * − value +. The value is a spinbutton that reads "2 pads"; tapping it lets staff
 * type ("1,5" and "0.5" both work). − below the smallest step calls `onRemove`.
 */
export function Stepper({
  value,
  unit,
  name,
  onChange,
  onRemove,
  size = "desk",
}: {
  value: number;
  unit: string;
  name: string;
  onChange: (next: number) => void;
  onRemove: () => void;
  size?: "desk" | "phone";
}) {
  const [text, setText] = useState(formatQuantity(value));
  const [editing, setEditing] = useState(false);
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (!editing) setText(formatQuantity(value));
  }, [value, editing]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setAnnounce(`${quantityLabel(value, unit)} ${name}`);
  }, [value, unit, name]);

  const step = (direction: 1 | -1) => {
    const next = stepQuantity(value, unit, direction);
    if (next === null) onRemove();
    else onChange(next);
  };
  const commit = () => {
    setEditing(false);
    const parsed = parseQuantity(text);
    if (parsed === null) setText(formatQuantity(value));
    else if (parsed !== value) onChange(parsed);
  };

  const phone = size === "phone";
  const buttonClass = cn(
    "flex shrink-0 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10",
    phone ? "w-11" : "w-[30px]",
  );
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-stretch overflow-hidden rounded-[10px] border bg-background",
        phone ? "h-11" : "h-[34px]",
      )}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={() => step(-1)}
        aria-label={`Fewer ${name}`}
      >
        <Minus className="size-4" />
      </button>
      <input
        role="spinbutton"
        inputMode="decimal"
        aria-label={`${name} quantity`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuetext={quantityLabel(value, unit)}
        value={text}
        onFocus={(e) => {
          setEditing(true);
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "ArrowUp") {
            e.preventDefault();
            step(1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            step(-1);
          }
        }}
        className={cn(
          "w-12 min-w-0 border-x bg-transparent text-center font-extrabold tabular-nums outline-none focus:bg-secondary/60",
          phone ? "text-base" : "text-base sm:text-sm",
        )}
      />
      <button
        type="button"
        className={buttonClass}
        onClick={() => step(1)}
        aria-label={`More ${name}`}
      >
        <Plus className="size-4" />
      </button>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </span>
  );
}

/**
 * "+ Add consumable": a searchable list of active items. Items already on the list
 * are ticked and can't be picked again; the last row opens Add for a new one.
 */
export function ConsumablePicker({
  catalogue,
  selectedIds,
  onPick,
  onNew,
  label = "Add consumable",
  triggerClassName,
}: {
  catalogue: readonly Consumable[];
  selectedIds: ReadonlySet<string>;
  onPick: (c: Consumable) => void;
  /** Absent when the viewer can't add to the catalogue. */
  onNew?: () => void;
  label?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const active = catalogue
    .filter((c) => c.status === "active")
    .filter(
      (c) => !needle || [c.name, c.sku ?? "", c.unit].some((v) => v.toLowerCase().includes(needle)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

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
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-9", triggerClassName)}
          aria-expanded={open}
        >
          <Plus className="size-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(340px,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search your list" value={search} onValueChange={setSearch} />
          <CommandList>
            {active.length === 0 && !onNew ? <CommandEmpty>Nothing matches.</CommandEmpty> : null}
            <CommandGroup>
              {active.map((c) => {
                const taken = selectedIds.has(c.id);
                return (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    disabled={taken}
                    aria-disabled={taken}
                    onSelect={() => {
                      if (taken) return;
                      onPick(c);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="min-h-11"
                  >
                    <Check
                      className={cn("size-4 shrink-0", taken ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-semibold">
                        {c.name}
                        {taken ? <span className="sr-only"> (already added)</span> : null}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {unitCostLabel(c.unitCostMinor, c.unit, c.currency)}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
              {onNew ? (
                <CommandItem
                  value="__new"
                  onSelect={() => {
                    setOpen(false);
                    setSearch("");
                    onNew();
                  }}
                  className="min-h-11 font-semibold text-primary"
                >
                  <Plus className="size-4" /> New consumable
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
