import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Plus, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { PanelSection, WeekTrack } from "@/components/team/parts";
import type { TeamDialogs } from "@/components/team/TeamDialogs";
import { TimeAwayList } from "@/components/team/TimeAwayList";
import { CardsGhost } from "@/components/ghost";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useUpdateStaff } from "@/lib/api/hooks";
import { ApiError, describeApiError } from "@/lib/api/errors";
import type { CatalogueService, Location } from "@/lib/api/types";
import type { TeamOverview, TeamPerson } from "@/lib/api/team";
import { useAdoptSignIn, useBookability } from "@/lib/api/team";
import { useAuth } from "@/lib/auth/auth-store";
import { bookingUrlFor } from "@/lib/hosts";
import type { PlanSeat } from "@/lib/locations";
import { bookableStatus, hoursText, nextFreeText, presetSameAs, presetWeekdays } from "@/lib/team";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const TITLE = "Your availability";
const INTRO = "When clients can book you, what you do and your time away.";

/** One seat: the owner's own hours, services and time away. No team language. */
export function SoloAvailability({
  team,
  loading,
  error,
  onRetry,
  services,
  locations,
  seat,
  canManage,
  dialogs,
}: {
  team: TeamOverview | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  services: CatalogueService[];
  locations: Location[];
  seat: PlanSeat;
  canManage: boolean;
  dialogs: TeamDialogs;
}) {
  const me = useAuth().user;
  const adopt = useAdoptSignIn();
  const header = <PageHeader title={TITLE} description={INTRO} />;

  if (loading) {
    return (
      <>
        {header}
        <CardsGhost count={2} className="h-[220px]" />
      </>
    );
  }
  if (error || !team) {
    return (
      <>
        {header}
        <div role="alert" className="grid justify-items-start gap-2 rounded-2xl border p-5">
          <p className="font-extrabold">Couldn't load your availability</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof ApiError ? error.detail || error.title : "Check your connection."}
          </p>
          <Button variant="outline" onClick={onRetry}>
            <RotateCw className="size-4" /> Try again
          </Button>
        </div>
      </>
    );
  }

  const active = team.people.filter((p) => p.staff.status !== "suspended");
  const you =
    active.find((p) => me && p.signIn?.userId === me.id) ??
    active.find((p) => p.isOwner) ??
    active[0] ??
    null;

  if (!you) {
    const own = team.unlinkedSignIns.find((s) => me && s.userId === me.id) ?? null;
    return (
      <>
        {header}
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
          <p className="text-lg font-extrabold">Set your working hours</p>
          <p className="max-w-md text-sm text-muted-foreground">So clients can book you online.</p>
          {canManage && own ? (
            <Button
              disabled={adopt.isPending}
              onClick={() =>
                adopt.mutate(own.membershipId, {
                  onSuccess: (staff) => dialogs.open({ hours: { staff, suggest: true } }),
                  onError: (err) => toast.error(describeApiError(err, "Couldn't set you up.")),
                })
              }
            >
              Set up my diary
            </Button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <SoloBody
        you={you}
        services={services}
        locations={locations}
        seat={seat}
        canManage={canManage}
        dialogs={dialogs}
      />
    </>
  );
}

function SoloBody({
  you: p,
  services,
  locations,
  seat,
  canManage,
  dialogs,
}: {
  you: TeamPerson;
  services: CatalogueService[];
  locations: Location[];
  seat: PlanSeat;
  canManage: boolean;
  dialogs: TeamDialogs;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const updateStaff = useUpdateStaff();
  const s = p.staff;
  const serviceWord = tenant.terminology.service.replace(/\s+type$/i, "").toLowerCase();
  const noun = tenant.terminology.booking.toLowerCase();
  const bookability = useBookability(s.id, p.bookable === "bookable");
  const nextFree = bookability.data
    ? nextFreeText(bookability.data.nextFreeAt, bookability.data.timezone)
    : null;
  const status = bookableStatus(p.bookable, "you", nextFree);
  const zone =
    locations.length === 1
      ? locations[0]!.timezone
      : (tenant.business?.defaultTimezone ?? "Europe/London");
  const sameAs = locations.find((l) => l.openingHours.length > 0) ?? null;

  const liveServices = services.filter((x) => x.active && !x.archivedAt);
  const offered = liveServices.filter(
    (x) =>
      (s.eligibleServiceIds.length === 0 || s.eligibleServiceIds.includes(x.id)) &&
      (x.eligibleStaffIds.length === 0 || x.eligibleStaffIds.includes(s.id)),
  );

  const fix = () => {
    switch (status.fix) {
      case "hours":
        dialogs.open({ hours: { staff: s } });
        break;
      case "services":
        dialogs.open({ services: s });
        break;
      case "show":
        void updateStaff
          .mutateAsync({ staffId: s.id, version: s.version, body: { bookingVisible: true } })
          .then(() => toast.success("Clients can choose you again"))
          .catch(() => undefined);
        break;
      case "activate":
        void updateStaff
          .mutateAsync({ staffId: s.id, version: s.version, body: { status: "active" } })
          .then(() => toast.success("Your diary is switched on"))
          .catch(() => undefined);
        break;
    }
  };

  const green = status.tone === "green";
  const banner = green
    ? {
        title: "Clients can book you online.",
        line: nextFree ? `${nextFree.replace(/^Next free /, "Next free: ")}.` : "",
      }
    : p.bookable === "hidden"
      ? {
          title: "You're hidden from the booking page.",
          line: "You can still book clients in yourself.",
        }
      : p.bookable === "not_bookable"
        ? { title: "Clients can't book you online.", line: "You're set to not take bookings." }
        : { title: "Clients can't book you online.", line: soloReason(p.bookable, serviceWord) };

  const nextSeats = seat.next?.limits["staff.active" as keyof typeof seat.next.limits];

  return (
    <div className="grid gap-5">
      <div
        role="status"
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3.5 text-sm",
          green
            ? "bg-emerald-500/12 text-emerald-900 dark:text-emerald-200"
            : "bg-amber-500/12 text-amber-900 dark:text-amber-200",
        )}
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <strong>{banner.title}</strong>
          {banner.line ? <span>{banner.line}</span> : null}
        </span>
        {canManage && status.fix && status.fixLabel ? (
          <Button size="sm" variant="outline" className="bg-card" onClick={fix}>
            {status.fixLabel}
          </Button>
        ) : null}
        {tenant.business ? (
          <a
            href={bookingUrlFor(tenant.business.slug)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-semibold underline-offset-2 hover:underline"
          >
            View booking page <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="grid content-start gap-3 rounded-2xl border bg-card p-5">
          <PanelSection
            title="Working hours"
            action={
              canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dialogs.open({ hours: { staff: s } })}
                >
                  Edit
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
                {canManage ? (
                  <>
                    {" "}
                    Try{" "}
                    {sameAs ? (
                      <>
                        <button
                          type="button"
                          className="cursor-pointer font-bold text-primary hover:underline"
                          onClick={() =>
                            dialogs.open({
                              hours: {
                                staff: s,
                                initial: presetSameAs(sameAs, locations.length > 1),
                              },
                            })
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
                      onClick={() =>
                        dialogs.open({ hours: { staff: s, initial: presetWeekdays() } })
                      }
                    >
                      Mon to Fri, 9 to 5
                    </button>
                    .
                  </>
                ) : null}
              </div>
            )}
          </PanelSection>
        </section>

        <div className="grid content-start gap-5">
          <section className="grid gap-3 rounded-2xl border bg-card p-5">
            <PanelSection
              title="Time away"
              action={
                canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dialogs.open({ away: { person: s } })}
                  >
                    <Plus className="size-3.5" /> Add
                  </Button>
                ) : null
              }
            >
              <TimeAwayList person={s} zone={zone} canEdit={canManage} />
            </PanelSection>
          </section>

          <section className="grid gap-3 rounded-2xl border bg-card p-5">
            <PanelSection
              title={`${serviceWord.charAt(0).toUpperCase()}${serviceWord.slice(1)}s you do`}
              action={
                canManage ? (
                  <Button variant="ghost" size="sm" onClick={() => dialogs.open({ services: s })}>
                    Edit
                  </Button>
                ) : null
              }
            >
              <p className="text-sm text-muted-foreground">
                {liveServices.length === 0 ? (
                  <>
                    No {serviceWord}s yet.{" "}
                    <Link to="/services" className="font-semibold text-primary hover:underline">
                      Add your {serviceWord}s ›
                    </Link>
                  </>
                ) : s.eligibleServiceIds.length === 0 && offered.length === liveServices.length ? (
                  `All ${liveServices.length} ${serviceWord}s, including any you add later.`
                ) : offered.length === 0 ? (
                  `You don't do any ${serviceWord}s yet.`
                ) : (
                  `${offered
                    .slice(0, 3)
                    .map((x) => x.name)
                    .join(
                      ", ",
                    )}${offered.length > 3 ? ", …" : ""} · ${offered.length} of ${liveServices.length}`
                )}
              </p>
            </PanelSection>
          </section>

          <section className="grid gap-2 rounded-2xl border border-dashed p-5">
            <p className="font-extrabold">Taking on help?</p>
            <p className="text-sm text-muted-foreground">
              Add a team member so clients can book them, or give someone a sign-in to help with
              bookings.
            </p>
            <p className="text-sm text-muted-foreground">
              {seat.planName} includes {seat.allowed ?? 1} {seat.allowed === 1 ? "seat" : "seats"}.
              {seat.next && nextSeats ? ` ${seat.next.name} includes ${nextSeats}.` : ""}
            </p>
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => void navigate({ to: "/billing" })}
            >
              See plans
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}

function soloReason(state: TeamPerson["bookable"], serviceWord: string): string {
  switch (state) {
    case "no_hours":
      return "You have no working hours set.";
    case "no_services":
      return `You aren't set to do any ${serviceWord}s.`;
    case "hours_outside_opening":
      return "Your hours fall outside your opening hours.";
    case "inactive":
      return "Your diary hasn't been switched on yet.";
    default:
      return "";
  }
}
