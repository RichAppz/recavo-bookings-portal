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

export interface DeleteOrFallbackCopy {
  title: string;
  description: string;
  /** Shown after a 409 — explains why deleting isn't possible. */
  inUseTitle: string;
  inUseDescription: string;
  /** Button label for the non-destructive alternative, e.g. "Pause" or "Archive". */
  fallbackLabel: string;
}

/**
 * "Delete, or fall back when it's in use" confirmation. Tries the hard delete first;
 * when the API answers 409 (the item has history the business must keep — bookings
 * against a service, sales of a package) the dialog flips its copy and offers the
 * non-destructive alternative instead (pause / archive) rather than dead-ending.
 *
 * Open while `item` is non-null. The last item is held internally so the copy
 * doesn't jump while the dialog animates closed.
 */
export function DeleteOrFallbackDialog<T>({
  item,
  onClose,
  copy,
  onDelete,
  onFallback,
}: {
  item: T | null;
  onClose: () => void;
  copy: (item: T) => DeleteOrFallbackCopy;
  /** Performs the delete; should throw `ApiError` (409) when the item is in use. */
  onDelete: (item: T) => Promise<void>;
  /** Performs the fallback (already toasts its own errors). */
  onFallback: (item: T) => Promise<void>;
}) {
  const open = item !== null;
  const [held, setHeld] = useState<T | null>(item);
  const [inUse, setInUse] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item !== null) {
      setHeld(item);
      setInUse(false);
    }
  }, [item]);

  const confirm = async () => {
    if (held === null) return;
    setBusy(true);
    try {
      if (inUse) {
        try {
          await onFallback(held);
          onClose();
        } catch {
          // The fallback mutation toasts its own error.
        }
        return;
      }
      try {
        await onDelete(held);
        onClose();
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

  const text = held === null ? null : copy(held);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{inUse ? text?.inUseTitle : text?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {inUse ? text?.inUseDescription : text?.description}
          </AlertDialogDescription>
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
            {busy ? "Working…" : inUse ? text?.fallbackLabel : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
