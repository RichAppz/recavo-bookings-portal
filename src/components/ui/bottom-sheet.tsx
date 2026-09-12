"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { cn } from "@/lib/utils";

/**
 * A phone-sized picker surface: slides up from the bottom, full width, capped at the
 * visible height. Built on Radix Dialog so it stacks correctly inside another dialog
 * (Esc and outside taps close only the sheet, not the form under it).
 */
const BottomSheet = DialogPrimitive.Root;

const BottomSheetTitle = DialogPrimitive.Title;

/**
 * The panel. Children are laid out as a column, so give the scrolling part
 * `min-h-0 flex-1 overflow-y-auto` and anything above or below it stays put.
 *
 * The outer box follows the *visual* viewport rather than `inset-0`: when the iOS
 * keyboard opens for the search field the visible area shrinks but fixed positioning
 * does not, and a plain `bottom-0` panel would slide behind the keys.
 */
const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const viewport = useVisualViewport();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <div
        data-bottom-sheet-viewport=""
        // Taps in the gap above the panel fall through to the overlay and dismiss.
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex h-dvh flex-col justify-end pt-10"
        style={viewport ? { top: viewport.offsetTop, height: viewport.height } : undefined}
      >
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            className,
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
});
BottomSheetContent.displayName = "BottomSheetContent";

export { BottomSheet, BottomSheetContent, BottomSheetTitle };
