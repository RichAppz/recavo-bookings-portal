import { useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Spec §2.3 / §3.3 segmented control: `track` background, 3px padding, 11px radius;
 * the selected item has the panel fill, a 1px shadow and bold text. A tablist for
 * assistive tech, with arrow keys moving the selection like native tabs.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  fill = false,
}: {
  value: T;
  onValueChange: (next: T) => void;
  options: readonly { value: T; label: string; shortcut?: string }[];
  label: string;
  className?: string;
  /** Items share the width equally (phone view row). */
  fill?: boolean;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const move = (dir: 1 | -1) => {
    const idx = options.findIndex((o) => o.value === value);
    const next = options[(idx + dir + options.length) % options.length];
    if (!next) return;
    onValueChange(next.value);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex h-[38px] items-stretch gap-0.5 rounded-[11px] bg-secondary p-[3px]",
        fill && "flex w-full",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            data-value={o.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "cursor-pointer rounded-[8px] px-3 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              fill && "flex-1 px-1",
              selected
                ? "bg-card font-bold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
