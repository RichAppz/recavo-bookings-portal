import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Mail, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { copyInviteLink } from "@/components/team/AddPersonDrawer";
import { PanelSection, TeamAvatar, WeekTrack } from "@/components/team/parts";
import { RoleRadioList } from "@/components/team/Roles";
import { TimeAwayList } from "@/components/team/TimeAwayList";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useIsPhone } from "@/hooks/use-media-query";
import { useBusinessId, useUpdateStaff } from "@/lib/api/hooks";
import { ApiError, describeApiError } from "@/lib/api/errors";
import type { CatalogueService, Location, Staff } from "@/lib/api/types";
import type { TeamPerson, TeamSignIn } from "@/lib/api/team";
import {
  fetchInvitationLink,
  useBookability,
  useCancelInvitation,
  useGiveSignIn,
  useLinkSignIn,
  useResendInvitation,
  useRestoreSignIn,
} from "@/lib/api/team";
import { roleLabel, SYSTEM_ROLES } from "@/lib/permissions";
import type { WorkingRule } from "@/lib/team";
import {
  bookableStatus,
  firstName,
  hoursText,
  nextFreeText,
  presetSameAs,
  presetWeekdays,
  ROLE_LINE,
  shortDate,
  signInLine,
} from "@/lib/team";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export type PanelActions = {
  onClose: () => void;
  onEditProfile: (s: Staff) => void;
  onAddTimeAway: (s: Staff) => void;
  onHours: (s: Staff, initial?: WorkingRule[] | null) => void;
  onServices: (s: Staff) => void;
  onWorksAt: (s: Staff) => void;
  onChangeRole: (p: TeamPerson) => void;
  onRemoveSignIn: (p: TeamPerson) => void;
  onRemove: (p: TeamPerson) => void;
  onRestore: (p: TeamPerson) => void;
};

/**
 * One person: whether clients can book them and the one fix, their sign-in and
 * invite, hours, services, locations, time away and the booking page switch.
 * Right drawer on desktop, full screen on phone. `?person=<id>` keeps it open.
 */
