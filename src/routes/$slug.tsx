import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookingFlow } from "@/components/BookingFlow";
import { PageGhost } from "@/components/ghost";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBusiness } from "@/lib/api/hooks";

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
  const navigate = useNavigate();
  const business = usePublicBusiness(slug);

  if (business.isError) return <NoSuchPage />;
  if (!business.data) return <ResolvingPage />;

  return (
    <BookingFlow
      businessId={business.data.id}
      studio={business.data}
      onClearRedirectParams={() => void navigate({ to: "/$slug", params: { slug }, replace: true })}
    />
  );
}

function ResolvingPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="flex h-16 items-center border-b px-4 sm:px-6">
        <Wordmark />
      </header>
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-8">
        <PageGhost />
      </div>
    </main>
  );
}

/**
 * Deliberately vague. A slug can 404 because it never existed, because the
 * studio renamed it, or because the studio is no longer trading, and it is not
 * this page's place to say which.
 */
function NoSuchPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <Wordmark />
        <h1 className="mt-6 text-lg font-semibold">This booking page isn't available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may have changed. Check with the studio for their current booking link.
        </p>
      </div>
    </main>
  );
}
