import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiError, toastApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * "Delete, or fall back when it's in use" confirmation. Tries the hard delete first;
 * when the API answers 409 (the item has history the business must keep — bookings
 * against a service, sales of a package) the dialog flips its copy and offers the
 * non-destructive alternative instead (pause / archive) rather than dead-ending.
 */
export function DeleteOrFallbackDialog({
  open,
  onOpenChange,
  title,
  description,
  inUseTitle,
  inUseDescription,
  fallbackLabel,
  onDelete,
  onFallback,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  /** Shown after a 409 — explains why deleting isn't possible. */
  inUseTitle: string;
  inUseDescription: string;
  /** Button label for the non-destructive alternative, e.g. "Pause" or "Archive". */
  fallbackLabel: string;
  /** Performs the delete; should throw `ApiError` (409) when the item is in use. */
  onDelete: () => Promise<void>;
  /** Performs the fallback (already toasts its own errors). */
  onFallback: () => Promise<void>;
}) {
  const [inUse, setInUse] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setInUse(false);
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    try {
      if (inUse) {
        try {
          await onFallback();
          onOpenChange(false);
        } catch {
          // The fallback mutation toasts its own error.
        }
        return;
      }
      try {
        await onDelete();
        onOpenChange(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setInUse(true);
          return;
        }
        toastApiError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{inUse ? inUseTitle : title}</AlertDialogTitle>
          <AlertDialogDescription>{inUse ? inUseDescription : description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              // Keep the dialog open until the request settles (or the 409 flips the copy).
              e.preventDefault();
              void confirm();
            }}
            className={cn(
              !inUse && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {busy ? "Working…" : inUse ? fallbackLabel : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
