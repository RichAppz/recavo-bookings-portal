import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { BookingFlow } from "@/components/BookingFlow";
import { usePublicBusiness } from "@/lib/api/hooks";

const searchSchema = z.object({
  businessId: z.string().optional(),
});

/**
 * The booking link as it was before studios had short ones: `/book?businessId=<uuid>`.
 *
 * These are already out in sent emails and Stripe receipts and cannot be
 * recalled, so the page still works. It resolves the studio and forwards to
 * `/<slug>`, which is what anyone who bookmarks or shares from here should get.
 */
export const Route = createFileRoute("/book")({
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
  component: LegacyBookingLink,
});

/**
 * Stripe sends the customer back here after 3-D Secure with the outcome in the
 * query string. Forwarding at that moment would drop it and lose the payment,
 * so a return in progress finishes where it started.
 */
function isReturningFromPayment(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("redirect_status") || params.has("payment_intent");
}

function LegacyBookingLink() {
  const { businessId } = Route.useSearch();
  const navigate = useNavigate();
  const business = usePublicBusiness(businessId, "id");
  const slug = business.data?.slug;

  useEffect(() => {
    if (!slug || isReturningFromPayment()) return;
    void navigate({ to: "/$slug", params: { slug }, replace: true });
  }, [slug, navigate]);

  if (!businessId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Missing business</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This booking link is missing a business id. Please use the link provided by your studio.
          </p>
        </div>
      </main>
    );
  }

  return (
    <BookingFlow
      businessId={businessId}
      studio={business.data ?? null}
      onClearRedirectParams={() =>
        void navigate({ to: "/book", search: { businessId }, replace: true })
      }
    />
  );
}
