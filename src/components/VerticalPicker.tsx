import { Car, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERTICAL_LIST, type VerticalKey } from "@/lib/verticals";

const ICONS: Record<VerticalKey, typeof Car> = {
  personal_training: Dumbbell,
  car_detailing: Car,
};

/** Two-up selector for the product vertical, used on signup and first-business onboarding. */
export function VerticalPicker({
  value,
  onChange,
  disabled,
}: {
  value: VerticalKey;
  onChange: (v: VerticalKey) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {VERTICAL_LIST.map((v) => {
        const Icon = ICONS[v.key];
        const active = v.key === value;
        return (
          <button
            key={v.key}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(v.key)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-60",
              active
                ? "border-primary bg-primary-soft ring-1 ring-primary"
                : "border-border hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-semibold">{v.label}</span>
            </span>
            <span className="mt-1.5 block text-xs text-muted-foreground">{v.tagline}</span>
          </button>
        );
      })}
    </div>
  );
}
