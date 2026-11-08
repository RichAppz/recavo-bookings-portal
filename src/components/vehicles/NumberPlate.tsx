import { formatRegistration, plateAccessibleName } from "@/lib/vehicles";
import { cn } from "@/lib/utils";

const SIZES = {
  row: "h-[30px] w-[92px] justify-center text-[13.5px]",
  small: "h-6 px-2 text-xs",
  large: "h-10 px-3.5 text-[19px]",
} as const;

/**
 * A UK rear number plate: the car is the first thing you see. Same yellow in dark
 * mode (plates are real-world objects). Shown uppercase with the standard space.
 */
export function NumberPlate({
  registration,
  size = "row",
  className,
}: {
  registration: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={plateAccessibleName(registration)}
      className={cn(
        "inline-flex shrink-0 items-center overflow-hidden rounded-md border border-black/20 bg-[#f7d23e] font-display leading-none font-extrabold tracking-[0.04em] whitespace-nowrap text-[#111111]",
        SIZES[size],
        className,
      )}
    >
      <span className="truncate">{formatRegistration(registration)}</span>
    </span>
  );
}
