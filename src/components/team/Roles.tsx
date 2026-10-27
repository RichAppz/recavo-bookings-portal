import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { RadioList } from "@/components/team/parts";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import { useUpdateMembership } from "@/lib/api/hooks";
import { roleLabel } from "@/lib/permissions";
import { COMPARE_AREAS, ROLE_LINE, ROLE_ORDER, roleAccess, roleRank } from "@/lib/team";
import { cn } from "@/lib/utils";

/** The role radio list (least to most access), with the compare link under it. */
export function RoleRadioList({
  value,
  onChange,
  label = "What they can do",
}: {
  value: string;
  onChange: (role: string) => void;
  label?: string;
}) {
  const [comparing, setComparing] = useState(false);
  return (
    <div className="grid gap-2">
      <RadioList
        label={label}
        value={value}
        onChange={onChange}
        options={ROLE_ORDER.map((r) => ({ value: r, title: roleLabel(r), help: ROLE_LINE[r] }))}
      />
      <button
        type="button"
        onClick={() => setComparing(true)}
        className="inline-flex w-fit cursor-pointer items-center text-[13px] font-semibold text-primary hover:underline"
      >
        Compare what each role can do <ChevronRight className="size-3.5" aria-hidden />
      </button>
      <RoleCompareSheet open={comparing} onOpenChange={setComparing} />
    </div>
  );
}

/** Roles against areas, each cell Own, All, View or ·. */
export function RoleCompareSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const phone = useIsPhone();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-sheet-peek rounded-t-3xl" : "sm:max-w-[640px]",
        )}
      >
        <SheetHeader className="border-b px-4 pt-6 pb-4 text-left sm:px-6">
          <SheetTitle className="text-xl font-extrabold">What each role can do</SheetTitle>
          <SheetDescription>
            Own means their own jobs only. View means they can see it but not change it.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="py-2 pr-3 text-left font-bold">
                  Role
                </th>
                {COMPARE_AREAS.map((a) => (
                  <th key={a} scope="col" className="px-1.5 py-2 text-center text-xs font-bold">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_ORDER.map((r) => {
                const access = roleAccess(r);
                return (
                  <tr key={r} className="border-t">
                    <th scope="row" className="py-2.5 pr-3 text-left font-semibold">
                      {roleLabel(r)}
                    </th>
                    {COMPARE_AREAS.map((a) => (
                      <td
                        key={a}
                        className={cn(
                          "px-1.5 py-2.5 text-center text-xs",
                          access[a] === "·" ? "text-muted-foreground" : "font-bold",
                        )}
                      >
                        {access[a]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Change a signed-in person's role. Downgrading yourself asks first. */
export function ChangeRoleDialog({
  open,
  onOpenChange,
  name,
  membershipId,
  current,
  isMe,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  membershipId: string;
  current: string;
  isMe: boolean;
  onChanged?: () => void;
}) {
  const update = useUpdateMembership();
  const [role, setRole] = useState(current);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) setRole(current);
  }, [open, current]);

  const apply = async () => {
    try {
      await update.mutateAsync({ membershipId, body: { roleKeys: [role] } });
      toast.success(`${name} is now ${roleLabel(role)}`);
      onChanged?.();
      onOpenChange(false);
    } catch {
      // useUpdateMembership toasts the API error.
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change {name}'s role</DialogTitle>
            <DialogDescription>Currently {roleLabel(current)}.</DialogDescription>
          </DialogHeader>
          <RoleRadioList value={role} onChange={setRole} label="Role" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={role === current || update.isPending}
              onClick={() => {
                if (isMe && roleRank(role) < roleRank(current)) setConfirming(true);
                else void apply();
              }}
            >
              {update.isPending ? "Saving…" : "Change role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lower your own access?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be {roleLabel(role)}: {ROLE_LINE[role]?.toLowerCase()}. Someone else will have
              to change it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my role</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                void apply();
              }}
            >
              Change my role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
