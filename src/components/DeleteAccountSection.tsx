import { useState, type ReactElement } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui-bits";
import { toastApiError } from "@/lib/api";
import { useAccountDeletionPreview, useDeleteAccount } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/auth-store";
import { useIsNativeApp } from "@/hooks/use-native-app";

const CONFIRM_WORD = "DELETE";

/**
 * Self-serve account deletion, reachable from Settings › Account on every surface.
 * App Store guideline 5.1.1(v) requires it in-app once the app offers sign-up; the
 * confirmation spells out exactly what goes (businesses nobody else owns are
 * closed) and what does not (an App Store subscription only Apple can cancel).
 */
export function DeleteAccountSection() {
  return (
    <SectionCard
      title="Delete account"
      description="Permanently remove your RECAVO account and personal data."
      className="border-destructive/30"
    >
      <p className="text-sm text-muted-foreground">
        Deleting your account signs you out everywhere, removes your name, email and phone number
        from RECAVO, and closes any business that nobody else owns. Closed businesses keep their
        records for a 30-day export window, then they’re anonymised. This can’t be undone.
      </p>
      <DeleteAccountDialog
        trigger={
          <Button variant="destructive" className="mt-4">
            Delete my account…
          </Button>
        }
      />
    </SectionCard>
  );
}

/**
 * The confirmation itself, with a caller-supplied trigger so it can live wherever a
 * signed-in user might be stuck: Settings › Account, the locked billing page (no
 * subscription yet — no Settings route to get to) and the create-first-business
 * screen. A reviewer who signs up and never subscribes must still be able to delete.
 */
export function DeleteAccountDialog({ trigger }: { trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const preview = useAccountDeletionPreview(open);
  const deleteAccount = useDeleteAccount();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const native = useIsNativeApp();

  const closing = preview.data?.closingBusinesses ?? [];
  const leaving = preview.data?.leavingBusinessIds ?? [];
  const appleBilled = closing.filter((b) => b.appleSubscription);
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;
  const busy = deleteAccount.isPending;

  const onConfirm = async () => {
    try {
      await deleteAccount.mutateAsync();
    } catch (err) {
      toastApiError(err);
      return;
    }
    setOpen(false);
    // The server has already revoked the session and cleared the cookie; this just
    // tears down local state (a rejected Supabase sign-out for a gone user is fine).
    await signOut();
    toast.success("Your account has been deleted.");
    void navigate({ to: "/login" });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {preview.isPending ? (
                <p>Checking what this will affect…</p>
              ) : preview.isError ? (
                <p>We couldn’t check your businesses. Close this and try again.</p>
              ) : (
                <>
                  {closing.length > 0 ? (
                    <div>
                      <p className="font-medium text-foreground">
                        {closing.length === 1
                          ? "This business will be closed, because you’re its only owner:"
                          : "These businesses will be closed, because you’re their only owner:"}
                      </p>
                      <ul className="mt-1 list-disc pl-5">
                        {closing.map((b) => (
                          <li key={b.id}>{b.name}</li>
                        ))}
                      </ul>
                      <p className="mt-1">
                        Bookings, clients and invoices stay available for export for 30 days, then
                        they’re anonymised. Any web subscription is cancelled at the end of its
                        current period.
                      </p>
                    </div>
                  ) : null}
                  {leaving.length > 0 ? (
                    <p>
                      You’ll be removed from{" "}
                      {leaving.length === 1
                        ? "one other business"
                        : `${leaving.length} other businesses`}
                      ; they carry on without you.
                    </p>
                  ) : null}
                  {appleBilled.length > 0 ? (
                    <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                      {appleBilled.length === 1
                        ? `${appleBilled[0].name} is billed through your Apple ID.`
                        : "Some of these businesses are billed through your Apple ID."}{" "}
                      Deleting your account does <strong>not</strong> cancel an App Store
                      subscription — cancel it in{" "}
                      {native
                        ? "Settings › Apple ID › Subscriptions"
                        : "iOS Settings › Apple ID › Subscriptions"}{" "}
                      or you will keep being charged.
                    </p>
                  ) : null}
                  <p>
                    Your sign-in, name, email and phone number are deleted immediately. This can’t
                    be undone.
                  </p>
                </>
              )}
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="delete-account-confirm" className="text-foreground">
                  Type <span className="font-mono">{CONFIRM_WORD}</span> to confirm
                </Label>
                <Input
                  id="delete-account-confirm"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  disabled={busy || preview.isPending || preview.isError}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep my account</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!confirmed || busy || preview.isPending || preview.isError}
            onClick={onConfirm}
          >
            {busy ? "Deleting…" : "Delete account"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
