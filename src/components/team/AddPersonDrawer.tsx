import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { OptionCards } from "@/components/team/parts";
import { RoleRadioList } from "@/components/team/Roles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import { ApiError, describeApiError } from "@/lib/api/errors";
import type { Location, Staff } from "@/lib/api/types";
import type { InviteResult } from "@/lib/api/team";
import { inviteLink, useAddPerson } from "@/lib/api/team";
import type { PlanSeat } from "@/lib/locations";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";
import { firstName, nextColour } from "@/lib/team";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export async function copyInviteLink(result: { token: string; inviteUrl: string | null }) {
  try {
    await navigator.clipboard.writeText(inviteLink(result));
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy the link. Try again.");
  }
}

/** "Add detailer" when the business has its own word, otherwise "Add person". */
export function addLabel(staffWord: string): string {
  return staffWord && staffWord.toLowerCase() !== "staff"
    ? `Add ${staffWord.toLowerCase()}`
    : "Add person";
}

function placeholders(industry: string | null | undefined, staffWord: string) {
  if (industry === "car_detailing") return { name: "Ben Carter", title: "Detailer" };
  if (industry === "personal_training") return { name: "Jordan Ellis", title: "Personal trainer" };
  return { name: "Sam Taylor", title: staffWord.toLowerCase() === "staff" ? "Stylist" : staffWord };
}

type Duplicate = { message: string; staffId: string | null; name: string | null };

/**
 * Someone clients book, someone who signs in, or both. At the seat limit the
 * fields give way to the plan message. Right drawer on desktop, full-screen
 * sheet on phone.
 */
