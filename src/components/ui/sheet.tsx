"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { keepOpenForToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "no-scrollbar fixed z-50 gap-4 bg-card p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        // Sheets touching the top/bottom screen edge reserve room for the notch
        // and home indicator in the mobile app via spacer pseudo-elements
        // (zero-height in a browser), so consumers' own padding is untouched.
        top: "inset-x-0 top-0 border-b px-safe safe-spacer-top data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t px-safe safe-spacer-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r pl-safe safe-spacer-top safe-spacer-bottom data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l pr-safe safe-spacer-top safe-spacer-bottom data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

const PHONE_QUERY = "(max-width: 639.98px)";

function subscribeToPhone(onChange: () => void) {
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Read straight from the window so a sheet open on first paint doesn't flash in sideways. */
function useIsPhoneSheet(): boolean {
  return React.useSyncExternalStore(
    subscribeToPhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

const FULL_HEIGHT = /(^|\s)(top-0|inset-0|h-full|h-dvh|h-screen|h-\[100dvh\])(\s|$)/;

interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * On phones a right-hand drawer is presented from the bottom, like an iOS sheet.
   * "side" keeps it sliding in from the right.
   */
  phonePresentation?: "sheet" | "side";
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      side: requestedSide = "right",
      phonePresentation = "sheet",
      className,
      children,
      onInteractOutside,
      ...props
    },
    ref,
  ) => {
    const phone = useIsPhoneSheet();
    const presented = phone && requestedSide === "right" && phonePresentation === "sheet";
    const side = presented ? "bottom" : requestedSide;
    // A bottom sheet stretched to the top of the screen sits under the status bar
    // unless it reserves the inset like the top/left/right sheets do.
    const touchesTop = !presented && (side !== "bottom" || FULL_HEIGHT.test(className ?? ""));
    return (
      <SheetPortal>
        <SheetOverlay />
        {/* data-sheet-side lets the toast host step clear of an open right-hand drawer (ui/sonner.tsx). */}
        <SheetPrimitive.Content
          ref={ref}
          data-sheet-side={side}
          onInteractOutside={(e) => {
            keepOpenForToast(e);
            onInteractOutside?.(e);
          }}
          className={cn(
            sheetVariants({ side }),
            side === "bottom" && touchesTop && "safe-spacer-top",
            side === "bottom" &&
              !touchesTop &&
              "max-h-[calc(100dvh-max(2.5rem,calc(env(safe-area-inset-top,0px)+0.75rem)))] overflow-y-auto",
            className,
            // After the consumer's classes so its desktop width and height give way.
            presented &&
              "top-sheet-peek h-auto max-h-none w-full max-w-none rounded-t-3xl border-x-0",
          )}
          {...props}
        >
          <SheetPrimitive.Close
            className={cn(
              "absolute right-safe-2 top-2 flex size-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors focus:outline-none focus-visible:bg-accent focus-visible:text-foreground disabled:pointer-events-none max-sm:active:opacity-70 sm:size-9 sm:hover:bg-accent sm:hover:text-foreground",
              touchesTop && "top-[calc(env(safe-area-inset-top,0px)+0.5rem)]",
            )}
          >
            {/* Same iOS-style grey disc as ui/dialog.tsx on phones. */}
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground/70 sm:size-auto sm:rounded-none sm:bg-transparent sm:text-inherit">
              <X className="size-5 sm:size-[18px]" />
            </span>
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
          {presented ? (
            <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
          ) : null}
          {children}
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
