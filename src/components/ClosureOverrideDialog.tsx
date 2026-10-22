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

/**
 * Asks before booking into a closure ("Unit 4 is closed for Christmas."). Confirming
 * re-sends the same request with `closureOverride: true` under a fresh
 * Idempotency-Key; cancelling leaves the form as it was.
 */
export function ClosureOverrideDialog({
  message,
  onOpenChange,
  busy,
  confirmLabel = "Book anyway",
  onConfirm,
}: {
  /** The API's sentence; null keeps the dialog closed. */
  message: string | null;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={message !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Closed at this time</AlertDialogTitle>
          <AlertDialogDescription>
            {message} Clients can't book then, but you can.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Pick another time</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={busy}>
            {busy ? "Booking…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