export function AddPersonDrawer({
  open,
  onOpenChange,
  seat,
  locations,
  usedColours,
  onAdded,
  onOpenPerson,
  onSeePlans,
  onViewTeam,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seat: PlanSeat;
  locations: Location[];
  usedColours: (string | null)[];
  onAdded: (staff: Staff, invite: InviteResult | null, bookable: boolean) => void;
  onOpenPerson: (staffId: string) => void;
  onSeePlans: () => void;
  onViewTeam: () => void;
}) {
  const phone = useIsPhone();
  const tenant = useTenant();
  const add = useAddPerson();
  const canInvite = tenant.can(PERMISSIONS.TEAM_INVITE);
  const staffWord = tenant.terminology.staff;
  const ph = placeholders(tenant.business?.industryTemplateKey, staffWord);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [bookable, setBookable] = useState<"yes" | "no">("yes");
  const [signIn, setSignIn] = useState<"yes" | "no">("no");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(SYSTEM_ROLES.STAFF);
  const [worksAt, setWorksAt] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTitle("");
    setBookable("yes");
    setSignIn("no");
    setEmail("");
    setRole(SYSTEM_ROLES.STAFF);
    setWorksAt(locations.map((l) => l.id));
    setTried(false);
    setFormError(null);
    setDuplicate(null);
    // Reset when the drawer opens, not when the location list refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const first = firstName(name.trim()) || "them";
  const nameError = !name.trim() ? "Give them a name." : null;
  const emailError =
    signIn === "yes" && !/^\S+@\S+\.\S+$/.test(email.trim())
      ? "Add their email so we can send the invite."
      : null;
  const nothing =
    bookable === "no" && signIn === "no"
      ? "They need to take bookings or sign in, otherwise they don't need adding."
      : null;
  const invalid = Boolean(nameError || emailError || nothing);
  const nextSeat = seat.used + 1;

  const submit = async () => {
    setTried(true);
    setDuplicate(null);
    setFormError(null);
    if (invalid) return;
    const allPlaces = worksAt.length === locations.length;
    try {
      const out = await add.mutateAsync({
        displayName: name.trim(),
        title: title.trim() || null,
        bookable: bookable === "yes",
        locationIds: bookable === "yes" && !allPlaces ? worksAt : [],
        calendarColour: nextColour(usedColours),
        signIn: signIn === "yes" ? { email: email.trim(), roleKeys: [role] } : null,
      });
      if (out.invite) {
        const invite = out.invite;
        if (invite.emailed) {
          toast.success(`${first} added. Invite sent to ${email.trim()}`, {
            action: { label: "Copy link", onClick: () => void copyInviteLink(invite) },
          });
        } else {
          toast.warning(`${first} added. The invite email didn't go out, so copy the link.`, {
            action: { label: "Copy link", onClick: () => void copyInviteLink(invite) },
            duration: 12_000,
          });
        }
      } else {
        toast.success(`${first} added`);
      }
      onOpenChange(false);
      onAdded(out.staff, out.invite, bookable === "yes");
    } catch (err) {
      if (err instanceof ApiError && err.code === "PLAN_LIMIT_EXCEEDED") {
        setFormError("You've used every seat on your plan.");
        return;
      }
      if (
        err instanceof ApiError &&
        (err.extensions.reason === "email_in_use" || err.extensions.reason === "email_invited")
      ) {
        const who = (err.extensions.name as string | null) ?? null;
        setDuplicate({
          message: who
            ? `That email already belongs to ${who} on your team.`
            : "That email has already been invited.",
          staffId: (err.extensions.staffId as string | null) ?? null,
          name: who,
        });
        return;
      }
      setFormError(describeApiError(err, "Couldn't add them."));
    }
  };

  const nextPlanSeats = seat.next?.limits["staff.active"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "inset-0 h-dvh rounded-none" : "sm:max-w-[480px]",
        )}
      >
        <SheetHeader className="border-b px-4 pt-6 pb-4 text-left sm:px-6">
          <SheetTitle className="text-xl font-extrabold">{addLabel(staffWord)}</SheetTitle>
          <SheetDescription>Someone clients book, someone who signs in, or both.</SheetDescription>
        </SheetHeader>

        {seat.atLimit ? (
          <div className="grid flex-1 content-start justify-items-center gap-3 px-6 py-10 text-center">
            <span
              aria-hidden
              className="flex size-14 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
            >
              <Users className="size-6" />
            </span>
            <p className="text-lg font-extrabold">
              Your {seat.planName} plan includes {seat.allowed}{" "}
              {seat.allowed === 1 ? "seat" : "seats"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {seat.planCode === "solo"
                ? `Solo includes 1 seat. ${seat.next ? `${seat.next.name} includes ${nextPlanSeats}.` : ""}`
                : seat.next
                  ? `You're using all ${seat.allowed}. Move to ${seat.next.name} for up to ${nextPlanSeats}, or remove someone you no longer need.`
                  : `You're using all ${seat.allowed}. Remove someone you no longer need, or contact us for more.`}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onViewTeam();
                }}
              >
                View team
              </Button>
              {seat.next ? (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onSeePlans();
                  }}
                >
                  See {seat.next.name}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <form
              id="add-person-form"
              className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-5 sm:px-6"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {formError ? (
                <p
                  role="alert"
                  className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {formError}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                <label className="grid gap-1.5 text-sm font-semibold">
                  Name *
                  <Input
                    value={name}
                    autoFocus={!phone}
                    maxLength={120}
                    placeholder={ph.name}
                    aria-invalid={tried && Boolean(nameError)}
                    aria-describedby={tried && nameError ? "add-name-error" : undefined}
                    onChange={(e) => setName(e.target.value)}
                  />
                  {tried && nameError ? (
                    <span id="add-name-error" className="text-xs font-normal text-destructive">
                      {nameError}
                    </span>
                  ) : null}
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  <span>
                    Job title <span className="font-normal text-muted-foreground">(optional)</span>
                  </span>
                  <Input
                    value={title}
                    maxLength={120}
                    placeholder={ph.title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
              </div>

              <OptionCards
                label={`Can clients book ${first}?`}
                value={bookable}
                onChange={setBookable}
                options={[
                  { value: "yes", title: "Yes", help: "Has a diary, hours and services" },
                  { value: "no", title: "No", help: "Doesn't do the work, e.g. reception" },
                ]}
              />

              {canInvite ? (
                <OptionCards
                  label={`Can ${first} sign in?`}
                  value={signIn}
                  onChange={setSignIn}
                  options={[
                    { value: "yes", title: "Yes, invite them", help: "We'll email a link to join" },
                    { value: "no", title: "No", help: "You manage their diary for them" },
                  ]}
                />
              ) : null}

              {signIn === "yes" ? (
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Email *
                    <Input
                      type="email"
                      autoComplete="off"
                      value={email}
                      placeholder="name@example.co.uk"
                      aria-invalid={tried && Boolean(emailError || duplicate)}
                      aria-describedby={
                        tried && (emailError || duplicate) ? "add-email-error" : undefined
                      }
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setDuplicate(null);
                      }}
                    />
                    {tried && emailError ? (
                      <span id="add-email-error" className="text-xs font-normal text-destructive">
                        {emailError}
                      </span>
                    ) : duplicate ? (
                      <span
                        id="add-email-error"
                        role="alert"
                        className="flex flex-wrap items-center gap-2 text-xs font-normal text-destructive"
                      >
                        {duplicate.message}
                        {duplicate.staffId ? (
                          <button
                            type="button"
                            className="cursor-pointer font-semibold text-primary hover:underline"
                            onClick={() => {
                              onOpenChange(false);
                              onOpenPerson(duplicate.staffId!);
                            }}
                          >
                            Open {firstName(duplicate.name ?? "them")}
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                  </label>
                  <RoleRadioList value={role} onChange={setRole} />
                </div>
              ) : null}

              {bookable === "yes" && locations.length >= 2 ? (
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-bold">Works at</legend>
                  {locations.map((l) => (
                    <label key={l.id} className="flex min-h-9 items-center gap-2 text-sm">
                      <Checkbox
                        checked={worksAt.includes(l.id)}
                        onCheckedChange={(on) =>
                          setWorksAt((ids) => (on ? [...ids, l.id] : ids.filter((x) => x !== l.id)))
                        }
                      />
                      {l.name}
                    </label>
                  ))}
                  {worksAt.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      None ticked means they work at every location.
                    </span>
                  ) : null}
                </fieldset>
              ) : null}

              {bookable === "yes" ? (
                <p className="text-[13px] text-muted-foreground">Next, set their working hours.</p>
              ) : null}

              {tried && nothing ? (
                <p role="alert" className="text-sm text-destructive">
                  {nothing}
                </p>
              ) : null}

              {seat.allowed !== null ? (
                <p className="rounded-xl bg-secondary/60 px-3.5 py-3 text-[13px] text-muted-foreground">
                  {name.trim() ? first : "They"} will use seat {nextSeat} of {seat.allowed}.
                  {signIn === "yes"
                    ? ` We'll email ${name.trim() ? first : "them"} an invite, and give you a link to copy too.`
                    : ""}
                </p>
              ) : signIn === "yes" ? (
                <p className="rounded-xl bg-secondary/60 px-3.5 py-3 text-[13px] text-muted-foreground">
                  We'll email {name.trim() ? first : "them"} an invite, and give you a link to copy
                  too.
                </p>
              ) : null}
            </form>

            <footer className="flex items-center justify-end gap-2 border-t px-4 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="add-person-form"
                disabled={add.isPending}
                className={cn(phone && "h-12 flex-1")}
              >
                {add.isPending
                  ? "Adding…"
                  : signIn === "yes"
                    ? `Add ${name.trim() ? first : "them"} and send invite`
                    : `Add ${name.trim() ? first : "them"}`}
              </Button>
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
