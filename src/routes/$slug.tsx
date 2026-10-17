import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { BookingFlow } from "@/components/BookingFlow";
import { ClientBookingFlow, type BookingStart } from "@/components/client/ClientBookingFlow";
import { ClientTheme, OutlineButton, PoweredBy, StudioMark } from "@/components/client/ClientPage";
import { Wordmark } from "@/components/Wordmark";
import { closedBusinessFromError, usePublicBusiness, usePublicPackageLink } from "@/lib/api/hooks";
import { rememberCameFrom } from "@/lib/auth/came-from";
import { DEFAULT_BOOKING_PAGE, normaliseBookingPage } from "@/lib/client-theme";

/**
 * `?offer=<code>` is an offer link the studio shared: the page shows it in its Offers
 * section (a private link, which keeps the visitor to what it names, still opens on
 * its own). `?package=<id>` buys one package from the landing's Packages list, with
 * `offer` alongside when it came from an offer so the offer's price is charged.
 * `?service=` (with optional `location`, `date` and `start`) is how
 * the account hands a client straight to a session, day or time they picked
 * there; those are consumed on arrival and dropped from the address bar. Stripe's
 * redirect parameters share this search space and are read straight off the URL,
 * so they are left unlisted here.
 */
const searchSchema = z.object({
  offer: z.string().min(1).optional(),
  package: z.string().min(1).optional(),
  service: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  start: z.string().min(1).optional(),
});

/**
 * A studio's booking page at `book.recavo.app/<their-slug>`.
 *
 * This sits at the root of the path space, which is the reason
 * `RESERVED_SLUGS` exists on the API side. The router resolves a static
 * segment ahead of this dynamic one, so `/login` and `/settings` are safe by
 * construction; the reserved list is what stops a studio from claiming a slug
 * that a future page would then hide.
 */
export const Route = createFileRoute("/$slug")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Book a session — RECAVO" },
      {
        name: "description",
        content:
          "Book a session online in a couple of minutes — choose a service, time and pay securely.",
      },
    ],
  }),
  component: SlugBookingPage,
});

function SlugBookingPage() {
  const { slug } = Route.useParams();
  const { offer, package: packageId, service, location, date, start } = Route.useSearch();
  const navigate = useNavigate();
  const business = usePublicBusiness(slug);
  // Resolved here to tell a private offer (its own page) from one the landing shows.
  const offerLink = usePublicPackageLink(business.data?.id, offer);

  // Read once on arrival: the flow keeps its own state from here, and a refresh
  // or Back should not drop the person onto the same pre-filled step again.
  const [handOff] = useState<BookingStart | null>(() =>
    service
      ? {
          serviceId: service,
          locationId: location ?? null,
          date: date ?? null,
          startAt: start ?? null,
        }
      : null,
  );

  // The sign-in page offers "Back to {business}" to anyone who came from here.
  const currentSlug = business.data?.slug;
  const tradingName = business.data?.tradingName;
  useEffect(() => {
    if (currentSlug && tradingName) rememberCameFrom({ slug: currentSlug, name: tradingName });
  }, [currentSlug, tradingName]);

  // An old link still works, but the address bar should show the current one.
  const redirectedFrom = business.data?.redirectedFromSlug ?? null;
  useEffect(() => {
    if (!currentSlug || !redirectedFrom || currentSlug === slug) return;
    void navigate({
      to: "/$slug",
      params: { slug: currentSlug },
      search: (prev) => prev,
      replace: true,
    });
  }, [currentSlug, redirectedFrom, slug, navigate]);

  // A revoked offer link is an ordinary outcome: say so once and show the full page.
  const offerGone = Boolean(offer) && offerLink.isError;
  useEffect(() => {
    if (!offerGone) return;
    toast.error(
      `That offer link is no longer active, so here is everything${tradingName ? ` ${tradingName}` : ""} offers.`,
    );
    void navigate({ to: "/$slug", params: { slug }, search: {}, replace: true });
  }, [offerGone, tradingName, slug, navigate]);

  if (business.isError) {
    const closed = closedBusinessFromError(business.error);
    if (closed) return <NotTakingBookings name={closed.tradingName} logoUrl={closed.logoUrl} />;
    return <NoSuchPage />;
  }
  if (!business.data) return <ResolvingPage />;

  // The offer they came by stays in the address bar through the flow's own clean-ups.
  const keepOffer = offer ? { offer } : {};

  const page = normaliseBookingPage(business.data.page);

  if (offer && offerLink.isPending) return <ResolvingPage />;
  const privateOffer = Boolean(offer) && offerLink.data?.link.showFullCatalogue === false;

  // Package purchases and private offers still run through the catalogue flow.
  if (packageId || privateOffer) {
    return (
      <BookingFlow
        businessId={business.data.id}
        studio={business.data}
        offerCode={offer ?? null}
        initialPackageId={packageId ?? null}
        onClearRedirectParams={() =>
          void navigate({
            to: "/$slug",
            params: { slug },
            search: offer ? { offer } : {},
            replace: true,
          })
        }
        onLeaveOffer={() => void navigate({ to: "/$slug", params: { slug }, search: {} })}
      />
    );
  }

  return (
    <ClientBookingFlow
      business={business.data}
      page={page}
      start={handOff}
      offerCode={offerLink.isSuccess ? (offer ?? null) : null}
      onStarted={() =>
        void navigate({ to: "/$slug", params: { slug }, search: keepOffer, replace: true })
      }
      onClearRedirectParams={() =>
        void navigate({ to: "/$slug", params: { slug }, search: keepOffer, replace: true })
      }
      onPickPackage={(id) =>
        void navigate({ to: "/$slug", params: { slug }, search: { package: id } })
      }
      onPickOfferPackage={(code, id) =>
        void navigate({ to: "/$slug", params: { slug }, search: { offer: code, package: id } })
      }
    />
  );
}