export function PersonPanel({
  open,
  person,
  outsideScope,
  services,
  locations,
  unlinkedSignIns,
  suggestedMembershipId,
  canManage,
  canInvite,
  canManagePermissions,
  isMe,
  actions,
}: {
  open: boolean;
  person: TeamPerson | null;
  outsideScope: boolean;
  services: CatalogueService[];
  locations: Location[];
  unlinkedSignIns: TeamSignIn[];
  suggestedMembershipId: string | null;
  canManage: boolean;
  canInvite: boolean;
  canManagePermissions: boolean;
  isMe: boolean;
  actions: PanelActions;
}) {
  const phone = useIsPhone();
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : actions.onClose())}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "inset-0 h-dvh rounded-none" : "sm:max-w-[480px]",
        )}
      >
        {person ? (
          <Body
            key={person.staff.id}
            person={person}
            services={services}
            locations={locations}
            unlinkedSignIns={unlinkedSignIns}
            suggestedMembershipId={suggestedMembershipId}
            canManage={canManage}
            canInvite={canInvite}
            canManagePermissions={canManagePermissions}
            isMe={isMe}
            actions={actions}
          />
        ) : outsideScope ? (
          <SheetHeader className="px-4 pt-6 pb-4 text-left sm:px-6">
            <SheetTitle>Person</SheetTitle>
            <SheetDescription>This person isn't on your team.</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader className="px-4 pt-6 pb-4 text-left sm:px-6">
              <SheetTitle>
                <Skeleton className="h-6 w-40" />
              </SheetTitle>
              <SheetDescription className="sr-only">Loading</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 px-4 sm:px-6">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  person: p,
  services,
  locations,
  unlinkedSignIns,
  suggestedMembershipId,
  canManage,
  canInvite,
  canManagePermissions,
  isMe,
  actions,
}: {
  person: TeamPerson;
  services: CatalogueService[];
  locations: Location[];
  unlinkedSignIns: TeamSignIn[];
  suggestedMembershipId: string | null;
  canManage: boolean;
  canInvite: boolean;
  canManagePermissions: boolean;
  isMe: boolean;
  actions: PanelActions;
}) {
  const tenant = useTenant();
  const phone = useIsPhone();
  const updateStaff = useUpdateStaff();
  const s = p.staff;
  const first = firstName(s.displayName);
  const archived = s.status === "suspended";
  const takes = s.bookable !== false;
  const businessZone = tenant.business?.defaultTimezone ?? "Europe/London";
  const serviceWord = tenant.terminology.service.replace(/\s+type$/i, "");
  const noun = tenant.terminology.booking.toLowerCase();

  const bookability = useBookability(s.id, p.bookable === "bookable" || p.bookable === "hidden");
  const nextFree =
    bookability.data && bookability.isSuccess
      ? nextFreeText(bookability.data.nextFreeAt, bookability.data.timezone)
      : null;
  const status = bookableStatus(p.bookable, s.displayName, nextFree);

  const places = locations.filter(
    (l) => s.locationIds.length === 0 || s.locationIds.includes(l.id),
  );
  const mainLocation = places.length === 1 || s.locationIds.length > 0 ? places[0] : null;
  const subtitle = [
    p.isOwner ? `Owner${s.title ? ` · ${s.title}` : ""}` : s.title,
    mainLocation?.name,
  ]
    .filter(Boolean)
    .join(" · ");
  const zone = places.length === 1 ? places[0]!.timezone : businessZone;

  const [showAllAway, setShowAllAway] = useState(false);
  const [givingSignIn, setGivingSignIn] = useState(false);

  const fix = () => {
    switch (status.fix) {
      case "hours":
        actions.onHours(s);
        break;
      case "services":
        actions.onServices(s);
        break;
      case "show":
        void updateStaff
          .mutateAsync({ staffId: s.id, version: s.version, body: { bookingVisible: true } })
          .then(() => toast.success(`Clients can choose ${first} again`))
          .catch(() => undefined);
        break;
      case "activate":
        void updateStaff
          .mutateAsync({ staffId: s.id, version: s.version, body: { status: "active" } })
          .then(() => toast.success(`${first}'s diary is switched on`))
          .catch(() => undefined);
        break;
      case "restore":
        actions.onRestore(p);
        break;
    }
  };

  const liveServices = services.filter((x) => x.active && !x.archivedAt);
  const offered = liveServices.filter(
    (x) =>
      (s.eligibleServiceIds.length === 0 || s.eligibleServiceIds.includes(x.id)) &&
      (x.eligibleStaffIds.length === 0 || x.eligibleStaffIds.includes(s.id)),
  );
  const excludedByService = liveServices.filter(
    (x) =>
      (s.eligibleServiceIds.length === 0 || s.eligibleServiceIds.includes(x.id)) &&
      x.eligibleStaffIds.length > 0 &&
      !x.eligibleStaffIds.includes(s.id),
  );

  const signIn = signInLine(p.signIn, p.invitation, takes);
  const sameAs = places.find((l) => l.openingHours.length > 0) ?? null;

  const header = (
    <SheetHeader className="border-b px-4 pt-6 pb-4 text-left sm:px-6">
      {phone ? (
        <div className="-mt-2 mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={actions.onClose}
            className="-ml-2 inline-flex min-h-11 cursor-pointer items-center gap-1 px-2 text-[15px] font-semibold text-primary"
          >
            <ChevronLeft className="size-5" aria-hidden /> Team
          </button>
          {canManage && !archived ? (
            <Button variant="ghost" className="min-h-11" onClick={() => actions.onEditProfile(s)}>
              Edit
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-3 pr-8">
        <TeamAvatar
          name={s.displayName}
          photoUrl={s.photoUrl}
          colour={s.calendarColour}
          size={phone ? 56 : 48}
        />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <SheetTitle className="truncate text-xl font-extrabold">{s.displayName}</SheetTitle>
          <SheetDescription className="truncate text-[13px]">
            {subtitle ||
              (archived ? `Removed ${s.archivedAt ? shortDate(s.archivedAt) : ""}` : " ")}
          </SheetDescription>
        </div>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                aria-label={`More actions for ${s.displayName}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {archived ? (
                <DropdownMenuItem onSelect={() => actions.onRestore(p)}>
                  Bring back
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onSelect={() => actions.onEditProfile(s)}>
                    Edit profile
                  </DropdownMenuItem>
                  {takes ? (
                    <DropdownMenuItem onSelect={() => actions.onAddTimeAway(s)}>
                      Add time away
                    </DropdownMenuItem>
                  ) : null}
                  {canManagePermissions && p.signIn?.status === "active" && !p.isOwner ? (
                    <>
                      <DropdownMenuItem onSelect={() => actions.onChangeRole(p)}>
                        Change role
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => actions.onRemoveSignIn(p)}>
                        Remove sign-in
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {p.isOwner ? null : (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => actions.onRemove(p)}
                      >
                        Remove from team
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </SheetHeader>
  );

  return (
    <>
      {header}
      <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-5 sm:px-6">
        {/* 1. Status box */}
        {status.tone === "amber" || archived ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl bg-amber-500/12 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200"
          >
            <span className="grid min-w-0 flex-1 gap-0.5">
              <strong>
                {archived ? `${first} is archived.` : `Clients can't book ${first} online.`}
              </strong>
              <span>{status.reason}</span>
            </span>
            {canManage && status.fixLabel ? (
              <Button size="sm" variant="outline" className="shrink-0 bg-card" onClick={fix}>
                {status.fixLabel}
              </Button>
            ) : null}
          </div>
        ) : status.tone === "green" ? (
          <div
            role="status"
            className="grid gap-0.5 rounded-xl bg-emerald-500/12 px-3.5 py-3 text-sm text-emerald-900 dark:text-emerald-200"
          >
            <strong>Bookable online</strong>
            <span>
              {bookability.isLoading
                ? "Finding the next free time…"
                : (nextFree ?? "Clients can book online").replace("Next free ", "Next free ")}
            </span>
          </div>
        ) : p.bookable === "hidden" ? (
          <p className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3.5 py-2.5 text-sm text-muted-foreground">
            <span>Hidden from booking page. Staff can still book {first}.</span>
            {canManage ? (
              <button
                type="button"
                className="shrink-0 cursor-pointer font-semibold text-primary hover:underline"
                onClick={fix}
              >
                Show
              </button>
            ) : null}
          </p>
        ) : null}

        {phone && (p.signIn?.email || p.invitation?.email) ? (
          <a
            href={`mailto:${p.signIn?.email ?? p.invitation?.email}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold"
          >
            <Mail className="size-4" aria-hidden /> Email
          </a>
        ) : null}

        {/* 2. Sign-in */}
        <SignInSection
          person={p}
          line={signIn}
          canInvite={canInvite}
          canManagePermissions={canManagePermissions}
          unlinkedSignIns={unlinkedSignIns}
          suggestedMembershipId={suggestedMembershipId}
          onGive={() => setGivingSignIn(true)}
          onChangeRole={() => actions.onChangeRole(p)}
          archived={archived}
        />

        {takes ? (
          <>
            {/* 3. Working hours */}
            <PanelSection
              title="Working hours"
              action={
                canManage && !archived ? (
                  <Button variant="ghost" size="sm" onClick={() => actions.onHours(s)}>
                    Set hours
                  </Button>
                ) : null
              }
            >
              {s.workingRules.length > 0 ? (
                <>
                  <WeekTrack
                    rules={s.workingRules}
                    locationName={
                      locations.length > 1
                        ? (id) => (id ? (locations.find((l) => l.id === id)?.name ?? null) : null)
                        : undefined
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {hoursText(p.week.minutes)} a week · {p.week.bookings}{" "}
                    {p.week.bookings === 1 ? noun : `${noun}s`} this week
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">
                  No hours yet.
                  {canManage && !archived ? (
                    <>
                      {" "}
                      Try{" "}
                      {sameAs ? (
                        <>
                          <button
                            type="button"
                            className="cursor-pointer font-bold text-primary hover:underline"
                            onClick={() =>
                              actions.onHours(s, presetSameAs(sameAs, locations.length > 1))
                            }
                          >
                            Same as {sameAs.name}
                          </button>{" "}
                          or{" "}
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="cursor-pointer font-bold text-primary hover:underline"
                        onClick={() => actions.onHours(s, presetWeekdays())}
                      >
                        Mon to Fri, 9 to 5
                      </button>
                      .
                    </>
                  ) : null}
                </div>
              )}
            </PanelSection>

            {/* 4. Services */}
            <PanelSection
              title="Does these services"
              action={
                canManage && !archived ? (
                  <Button variant="ghost" size="sm" onClick={() => actions.onServices(s)}>
                    Edit
                  </Button>
                ) : null
              }
            >
              <p className="text-sm text-muted-foreground">
                {liveServices.length === 0
                  ? `No ${serviceWord.toLowerCase()}s yet.`
                  : s.eligibleServiceIds.length === 0 && excludedByService.length === 0
                    ? `All ${liveServices.length} ${serviceWord.toLowerCase()}s, including any you add later.`
                    : offered.length === 0
                      ? `Doesn't do any ${serviceWord.toLowerCase()}s.`
                      : `${offered
                          .slice(0, 3)
                          .map((x) => x.name)
                          .join(
                            ", ",
                          )}${offered.length > 3 ? ", …" : ""} · ${offered.length} of ${liveServices.length}`}
              </p>
              {excludedByService.slice(0, 2).map((x) => (
                <p key={x.id} className="text-xs text-muted-foreground">
                  {x.name} is set to other people only. Change in{" "}
                  <Link to="/services" className="font-semibold text-primary hover:underline">
                    {serviceWord}s
                  </Link>
                  .
                </p>
              ))}
            </PanelSection>

            {/* 5. Works at */}
            {locations.length >= 2 ? (
              <PanelSection
                title="Works at"
                action={
                  canManage && !archived ? (
                    <Button variant="ghost" size="sm" onClick={() => actions.onWorksAt(s)}>
                      Edit
                    </Button>
                  ) : null
                }
              >
                <p className="text-sm text-muted-foreground">
                  {s.locationIds.length === 0
                    ? "All locations"
                    : places.map((l) => l.name).join(", ") || "No active locations"}
                </p>
              </PanelSection>
            ) : null}

            {/* 6. Time away */}
            <PanelSection
              title="Time away"
              action={
                canManage && !archived ? (
                  <Button variant="ghost" size="sm" onClick={() => actions.onAddTimeAway(s)}>
                    <Plus className="size-3.5" /> Add
                  </Button>
                ) : null
              }
            >
              <TimeAwayList
                person={s}
                zone={zone}
                canEdit={canManage && !archived}
                {...(showAllAway ? {} : { limit: 3, onAll: () => setShowAllAway(true) })}
              />
            </PanelSection>

            {/* 7. On the booking page */}
            {!archived ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="grid gap-0.5">
                  <span id="panel-visible" className="text-sm font-semibold">
                    Clients can choose {first}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Off still lets staff book {first} in.
                  </span>
                </span>
                <Switch
                  aria-labelledby="panel-visible"
                  checked={s.bookingVisible}
                  disabled={!canManage || updateStaff.isPending}
                  onCheckedChange={(on) =>
                    void updateStaff
                      .mutateAsync({
                        staffId: s.id,
                        version: s.version,
                        body: { bookingVisible: on },
                      })
                      .then(() =>
                        toast.success(
                          on
                            ? `Clients can choose ${first}`
                            : `${first} is hidden from the booking page`,
                        ),
                      )
                      .catch(() => undefined)
                  }
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {canManage ? (
        <footer className="flex items-center gap-2 border-t px-4 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {archived ? (
            <Button className="ml-auto h-10" onClick={() => actions.onRestore(p)}>
              Bring {first} back
            </Button>
          ) : (
            <>
              <Button variant="outline" className="h-10" onClick={() => actions.onEditProfile(s)}>
                Edit profile
              </Button>
              {status.fix && status.fix !== "restore" ? (
                <Button className="ml-auto h-10 flex-1 sm:flex-none" onClick={fix}>
                  {status.fix === "hours" ? `Set ${first}'s hours` : status.fixLabel}
                </Button>
              ) : takes ? (
                <Button
                  className="ml-auto h-10 flex-1 sm:flex-none"
                  onClick={() => actions.onAddTimeAway(s)}
                >
                  Add time away
                </Button>
              ) : null}
            </>
          )}
        </footer>
      ) : null}

      <GiveSignInDialog open={givingSignIn} onOpenChange={setGivingSignIn} person={s} isMe={isMe} />
    </>
  );
}

function SignInSection({
  person: p,
  line,
  canInvite,
  canManagePermissions,
  unlinkedSignIns,
  suggestedMembershipId,
  onGive,
  onChangeRole,
  archived,
}: {
  person: TeamPerson;
  line: ReturnType<typeof signInLine>;
  canInvite: boolean;
  canManagePermissions: boolean;
  unlinkedSignIns: TeamSignIn[];
  suggestedMembershipId: string | null;
  onGive: () => void;
  onChangeRole: () => void;
  archived: boolean;
}) {
  const businessId = useBusinessId();
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();
  const restore = useRestoreSignIn();
  const link = useLinkSignIn();
  const s = p.staff;
  const first = firstName(s.displayName);
  const email = p.signIn?.email ?? p.invitation?.email ?? null;
  const [linking, setLinking] = useState<string>("");

  const resendInvite = async () => {
    if (!p.invitation) return;
    try {
      const out = await resend.mutateAsync(p.invitation.id);
      if (out.emailed) toast.success("Invite sent again");
      else
        toast.warning("The email didn't go out. Copy the link to send it yourself.", {
          action: { label: "Copy link", onClick: () => void copyInviteLink(out) },
        });
    } catch (err) {
      toast.error(describeApiError(err, "Couldn't resend the invite."));
    }
  };

  const copy = async () => {
    if (!p.invitation) return;
    if (p.invitation.linkCopyable === false) {
      toast.message(
        "This invite was made before links could be copied. Send it again to get a link.",
      );
      return;
    }
    try {
      await copyInviteLink(await fetchInvitationLink(businessId, p.invitation.id));
    } catch (err) {
      toast.error(describeApiError(err, "Couldn't get the link."));
    }
  };

  const suggested = suggestedMembershipId
    ? unlinkedSignIns.find((m) => m.membershipId === suggestedMembershipId)
    : null;

  return (
    <PanelSection title="Sign-in">
      <div className="divide-y overflow-hidden rounded-xl border text-sm">
        <div className="grid gap-2 px-3.5 py-3">
          {line.state === "none" ? (
            <>
              <span>{first} doesn't sign in</span>
              {canInvite && !archived ? (
                <Button variant="outline" size="sm" className="w-fit" onClick={onGive}>
                  Give {first} a sign-in
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <span className="grid gap-0.5">
                <span className="truncate font-semibold">{email ?? "Email hidden"}</span>
                <span
                  className={cn(
                    "text-[13px]",
                    line.tone === "amber" && "text-amber-700 dark:text-amber-300",
                    line.tone === "red" && "text-destructive",
                    line.tone === "muted" && "text-muted-foreground",
                  )}
                >
                  {line.state === "invited" && p.invitation?.sentAt
                    ? `Invite sent ${shortDate(p.invitation.sentAt)} · expires ${shortDate(p.invitation.expiresAt)}`
                    : line.line}
                </span>
              </span>
              {canInvite && p.invitation && line.state === "invited" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resend.isPending}
                    onClick={() => void resendInvite()}
                  >
                    Resend email
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void copy()}>
                    Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={() =>
                      void cancel
                        .mutateAsync(p.invitation!.id)
                        .then(() => toast.success("Invite cancelled"))
                        .catch((err) => toast.error(describeApiError(err, "Couldn't cancel it.")))
                    }
                  >
                    Cancel invite
                  </Button>
                </div>
              ) : null}
              {canInvite && p.invitation && line.state === "expired" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  disabled={resend.isPending}
                  onClick={() => void resendInvite()}
                >
                  Send a new invite
                </Button>
              ) : null}
              {canManagePermissions && line.state === "removed" && !archived ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  disabled={restore.isPending}
                  onClick={() =>
                    void restore
                      .mutateAsync(s.id)
                      .then(() => toast.success(`${first} can sign in again`))
                      .catch((err) => toast.error(describeApiError(err, "Couldn't restore it.")))
                  }
                >
                  Restore sign-in
                </Button>
              ) : null}
            </>
          )}
        </div>
        {line.roleKey ? (
          <div className="flex items-center gap-3 px-3.5 py-3">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-semibold">{roleLabel(line.roleKey)}</span>
              <span className="text-[13px] text-muted-foreground">
                {p.isOwner ? "Owner role can't be changed" : ROLE_LINE[line.roleKey]}
              </span>
            </span>
            {canManagePermissions && !p.isOwner && p.signIn?.status === "active" && !archived ? (
              <Button variant="ghost" size="sm" onClick={onChangeRole}>
                Change
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {canManagePermissions && !p.signIn && !archived && unlinkedSignIns.length > 0 ? (
        <div className="grid gap-2 rounded-xl bg-secondary/60 px-3.5 py-3 text-sm">
          {suggested ? (
            <>
              <span>
                We think {suggested.name ?? suggested.email ?? "a sign-in"}'s sign-in and {first}'s
                diary are the same person. Link them?
              </span>
              <Button
                size="sm"
                className="w-fit"
                disabled={link.isPending}
                onClick={() =>
                  void link
                    .mutateAsync({ staffId: s.id, membershipId: suggested.membershipId })
                    .then(() => toast.success("Linked"))
                    .catch((err) => toast.error(describeApiError(err, "Couldn't link them.")))
                }
              >
                Link them
              </Button>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">
                Already signs in under another name? Link their sign-in to this diary.
              </span>
              <div className="flex gap-2">
                <Select value={linking} onValueChange={setLinking}>
                  <SelectTrigger className="h-9 flex-1 bg-card">
                    <SelectValue placeholder="Choose a sign-in" />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedSignIns.map((m) => (
                      <SelectItem key={m.membershipId} value={m.membershipId}>
                        {m.name ?? m.email ?? "Unnamed"} · {roleLabel(m.roleKeys[0] ?? "staff")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={!linking || link.isPending}
                  onClick={() =>
                    void link
                      .mutateAsync({ staffId: s.id, membershipId: linking })
                      .then(() => toast.success("Linked"))
                      .catch((err) => toast.error(describeApiError(err, "Couldn't link them.")))
                  }
                >
                  Link
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </PanelSection>
  );
}

function GiveSignInDialog({
  open,
  onOpenChange,
  person,
  isMe,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Staff;
  isMe: boolean;
}) {
  const give = useGiveSignIn();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(SYSTEM_ROLES.STAFF);
  const [error, setError] = useState<string | null>(null);
  const first = firstName(person.displayName);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setRole(SYSTEM_ROLES.STAFF);
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Add their email so we can send the invite.");
      return;
    }
    setError(null);
    try {
      const out = await give.mutateAsync({
        staffId: person.id,
        email: email.trim(),
        roleKeys: [role],
      });
      if (out.emailed) {
        toast.success(`Invite sent to ${email.trim()}`, {
          action: { label: "Copy link", onClick: () => void copyInviteLink(out) },
        });
      } else {
        toast.warning("The invite email didn't go out. Copy the link to send it yourself.", {
          action: { label: "Copy link", onClick: () => void copyInviteLink(out) },
          duration: 12_000,
        });
      }
      onOpenChange(false);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.extensions.reason === "email_in_use" || err.extensions.reason === "email_invited")
      ) {
        setError(describeApiError(err, "That email is already on your team."));
        return;
      }
      setError(describeApiError(err, "Couldn't send the invite."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isMe ? "Your sign-in" : `Give ${first} a sign-in`}</DialogTitle>
          <DialogDescription>
            We'll email {first} a link to join, and give you a link to copy too.
          </DialogDescription>
        </DialogHeader>
        <form
          id="give-sign-in"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="grid gap-1.5 text-sm font-semibold">
            Email *
            <Input
              type="email"
              autoComplete="off"
              value={email}
              placeholder="name@example.co.uk"
              aria-invalid={Boolean(error)}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error ? <span className="text-xs font-normal text-destructive">{error}</span> : null}
          </label>
          <RoleRadioList value={role} onChange={setRole} />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="give-sign-in" disabled={give.isPending}>
            {give.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
