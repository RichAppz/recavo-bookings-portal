import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_PREFS,
  moveItem,
  moveTo,
  type OverviewCard,
  type OverviewPrefs,
  type QuickActionKey,
} from "@/lib/overview";
import { cn } from "@/lib/utils";
import { quickActionLabel } from "./QuickActionsCard";

function SortableList<T extends string>({
  title,
  items,
  hidden,
  label,
  onOrder,
  onHidden,
}: {
  title: string;
  items: T[];
  hidden: T[];
  label: (key: T) => string;
  onOrder: (next: T[]) => void;
  onHidden: (next: T[]) => void;
}) {
  const [dragging, setDragging] = useState<T | null>(null);
  return (
    <section className="px-5 py-3">
      <h3 className="pb-2 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="overflow-hidden rounded-xl border border-border">
        {items.map((key, i) => {
          const shown = !hidden.includes(key);
          const name = label(key);
          return (
            <li
              key={key}
              draggable
              onDragStart={() => setDragging(key)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragging && dragging !== key) onOrder(moveTo(items, dragging, key));
              }}
              onDragEnd={() => setDragging(null)}
              className={cn(
                "flex min-h-12 items-center gap-2 border-t border-border bg-card px-3 first:border-t-0",
                dragging === key && "opacity-60",
              )}
            >
              <GripVertical
                aria-hidden
                className="size-4 shrink-0 cursor-grab text-muted-foreground"
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm font-semibold",
                  !shown && "text-muted-foreground",
                )}
              >
                {name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Move ${name} up`}
                disabled={i === 0}
                onClick={() => onOrder(moveItem(items, key, "up"))}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Move ${name} down`}
                disabled={i === items.length - 1}
                onClick={() => onOrder(moveItem(items, key, "down"))}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Switch
                checked={shown}
                aria-label={shown ? `Hide ${name}` : `Show ${name}`}
                onCheckedChange={(on) =>
                  onHidden(on ? hidden.filter((k) => k !== key) : [...hidden, key])
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CustomiseSheet({
  open,
  onOpenChange,
  prefs,
  update,
  cardLabels,
  quickActions,
  bookingNoun,
  side,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: OverviewPrefs;
  update: (patch: Partial<OverviewPrefs>) => void;
  cardLabels: Record<OverviewCard, string>;
  /** The quick actions this business can use, in the person's order. */
  quickActions: QuickActionKey[];
  bookingNoun: string;
  side: "right" | "bottom";
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "flex flex-col gap-0 overflow-y-auto p-0",
          side === "bottom" ? "max-h-[92dvh] rounded-t-2xl" : "w-full sm:max-w-md",
        )}
      >
        <SheetHeader className="px-5 pt-5 pb-2 text-left">
          <SheetTitle>Customise Overview</SheetTitle>
          <SheetDescription>
            Choose what shows and in what order. Saved for you on this device.
          </SheetDescription>
        </SheetHeader>
        <SortableList
          title="Cards"
          items={prefs.order}
          hidden={prefs.hidden}
          label={(k) => cardLabels[k]}
          onOrder={(order) => update({ order, reordered: true })}
          onHidden={(hidden) => update({ hidden })}
        />
        <SortableList
          title="Quick actions"
          items={quickActions}
          hidden={prefs.quickHidden}
          label={(k) => quickActionLabel(k, bookingNoun)}
          onOrder={(quickOrder) =>
            update({
              quickOrder: [
                ...quickOrder,
                ...prefs.quickOrder.filter((k) => !quickOrder.includes(k)),
              ],
            })
          }
          onHidden={(quickHidden) => update({ quickHidden })}
        />
        <SheetFooter className="mt-auto flex-row justify-between border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            onClick={() =>
              update({
                order: DEFAULT_PREFS.order,
                hidden: [],
                quickOrder: DEFAULT_PREFS.quickOrder,
                quickHidden: [],
                reordered: false,
              })
            }
          >
            Reset
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
