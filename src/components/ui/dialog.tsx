"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { keepOpenForToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-foreground/25 sm:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const PHONE_QUERY = "(max-width: 639.98px)";

function subscribeToPhone(onChange: () => void) {
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Read straight from the window so a dialog open on first paint doesn't flash in sideways. */
function useIsPhoneDialog(): boolean {
  return React.useSyncExternalStore(
    subscribeToPhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/**
 * Dialogs render as a right-hand side drawer over the content. Phones get the iOS
 * sheet presentation instead: up from the bottom, stopping short of the top so the
 * page shows behind it, with a grab handle (the same as ui/sheet.tsx).
 * `overflow-x-hidden`: `overflow-y-auto` alone makes the x-axis `auto` too, so any
 * child wider than the sheet (a long word, an input row that can't shrink) turned
 * into a sideways scroll on phones. Popovers and selects are portalled, so nothing
 * legitimate is clipped. The vertical padding includes the safe-area insets so
 * the title clears the notch and the footer the home indicator in the mobile app
 * (`pt-safe-6`/`pb-safe-6` are plain `p-6` in a browser). A consumer that zeroes
 * the padding takes on that duty itself — see the staff dialog.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, ...props }, ref) => {
  const phone = useIsPhoneDialog();
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        onInteractOutside={(e) => {
          keepOpenForToast(e);
          onInteractOutside?.(e);
        }}
        className={cn(
          "no-scrollbar fixed z-50 flex w-full max-w-full flex-col gap-5 overflow-x-hidden overflow-y-auto bg-background px-safe-6 pb-safe-12 shadow-xl sm:pb-6 outline-none transition ease-in-out sm:max-w-md sm:rounded-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300",
          phone
            ? "inset-x-0 bottom-0 top-sheet-peek rounded-t-3xl border-t pt-6 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
            : "inset-y-0 right-0 h-full border-l pt-safe-6 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          className,
        )}
        {...props}
      >
        {phone ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-border"
          />
        ) : null}
        {children}
        {/* A finger-sized square (44px on phones, 36px with a pointer) around the
          glyph; the bare 16px icon it replaces was the only thing you could hit.
          On phones the glyph sits in a grey disc, the way iOS draws a sheet's
          close control, and the header drops below it (see DialogHeader). */}
        <DialogPrimitive.Close
          className={cn(
            "absolute right-safe-2 flex size-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors focus:outline-none focus-visible:bg-accent focus-visible:text-foreground disabled:pointer-events-none max-sm:active:opacity-70 sm:size-9 sm:hover:bg-accent sm:hover:text-foreground",
            phone ? "top-2" : "top-[calc(env(safe-area-inset-top,0px)+0.5rem)]",
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-foreground/70 sm:size-auto sm:rounded-none sm:bg-transparent sm:text-inherit">
            <X className="size-4.5 sm:size-4" />
          </span>
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * Phones get the iOS sheet layout: the close disc alone in the top row and a
 * large bold title underneath it, so the header clears the control with a
 * margin (not padding — consumers that zero the content padding set their own
 * safe-area padding on the header, and a margin stacks with it instead of
 * fighting it). With a pointer the title shares the row and leaves room on the
 * right for the close button.
 */
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col space-y-1.5 pr-8 text-left max-sm:mt-9 max-sm:space-y-2 max-sm:pr-0",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

/* Phones: actions stack full width at iOS button height, primary on top. */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mt-auto flex shrink-0 flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:space-x-2 sm:gap-0",
      "max-sm:[&>a]:h-12 max-sm:[&>a]:rounded-xl max-sm:[&>a]:text-base max-sm:[&>button]:h-12 max-sm:[&>button]:rounded-xl max-sm:[&>button]:text-base",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight max-sm:text-[28px] max-sm:font-bold max-sm:leading-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(
      "text-sm text-muted-foreground max-sm:text-[15px] max-sm:leading-snug",
      className,
    )}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
