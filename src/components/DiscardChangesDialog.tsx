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
 * The "are you sure?" that stands between a half-filled form and Esc, a tap on the
 * backdrop, or the close cross. Forms only raise it once something has been typed,
 * so an untouched drawer still closes in one go.
 */
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  what = "this form",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  /** Noun for the title, e.g. "this booking". */
  what?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard {what}?</AlertDialogTitle>
          <AlertDialogDescription>
            You've started filling this in. Closing it now loses what you've entered.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
