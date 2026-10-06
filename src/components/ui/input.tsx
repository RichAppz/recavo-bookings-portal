import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Phones get the 44pt iOS row height; the 16px text is already there so
          // Safari doesn't zoom the field on focus. Horizontal padding is left
          // unprefixed on purpose: callers set `pl-9`/`pr-9` to clear a leading
          // icon or suffix, and a `max-sm:` padding here would outrank that.
          "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 max-sm:h-11 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
