import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ServicesChecklist, WorksAtChecklist } from "@/components/team/Checklists";
import { EditProfileDrawer } from "@/components/team/EditProfileDrawer";
import { RemoveFromTeamDialog } from "@/components/team/RemoveFromTeamDialog";
import { ChangeRoleDialog } from "@/components/team/Roles";
import { StaffHoursEditor } from "@/components/team/StaffHoursEditor";
import { TimeAwayDrawer } from "@/components/team/TimeAwayDrawer";
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
import { useAuth } from "@/lib/auth/auth-store";
import { describeApiError } from "@/lib/api/errors";
import type { CatalogueService, Location, Staff } from "@/lib/api/types";
import type { TeamPerson } from "@/lib/api/team";
import { useRemoveSignIn, useRestoreSignIn } from "@/lib/api/team";
import type { WorkingRule } from "@/lib/team";
import { firstName, primaryRole, takesBookings } from "@/lib/team";
import { useTenant } from "@/lib/tenant/tenant-context";
import type { PanelActions } from "@/components/team/PersonPanel";

export type TeamDialogState = {
  edit?: Staff;
  hours?: { staff: Staff; initial?: WorkingRule[] | null; suggest?: boolean };
  services?: Staff;
  worksAt?: Staff;
  away?: { person: Staff | null };
  remove?: TeamPerson;
  role?: TeamPerson;
  dropSignIn?: TeamPerson;
};

export function useTeamDialogs() {
  const [state, setState] = useState<TeamDialogState>({});
  const open = (patch: TeamDialogState) => setState((s) => ({ ...s, ...patch }));
  const close = (key: keyof TeamDialogState) =>
    setState((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
  return { state, open, close };
}

export type TeamDialogs = ReturnType<typeof useTeamDialogs>;

/** The panel's actions, all routed to the shared drawers below. */
export function panelActionsFor(
  dialogs: TeamDialogs,
  extra: { onClose: () => void; onRestore: (p: TeamPerson) => void },
): PanelActions {
  return {
    onClose: extra.onClose,
    onRestore: extra.onRestore,
    onEditProfile: (s) => dialogs.open({ edit: s }),
    onAddTimeAway: (s) => dialogs.open({ away: { person: s } }),
    onHours: (s, initial) => dialogs.open({ hours: { staff: s, initial: initial ?? null } }),
    onServices: (s) => dialogs.open({ services: s }),
    onWorksAt: (s) => dialogs.open({ worksAt: s }),
    onChangeRole: (p) => dialogs.open({ role: p }),
    onRemoveSignIn: (p) => dialogs.open({ dropSignIn: p }),
    onRemove: (p) => dialogs.open({ remove: p }),
  };
}

/**
 * Every drawer and confirm the Team page and the Solo view open. Each one reads
 * the latest copy of the person from the team list so a save never sends a stale
 * version.
 */
export function TeamDialogsHost({
  dialogs,
  people,
  services,
  locations,
  onRemoved,
}: {
  dialogs: TeamDialogs;
  people: TeamPerson[];
  services: CatalogueService[];
  locations: Location[];
  onRemoved?: (staff: Staff) => void;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const me = useAuth().user;
  const { state, close } = dialogs;
  const fresh = (s: Staff): Staff => people.find((p) => p.staff.id === s.id)?.staff ?? s;
  const serviceWord = tenant.terminology.service.replace(/\s+type$/i, "");
  const removeSignIn = useRemoveSignIn();
  const restoreSignIn = useRestoreSignIn();
  const awayPeople = people.map((p) => p.staff).filter(takesBookings);

  const dropping = state.dropSignIn;
  const dropFirst = dropping ? firstName(dropping.staff.displayName) : "";

  return (
    <>
      {state.edit ? (
        <EditProfileDrawer
          open
          onOpenChange={(o) => (o ? undefined : close("edit"))}
          person={fresh(state.edit)}
        />
      ) : null}

      {state.hours ? (
        <StaffHoursEditor
          open
          onOpenChange={(o) => (o ? undefined : close("hours"))}
          person={fresh(state.hours.staff)}
          locations={locations}
          initialRules={state.hours.initial ?? null}
          suggestSameAs={state.hours.suggest ?? false}
        />
      ) : null}

      {state.services ? (
        <ServicesChecklist
          open
          onOpenChange={(o) => (o ? undefined : close("services"))}
          person={fresh(state.services)}
          services={services}
          serviceWord={serviceWord}
        />
      ) : null}

      {state.worksAt ? (
        <WorksAtChecklist
          open
          onOpenChange={(o) => (o ? undefined : close("worksAt"))}
          person={fresh(state.worksAt)}
          locations={locations}
        />
      ) : null}

      <TimeAwayDrawer
        open={Boolean(state.away)}
        onOpenChange={(o) => (o ? undefined : close("away"))}
        people={awayPeople}
        person={state.away?.person ? fresh(state.away.person) : null}
        locations={locations}
      />

      <RemoveFromTeamDialog
        person={state.remove ? fresh(state.remove.staff) : null}
        isOwner={state.remove?.isOwner ?? false}
        onOpenChange={(o) => (o ? undefined : close("remove"))}
        onRemoved={(s) => onRemoved?.(s)}
        onSortFirst={(s) => {
          close("remove");
          void navigate({ to: "/bookings", search: { staff: s.id } });
        }}
      />

      {state.role?.signIn ? (
        <ChangeRoleDialog
          open
          onOpenChange={(o) => (o ? undefined : close("role"))}
          name={firstName(state.role.staff.displayName)}
          membershipId={state.role.signIn.membershipId}
          current={primaryRole(state.role.signIn.roleKeys)}
          isMe={Boolean(me && state.role.signIn.userId === me.id)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(dropping)}
        onOpenChange={(o) => (o ? undefined : close("dropSignIn"))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {dropFirst}'s sign-in?</AlertDialogTitle>
            <AlertDialogDescription>
              {dropFirst} won't be able to sign in. Their diary and{" "}
              {tenant.terminology.booking.toLowerCase()}s stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!dropping) return;
                const staffId = dropping.staff.id;
                removeSignIn.mutate(staffId, {
                  onSuccess: () =>
                    toast.success(`${dropFirst} can no longer sign in`, {
                      action: {
                        label: "Undo",
                        onClick: () =>
                          restoreSignIn.mutate(staffId, {
                            onError: (err) =>
                              toast.error(
                                describeApiError(err, "Couldn't bring the sign-in back."),
                              ),
                          }),
                      },
                    }),
                  onError: (err) =>
                    toast.error(describeApiError(err, "Couldn't remove the sign-in.")),
                });
              }}
            >
              Remove sign-in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
