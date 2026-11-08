import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  GroupedBlock,
  ReadOnlyNotice,
  SettingsEmptyState,
  SettingsPage,
  SettingsSection,
  StatusPill,
} from "@/components/settings/primitives";
import { PersonAvatar } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastApiError } from "@/lib/api/errors";
import {
  useInvitations,
  useInviteStaff,
  useMemberships,
  useUpdateMembership,
} from "@/lib/api/hooks";
import type { Membership, MembershipWithUser } from "@/lib/api/types";
import { userDisplayName } from "@/lib/api/types";
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  holdsBusinessOwnerRole,
  normalizeRoleKey,
  roleLabel,
  roleLabels,
} from "@/lib/permissions";
import { INVITE_ROLES, ROLE_DESCRIPTIONS } from "@/lib/settings-labels";
import { useAuth } from "@/lib/auth/auth-store";
import { useTenant } from "@/lib/tenant/tenant-context";

function membershipTone(status: Membership["status"]): "grey" | "mint" | "amber" | "red" {
  if (status === "active") return "mint";
  if (status === "invited") return "amber";
  return "red";
}

function membershipWord(status: Membership["status"]): string {
  if (status === "active") return "Active";
  if (status === "invited") return "Invited";
  return "Access removed";
}

/** Settings → Team (spec §6): members with role and description, a menu per row, invitations, invite. */
export function TeamPage() {
  const tenant = useTenant();
  const memberships = useMemberships();
  const invitations = useInvitations();
  const canManage = tenant.can(PERMISSIONS.TEAM_MANAGE_PERMISSIONS);
  const canInvite = tenant.can(PERMISSIONS.TEAM_INVITE);
  const members = memberships.data ?? [];
  const pending = invitations.data ?? [];

  return (
    <SettingsPage
      title="Team"
      description="Who can sign in to this business and what they can do."
      banner={
        <div className="grid gap-2">
          <p
            role="status"
            className="flex flex-wrap items-center gap-x-2 rounded-xl bg-primary/8 px-4 py-3 text-sm"
          >
            Team is now one page.
            <Link to="/team" className="font-semibold text-primary hover:underline">
              Open Team ›
            </Link>
          </p>
          {canManage || canInvite ? null : <ReadOnlyNotice />}
        </div>
      }
    >
      <SettingsSection
        id="team-members"
        title="Members"
        help="Everyone with access. Roles decide what each person can see and do; the owner's role is fixed."
      >
        {memberships.isLoading ? (
          <TableGhost rows={4} />
        ) : members.length === 0 ? (
          <SettingsEmptyState
            title="No members yet"
            description="Invite someone below to get started."
          />
        ) : (
          <GroupedBlock as="ul">
            {members.map((m) => (
              <MemberRow key={m.id} membership={m} canManage={canManage} />
            ))}
          </GroupedBlock>
        )}
      </SettingsSection>

      <SettingsSection
        id="team-invitations"
        title="Invitations"
        help="People you've invited who haven't accepted yet. Invitations expire on their own."
      >
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <GroupedBlock as="ul">
            {pending.map((inv) => (
              <li
                key={inv.id}
                className="flex min-h-11 items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{inv.email}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {roleLabels(inv.roleKeys, "No roles")} · expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <StatusPill tone={inv.status === "pending" ? "amber" : "grey"}>
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1).replace(/_/g, " ")}
                </StatusPill>
              </li>
            ))}
          </GroupedBlock>
        )}
      </SettingsSection>

      {canInvite ? <InviteSection /> : null}
    </SettingsPage>
  );
}

function MemberRow({
  membership: m,
  canManage,
}: {
  membership: MembershipWithUser;
  canManage: boolean;
}) {
  const updateMembership = useUpdateMembership();
  const me = useAuth().user;
  const [confirm, setConfirm] = useState<"remove" | null>(null);
  // The list embeds each account when it can; the signed-in person's own row can
  // always be named from the session.
  const account = m.user ?? (me && me.id === m.userId ? me : null);
  const name = userDisplayName(
    account,
    m.status === "invited" ? "Pending teammate" : "Team member",
  );
  const email = account?.email;
  const isOwner = holdsBusinessOwnerRole(m.roleKeys);
  const roleKey = m.roleKeys[0] ?? SYSTEM_ROLES.STAFF;
  const role = isOwner ? "Owner" : roleLabels(m.roleKeys, "No roles");
  const description = ROLE_DESCRIPTIONS[normalizeRoleKey(roleKey)];
  const suspended = m.status === "suspended";

  const setStatus = async (status: "active" | "suspended") => {
    try {
      await updateMembership.mutateAsync({ membershipId: m.id, body: { status } });
      toast.success(
        status === "suspended" ? `${name} no longer has access` : `${name} has access again`,
      );
    } catch (err) {
      toastApiError(err, "Couldn't update this member");
    }
  };

  return (
    <li className="flex min-h-11 items-center gap-3 px-4 py-3">
      <PersonAvatar name={name} size={36} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {email && name !== email ? (
            <span className="truncate text-[13px] text-muted-foreground">{email}</span>
          ) : null}
        </p>
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{role}</span>
          {description ? <> · {description}</> : null}
        </p>
      </div>
      <StatusPill tone={membershipTone(m.status)}>{membershipWord(m.status)}</StatusPill>
      {isOwner ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">Owner role is fixed</span>
      ) : canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={`Options for ${name}`}
              disabled={updateMembership.isPending}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Current: {role}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={normalizeRoleKey(roleKey)}
                  onValueChange={async (value) => {
                    if (value === normalizeRoleKey(roleKey)) return;
                    try {
                      await updateMembership.mutateAsync({
                        membershipId: m.id,
                        body: { roleKeys: [value] },
                      });
                      toast.success(`${name} is now ${roleLabel(value)}`);
                    } catch (err) {
                      toastApiError(err, "Couldn't change the role");
                    }
                  }}
                >
                  {INVITE_ROLES.map((r) => (
                    <DropdownMenuRadioItem key={r} value={r} className="flex-col items-start gap-0">
                      <span>{roleLabel(r)}</span>
                      <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            {suspended ? (
              <DropdownMenuItem onSelect={() => void setStatus("active")}>
                Restore access
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirm("remove")}
              >
                Remove access
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <AlertDialog open={confirm === "remove"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}'s access?</AlertDialogTitle>
            <AlertDialogDescription>
              They won't be able to sign in to this business. Their bookings and history stay, and
              you can restore access from this menu at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep access</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirm(null);
                void setStatus("suspended");
              }}
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function InviteSection() {
  const invite = useInviteStaff();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(SYSTEM_ROLES.STAFF);

  return (
    <SettingsSection
      id="team-invite"
      title="Invite someone"
      help="They get a link to join. It's copied to your clipboard so you can send it however you like."
    >
      <form
        className="grid max-w-md gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.trim() || invite.isPending) return;
          try {
            const result = await invite.mutateAsync({ email: email.trim(), roleKeys: [role] });
            const link = `${window.location.origin}/invite?token=${encodeURIComponent(result.token)}`;
            await navigator.clipboard.writeText(link);
            toast.success("Invitation created", { description: "Invite link copied." });
            setEmail("");
          } catch (err) {
            toastApiError(err, "Couldn't create the invitation");
          }
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVITE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
        <Button type="submit" className="w-fit" disabled={invite.isPending || !email.trim()}>
          {invite.isPending ? "Creating…" : "Invite"}
        </Button>
      </form>
    </SettingsSection>
  );
}