function ResolvingPage() {
  return (
    <ClientTheme page={DEFAULT_BOOKING_PAGE}>
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-2xl px-4 pt-3 sm:px-6 sm:pt-6" aria-busy>
          <div className="aspect-[390/300] w-full animate-pulse rounded-[28px] bg-card sm:aspect-[3/1]" />
          <div className="mt-5 h-9 w-2/3 animate-pulse rounded-lg bg-card" />
          <div className="mt-2 h-5 w-1/2 animate-pulse rounded-lg bg-card" />
          <div className="mt-6 space-y-2">
            <div className="h-16 animate-pulse rounded-[18px] bg-card" />
            <div className="h-16 animate-pulse rounded-[18px] bg-card" />
            <div className="h-16 animate-pulse rounded-[18px] bg-card" />
          </div>
        </div>
      </main>
    </ClientTheme>
  );
}

/** The business exists but has stopped taking online bookings. */
function NotTakingBookings({ name, logoUrl }: { name: string | null; logoUrl: string | null }) {
  const navigate = useNavigate();
  const title = name ?? "This business";
  return (
    <ClientTheme page={DEFAULT_BOOKING_PAGE}>
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <StudioMark name={title} logoUrl={logoUrl} size="lg" />
        <h1
          className="mt-6 max-w-sm text-[26px] font-bold leading-tight tracking-tight"
          style={{ fontFamily: "var(--client-font-display)", fontWeight: 650 }}
        >
          {title} isn't taking online bookings right now
        </h1>
        <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">
          Already booked? Your bookings are safe in your account.
        </p>
        <OutlineButton
          className="mt-8 w-full max-w-xs"
          onClick={() => void navigate({ to: "/account" })}
        >
          Go to my account
        </OutlineButton>
        <PoweredBy />
      </main>
    </ClientTheme>
  );
}

/** Nothing matches the link: never existed, mistyped, or a business long gone. */
function NoSuchPage() {
  return (
    <main className="screen-center bg-background px-safe-4">
      <div className="max-w-md text-center">
        <Wordmark />
        <h1 className="mt-6 text-lg font-semibold">We couldn't find this booking page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Check the link with the business. They may have changed it.
        </p>
      </div>
    </main>
  );
}
