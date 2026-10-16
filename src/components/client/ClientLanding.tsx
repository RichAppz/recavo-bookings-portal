import type { ReactNode } from "react";
import { ChevronRight, MapPin, Navigation, Share, Star } from "lucide-react";
import { toast } from "sonner";
import {
  BarSummary,
  BottomBar,
  ClientCard,
  ClientColumn,
  ClientFooter,
  PoweredBy,
  PrimaryButton,
  SectionLabel,
  StudioMark,
} from "@/components/client/ClientPage";
import type {
  GoogleReview,
  PublicBusinessProfile,
  PublicLocation,
  PublicPackage,
  PublicReviews,
  PublicService,
  PublicStaff,
} from "@/lib/api/hooks";
import { directionsUrl } from "@/lib/calendar-links";
import { reviewsChipLabel, shortPlace } from "@/lib/client-booking";
import { hoursLabel, price } from "@/lib/client-journey";
import { headerStyle, sectionEnabled, type BookingPageContent } from "@/lib/client-theme";
import { formatDuration } from "@/lib/format";
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
  reviews = null,
  nextAvailable,
  onPickService,
  onPickPackage,
  onBookNow,
  onSignIn,
  signedInName,
  onAccount,
  cancellationWindowHours,
  preview = false,
  layout = "phone",
  selectedServiceId = null,
  selectedPackageId = null,
  bookingCard,
}: {
  business: Pick<PublicBusinessProfile, "tradingName" | "slug" | "branding" | "address">;
  page: BookingPageContent;
  services: PublicService[];
  packages: PublicPackage[];
  staff: PublicStaff[];
  locations: PublicLocation[];
  /** Google reviews already filtered to the page's star floor; null hides the section. */
  reviews?: PublicReviews | null;
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
  /**
   * Phone: a list that opens date and time. Desktop: content on the left and the
   * booking card on the right, with the sessions as radio rows. Passed in rather
   * than read from a media query so the editor's preview can show either.
   */
  layout?: "phone" | "desktop";
  selectedServiceId?: string | null;
  selectedPackageId?: string | null;
  /** The desktop booking card (calendar, times, Continue). */
  bookingCard?: ReactNode;
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
  const showReviews =
    sectionEnabled(page, "reviews") && reviews !== null && reviews.reviews.length > 0;
  const reviewsChip = sectionEnabled(page, "reviews") ? reviewsChipLabel(reviews) : null;
  const showAbout = sectionEnabled(page, "about") && Boolean(page.about?.trim());
  const showLocation =
    sectionEnabled(page, "location") && (Boolean(address) || Boolean(page.venue.parkingNote));
  const inPerson = locations.some((l) => l.type === "physical");
  const online = locations.some((l) => l.type !== "physical");
  const where = inPerson && online ? "In person or online" : online ? "Online" : "In person";
  const venue = locations.find((l) => l.type === "physical") ?? null;
  const place = shortPlace(address);
  const parkingChip = page.venue.parkingNote
    ? /free parking/i.test(page.venue.parkingNote)
      ? "Free parking"
      : "Parking info"
    : null;

  const header = (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-muted",
        layout === "desktop" ? "h-[280px] desk:h-[400px]" : "aspect-[390/300]",
      )}
      style={{
        ...headerStyle(page),
        borderRadius: layout === "desktop" ? "32px" : "var(--client-header-radius)",
      }}
    >
      <div className="absolute top-4 left-4">
        <StudioMark name={business.tradingName} logoUrl={business.branding.logoUrl} size="lg" />
      </div>
      <button
        type="button"
        onClick={() => void share()}
        aria-label="Share this page"
        disabled={preview}
        className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-sm transition hover:bg-white disabled:pointer-events-none"
      >
        <Share className="h-5 w-5" />
      </button>
    </div>
  );

  const bookNowBar = (
    <>
      <BarSummary
        caption={nextAvailable ? "Next available" : "Book online"}
        value={nextAvailable ? nextAvailable.label : "Pick a session"}
      />
      <PrimaryButton onClick={onBookNow} disabled={services.length === 0}>
        Book now
      </PrimaryButton>
    </>
  );

  if (layout === "desktop") {
    return (
      <div className="pb-4">
        <ClientColumn wide className="pt-2">
          {header}
          <div className="mt-8 grid grid-cols-1 items-start gap-10 desk:grid-cols-[minmax(0,1fr)_360px] desk:gap-12">
            <div className="min-w-0">
              <h1
                className="text-[44px] font-bold leading-[1.05] tracking-tight"
                style={{ fontFamily: "var(--client-font-display)", fontWeight: 650 }}
              >
                {business.tradingName}
              </h1>
              {page.description ? (
                <p className="mt-2 text-[17px] text-muted-foreground">{page.description}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {reviewsChip ? (
                  <Chip>
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    {reviewsChip}
                  </Chip>
                ) : null}
                {showStaff && staff.length > 1 ? <Chip>{staff.length} trainers</Chip> : null}
                {place ? <Chip>{place}</Chip> : locations.length > 0 ? <Chip>{where}</Chip> : null}
                {parkingChip ? <Chip>{parkingChip}</Chip> : null}
              </div>

              {preview ? null : signedInName ? (
                <button
                  type="button"
                  onClick={onAccount}
                  className="mt-6 flex w-full items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-left transition hover:bg-muted"
                >
                  <span>
                    <span className="block text-[15px] font-semibold">Hi {signedInName}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      Your bookings and credits are in your account
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              ) : null}

              <section className="mt-8 scroll-mt-6" id="sessions">
                <DesktopHeading>Sessions</DesktopHeading>
                {services.length === 0 && packages.length === 0 ? (
                  <ClientCard>
                    <p className="px-4 py-5 text-[15px] text-muted-foreground">
                      This business hasn't added any sessions yet.
                    </p>
                  </ClientCard>
                ) : (
                  <ClientCard>
                    {hasCategories(services) && groupByCategory(services).length > 1 ? (
                      groupByCategory(services).map((group) => (
                        <div key={group.category ?? "other"}>
                          {group.category ? (
                            <p className="border-b border-border bg-muted/40 px-5 py-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                              {group.category}
                            </p>
                          ) : null}
                          <RadioRows
                            services={group.items}
                            locations={locations}
                            selectedId={selectedServiceId}
                            onPick={onPickService}
                          />
                        </div>
                      ))
                    ) : (
                      <RadioRows
                        services={services}
                        locations={locations}
                        selectedId={selectedServiceId}
                        onPick={onPickService}
                      />
                    )}
                    {packages.length > 0 ? (
                      <ul className="divide-y divide-border border-t border-border">
                        {packages.map((pkg) => (
                          <li key={pkg.id}>
                            <RadioRow
                              active={selectedPackageId === pkg.id}
                              onClick={() => onPickPackage(pkg.id)}
                              title={pkg.name}
                              subtitle={`${pkg.creditsIssued} ${pkg.creditsIssued === 1 ? "session" : "sessions"} · Use within ${validityLabel(pkg.validity)}`}
                              price={price(pkg.priceMinor, pkg.currency)}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </ClientCard>
                )}
              </section>

              {showReviews ? (
                <section className="mt-10">
                  <DesktopHeading
                    trailing={
                      <GoogleLink reviews={reviews} preview={preview} className="text-[13px]" />
                    }
                  >
                    What clients say
                  </DesktopHeading>
                  <ul className="grid grid-cols-2 gap-3 min-[1100px]:grid-cols-3">
                    {reviews.reviews.slice(0, 6).map((review) => (
                      <li key={`${review.publishedAt}-${review.author}`}>
                        <ReviewCard review={review} className="h-full" />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {showAbout ? (
                <section className="mt-10">
                  <DesktopHeading>About</DesktopHeading>
                  <p className="max-w-[640px] whitespace-pre-line text-[16px] leading-relaxed text-foreground/85">
                    {page.about}
                  </p>
                </section>
              ) : null}

              {showStaff ? (
                <section className="mt-10">
                  <DesktopHeading>Trainers</DesktopHeading>
                  <ul className="flex flex-wrap gap-x-8 gap-y-4">
                    {staff.map((person) => (
                      <li key={person.id} className="flex items-center gap-3">
                        <PersonMark name={person.displayName} className="h-11 w-11 text-[13px]" />
                        <div>
                          <p className="text-[16px] font-semibold leading-tight">
                            {person.displayName}
                          </p>
                          {person.title ? (
                            <p className="text-[13px] text-muted-foreground">{person.title}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {showLocation ? (
                <section className="mt-10">
                  <DesktopHeading>Location and parking</DesktopHeading>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      {venue ? <p className="text-[16px] font-semibold">{venue.name}</p> : null}
                      {address ? (
                        <p className="text-[15px] text-muted-foreground">{address}</p>
                      ) : null}
                      {page.venue.parkingNote ? (
                        <p className="mt-1 text-[14px] text-foreground/80">
                          {page.venue.parkingNote}
                        </p>
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
                </section>
              ) : null}
            </div>

            <aside className="desk:sticky desk:top-6">{bookingCard}</aside>
          </div>

          <ClientFooter
            venue={[venue?.name, place].filter(Boolean).join(", ") || address || null}
          />
        </ClientColumn>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <ClientColumn className="pt-3">
        {header}

        <div className="mt-5">
          <h1
            className="text-[32px] font-bold leading-tight tracking-tight"
            style={{ fontFamily: "var(--client-font-display)", fontWeight: 650 }}
          >
            {business.tradingName}
          </h1>
          {page.description ? (
            <p className="mt-1 text-[17px] text-muted-foreground">{page.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {reviewsChip ? (
              <Chip>
                <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                {reviewsChip}
              </Chip>
            ) : null}
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
                        {price(pkg.priceMinor, pkg.currency)}
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </ClientCard>
          </div>
        ) : null}

        {showReviews ? (
          <div className="mt-6">
            <SectionLabel
              trailing={
                <GoogleLink reviews={reviews} preview={preview} className="text-[12px]" short />
              }
            >
              What clients say
            </SectionLabel>
            <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
              {reviews.reviews.map((review) => (
                <li
                  key={`${review.publishedAt}-${review.author}`}
                  className="w-[260px] shrink-0 snap-start"
                >
                  <ReviewCard review={review} className="h-full" />
                </li>
              ))}
            </ul>
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

        <PoweredBy />
      </ClientColumn>

      {preview ? (
        // The editor's phone frame is its own scroller, so the bar sticks to the
        // frame's bottom edge rather than the browser window's.
        <div className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex items-center justify-between gap-4 px-4 py-3">{bookNowBar}</div>
        </div>
      ) : (
        <BottomBar>{bookNowBar}</BottomBar>
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
                  : price(service.basePriceMinor, service.currency)}
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </ClientCard>
  );
}

/** 22px section title on the desktop landing (explicit, so the editor's scaled preview matches). */
function DesktopHeading({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2
        className="text-[22px] font-semibold leading-tight"
        style={{ fontFamily: "var(--client-font-display)" }}
      >
        {children}
      </h2>
      {trailing}
    </div>
  );
}

/** The desktop sessions list: one radio row per service, the chosen one filled in. */
function RadioRows({
  services,
  locations,
  selectedId,
  onPick,
}: {
  services: PublicService[];
  locations: PublicLocation[];
  selectedId: string | null;
  onPick: (serviceId: string) => void;
}) {
  const online = locations.length > 0 && locations.every((l) => l.type !== "physical");
  return (
    <ul className="divide-y divide-border" role="radiogroup" aria-label="Sessions">
      {services.map((service) => {
        const parts = [formatDuration(service.durationMinutes)];
        if (service.description?.trim()) parts.push(service.description.trim());
        else if (online) parts.push("Online");
        return (
          <li key={service.id}>
            <RadioRow
              active={selectedId === service.id}
              onClick={() => onPick(service.id)}
              title={service.name}
              subtitle={parts.join(" · ")}
              price={
                service.basePriceMinor === 0
                  ? "Free"
                  : price(service.basePriceMinor, service.currency)
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

function RadioRow({
  active,
  onClick,
  title,
  subtitle,
  price,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  price: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/60",
        active && "bg-primary-soft/40",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
          active ? "border-primary" : "border-input",
        )}
        aria-hidden
      >
        {active ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subtitle}</span>
      </span>
      <span className="shrink-0 text-[16px] font-semibold">{price}</span>
    </button>
  );
}

/** One Google review: stars, up to three lines of text, "Sarah K. · 2 weeks ago". */
function ReviewCard({ review, className }: { review: GoogleReview; className?: string }) {
  return (
    <ClientCard className={cn("flex flex-col px-4 py-3.5", className)}>
      <div className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(
              "h-3.5 w-3.5",
              n <= review.rating ? "fill-amber-500 text-amber-500" : "text-border",
            )}
          />
        ))}
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-[14px] leading-snug">{review.text}</p>
      <p className="mt-2.5 text-[12px] text-muted-foreground">
        {review.author}
        {review.relativeTime ? ` · ${review.relativeTime}` : ""}
      </p>
    </ClientCard>
  );
}

/** "All 86 reviews on Google" (or just "From Google" where space is tight). */
function GoogleLink({
  reviews,
  preview,
  className,
  short = false,
}: {
  reviews: PublicReviews;
  preview: boolean;
  className?: string;
  short?: boolean;
}) {
  const label =
    short || reviews.reviewCount === 0
      ? "From Google"
      : `All ${reviews.reviewCount} ${reviews.reviewCount === 1 ? "review" : "reviews"} on Google`;
  if (preview) {
    return <span className={cn("text-muted-foreground", className)}>{label}</span>;
  }
  return (
    <a
      href={reviews.mapsUrl}
      target="_blank"
      rel="noreferrer"
      className={cn("font-medium text-foreground underline underline-offset-2", className)}
    >
      {label}
    </a>
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
