import { ChevronRight, MapPin, Navigation, Share, Star } from "lucide-react";
import { toast } from "sonner";
import {
  BarSummary,
  BottomBar,
  ClientCard,
  ClientColumn,
  PoweredBy,
  PrimaryButton,
  SectionLabel,
  StudioMark,
} from "@/components/client/ClientPage";
import type {
  PublicBusinessProfile,
  PublicLocation,
  PublicPackage,
  PublicService,
  PublicStaff,
} from "@/lib/api/hooks";
import { directionsUrl } from "@/lib/calendar-links";
import { hoursLabel } from "@/lib/client-journey";
import { headerStyle, sectionEnabled, type BookingPageContent } from "@/lib/client-theme";
import { formatDuration, formatMoney } from "@/lib/format";
import { validityLabel } from "@/lib/packages";
import { groupByCategory, hasCategories } from "@/lib/service-categories";
import { cn } from "@/lib/utils";

export type NextAvailable = { label: string; serviceId: string } | null;

export function ClientLanding({
  business,
  page,
  services,
  packages,
  staff,
  locations,
  nextAvailable,
  onPickService,
  onPickPackage,
  onBookNow,
  onSignIn,
  signedInName,
  onAccount,
  cancellationWindowHours,
  preview = false,
}: {
  business: Pick<PublicBusinessProfile, "tradingName" | "slug" | "branding" | "address">;
  page: BookingPageContent;
  services: PublicService[];
  packages: PublicPackage[];
  staff: PublicStaff[];
  locations: PublicLocation[];
  nextAvailable: NextAvailable;
  onPickService: (serviceId: string) => void;
  onPickPackage: (packageId: string) => void;
  onBookNow: () => void;
  onSignIn: () => void;
  /** When the visitor is already signed in with an account at this studio. */
  signedInName?: string | null;
  onAccount?: () => void;
  cancellationWindowHours: number;
  /** The editor's live preview: no navigation, no share, no fixed bar. */
  preview?: boolean;
}) {
  const share = async () => {
    if (preview) return;
    const url = typeof window !== "undefined" ? window.location.href.split("?")[0]! : "";
    try {
      const nav = typeof navigator !== "undefined" ? navigator : null;
      if (nav && typeof nav.share === "function") {
        await nav.share({ title: business.tradingName, url });
        return;
      }
      await nav?.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      // The visitor closed the share sheet; nothing to say.
    }
  };

  const address = page.venue.address ?? business.address ?? null;
  const showStaff = sectionEnabled(page, "staff") && staff.length > 0;
  const showAbout = sectionEnabled(page, "about") && Boolean(page.about?.trim());
  const showLocation =
    sectionEnabled(page, "location") && (Boolean(address) || Boolean(page.venue.parkingNote));
  const inPerson = locations.some((l) => l.type === "physical");
  const online = locations.some((l) => l.type !== "physical");
  const where = inPerson && online ? "In person or online" : online ? "Online" : "In person";

  return (
    <div className="pb-4">
      <ClientColumn className="pt-3 sm:pt-6">
        {/* Header image with the mark and share button floating on it. */}
        <div
          className="relative aspect-[390/300] w-full overflow-hidden bg-muted sm:aspect-[3/1]"
          style={{ ...headerStyle(page), borderRadius: "var(--client-header-radius)" }}
        >
          <div className="absolute top-4 left-4">
            <StudioMark name={business.tradingName} logoUrl={business.branding.logoUrl} size="lg" />
          </div>
          {preview ? null : (
            <button
              type="button"
              onClick={() => void share()}
              aria-label="Share this page"
              className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-sm transition hover:bg-white"
            >
              <Share className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="mt-5">
          <h1
            className="text-[32px] font-bold leading-tight tracking-tight sm:text-[44px]"
            style={{ fontFamily: "var(--client-font-display)", fontWeight: 650 }}
          >
            {business.tradingName}
          </h1>
          {page.description ? (
            <p className="mt-1 text-[17px] text-muted-foreground">{page.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {showStaff ? (
              <Chip>{staff.length === 1 ? "1 to book with" : `${staff.length} to book with`}</Chip>
            ) : null}
            {locations.length > 0 ? <Chip>{where}</Chip> : null}
            {cancellationWindowHours > 0 ? (
              <Chip>Free to move up to {hoursLabel(cancellationWindowHours)} before</Chip>
            ) : null}
          </div>
        </div>

        {/* Returning clients skip the details step. */}
        {preview ? null : signedInName ? (
          <button
            type="button"
            onClick={onAccount}
            className="mt-4 flex w-full items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-left transition hover:bg-muted"
          >
            <span>
              <span className="block text-[15px] font-semibold">Hi {signedInName}</span>
              <span className="block text-[13px] text-muted-foreground">
                Your bookings and credits are in your account
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="mt-4 flex w-full items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-left transition hover:bg-muted"
          >
            <span>
              <span className="block text-[15px] font-semibold">Booked here before?</span>
              <span className="block text-[13px] text-muted-foreground">
                Sign in with a code to use your details and credits
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        )}

        <div className="mt-6 scroll-mt-4" id="sessions">
          <SectionLabel>Sessions</SectionLabel>
          {services.length === 0 ? (
            <ClientCard>
              <p className="px-4 py-5 text-[15px] text-muted-foreground">
                Nothing to book online just now. Check back soon.
              </p>
            </ClientCard>
          ) : hasCategories(services) && groupByCategory(services).length > 1 ? (
            <div className="space-y-4">
              {groupByCategory(services).map((group) => (
                <div key={group.category ?? "other"}>
                  {group.category ? (
                    <p className="mb-1.5 text-[13px] text-muted-foreground">{group.category}</p>
                  ) : null}
                  <ServiceList
                    services={group.items}
                    locations={locations}
                    onPick={onPickService}
                  />
                </div>
              ))}
            </div>
          ) : (
            <ServiceList services={services} locations={locations} onPick={onPickService} />
          )}
        </div>

        {packages.length > 0 ? (
          <div className="mt-6">
            <SectionLabel>Packages</SectionLabel>
            <ClientCard>
              <ul className="divide-y divide-border">
                {packages.map((pkg) => (
                  <li key={pkg.id}>
                    <button
                      type="button"
                      onClick={() => onPickPackage(pkg.id)}
                      className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold">{pkg.name}</span>
                        <span className="block text-[13px] text-muted-foreground">
                          {pkg.creditsIssued} {pkg.creditsIssued === 1 ? "session" : "sessions"} ·
                          Use within {validityLabel(pkg.validity)}
                        </span>
                      </span>
                      <span className="text-[16px] font-semibold">
                        {formatMoney(pkg.priceMinor, pkg.currency)}
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </ClientCard>
          </div>
        ) : null}

        {showAbout ? (
          <div className="mt-6">
            <SectionLabel>About</SectionLabel>
            <ClientCard>
              <p className="whitespace-pre-line px-4 py-4 text-[15px] leading-relaxed">
                {page.about}
              </p>
            </ClientCard>
          </div>
        ) : null}

        {showStaff ? (
          <div className="mt-6">
            <SectionLabel>Team</SectionLabel>
            <ClientCard>
              <ul className="divide-y divide-border">
                {staff.map((person) => (
                  <li key={person.id} className="flex items-start gap-3 px-4 py-3.5">
                    <PersonMark name={person.displayName} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold">{person.displayName}</p>
                      {person.title ? (
                        <p className="text-[13px] text-muted-foreground">{person.title}</p>
                      ) : null}
                      {person.bio ? (
                        <p className="mt-1 text-[14px] leading-relaxed text-foreground/80">
                          {person.bio}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </ClientCard>
          </div>
        ) : null}

        {showLocation ? (
          <div className="mt-6">
            <SectionLabel>Location and parking</SectionLabel>
            <ClientCard>
              <div className="flex items-start gap-3 px-4 py-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {locations
                    .filter((l) => l.type === "physical")
                    .map((l) => (
                      <p key={l.id} className="text-[16px] font-semibold">
                        {l.name}
                      </p>
                    ))}
                  {address ? <p className="text-[15px] text-muted-foreground">{address}</p> : null}
                  {page.venue.parkingNote ? (
                    <p className="mt-1 text-[14px] text-foreground/80">{page.venue.parkingNote}</p>
                  ) : null}
                </div>
                {address && !preview ? (
                  <a
                    href={directionsUrl(address)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-[13px] font-semibold hover:bg-muted"
                  >
                    <Navigation className="h-4 w-4" />
                    Directions
                  </a>
                ) : null}
              </div>
            </ClientCard>
          </div>
        ) : null}

        {sectionEnabled(page, "reviews") && preview ? (
          <div className="mt-6">
            <SectionLabel
              trailing={<span className="text-[12px] text-muted-foreground">From Google</span>}
            >
              What clients say
            </SectionLabel>
            <ClientCard>
              <div className="flex items-center gap-2 px-4 py-4 text-[14px] text-muted-foreground">
                <Star className="h-4 w-4 text-amber-500" />
                Reviews appear here once a Google Business Profile is connected.
              </div>
            </ClientCard>
          </div>
        ) : null}

        <PoweredBy />
      </ClientColumn>

      {preview ? null : (
        <BottomBar>
          <BarSummary
            caption={nextAvailable ? "Next available" : "Book online"}
            value={nextAvailable ? nextAvailable.label : "Pick a session"}
          />
          <PrimaryButton onClick={onBookNow} disabled={services.length === 0}>
            Book now
          </PrimaryButton>
        </BottomBar>
      )}
    </div>
  );
}

function ServiceList({
  services,
  locations,
  onPick,
}: {
  services: PublicService[];
  locations: PublicLocation[];
  onPick: (serviceId: string) => void;
}) {
  const online = locations.length > 0 && locations.every((l) => l.type !== "physical");
  return (
    <ClientCard>
      <ul className="divide-y divide-border">
        {services.map((service) => (
          <li key={service.id}>
            <button
              type="button"
              onClick={() => onPick(service.id)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold">{service.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {formatDuration(service.durationMinutes)}
                  {online ? " · Online" : locations.length > 0 ? " · In person" : ""}
                </span>
              </span>
              <span className="text-[16px] font-semibold">
                {service.basePriceMinor === 0
                  ? "Free"
                  : formatMoney(service.basePriceMinor, service.currency)}
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </ClientCard>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PersonMark({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-foreground",
        className,
      )}
      aria-hidden
    >
      {letters || "?"}
    </span>
  );
}
