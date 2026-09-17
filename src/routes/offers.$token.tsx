import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Clock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageGhost } from "@/components/ghost";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { usePublicUpsellOffer, useRequestUpsell } from "@/lib/api/upsells";
import type { PublicUpsellOfferPage } from "@/lib/api/upsells";
import { formatDuration, formatInTz, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/offers/$token")({
  component: OfferPage,
  head: () => ({
    meta: [
      { title: "Add extras to your booking — RECAVO" },
      {
        name: "description",
        content: "A few extras you could add to your upcoming booking.",
      },
    ],
  }),
});

/**
 * The page behind the link in the add-on offer email (staff-made bookings). The
 * customer ticks the extras they want and asks for them; nothing is added or charged
 * here — the business confirms and adds it to the booking. No account needed: the
 * token in the link is the whole identity.
 */
function OfferPage() {
  const { token } = Route.useParams();
  const page = usePublicUpsellOffer(token);
  const request = useRequestUpsell(token);
  const [picked, setPicked] = useState<string[]>([]);

  // Start from whatever they already asked for, so a revisit shows their choice.
  useEffect(() => {
    if (page.data) setPicked([...page.data.offer.requestedServiceIds]);
  }, [page.data?.offer.requestedServiceIds, page.data]);

  if (page.isError) {
    return (
      <Shell business={null}>
        <div className="surface-card p-6 text-center">
          <h1 className="text-lg font-semibold">This link no longer works</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {page.error instanceof ApiError && page.error.status === 404
              ? "It may have been mistyped or the offer has been withdrawn. The business can help if you'd still like to add something."
              : "We couldn't load this offer just now. Please try again in a moment."}
          </p>
        </div>
      </Shell>
    );
  }
  if (!page.data) {
    return (
      <Shell business={null}>
        <PageGhost />
      </Shell>
    );
  }

  const { offer, open, booking, customerFirstName, business } = page.data;
  const currency = offer.offered[0]?.currency ?? business.currency;
  const pickedTotal = offer.offered
    .filter((o) => picked.includes(o.serviceId))
    .reduce((sum, o) => sum + o.priceMinor, 0);
  const already = offer.status === "requested";
  const unchanged =
    already &&
    picked.length === offer.requestedServiceIds.length &&
    picked.every((id) => offer.requestedServiceIds.includes(id));
  const when = booking
    ? formatInTz(booking.start, booking.timezone, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const submit = async () => {
    try {
      await request.mutateAsync(picked);
      toast.success("Request sent", {
        description: `${business.tradingName} will confirm and add it to your booking.`,
      });
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.isConflict
          ? "This offer is no longer open."
          : "We couldn't send your request. Please try again.",
      );
    }
  };

  return (
    <Shell business={business}>
      <div className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {closedHeading(offer.status, open)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {customerFirstName ? `Hi ${customerFirstName} — ` : ""}
            {booking ? (
              <>
                your <span className="font-medium text-foreground">{booking.serviceName}</span> is
                booked for <span className="font-medium text-foreground">{when}</span>
                {open ? ". While we're at it, you could add:" : "."}
              </>
            ) : (
              "here are the extras on offer."
            )}
          </p>
        </div>

        {!open ? <ClosedNotice status={offer.status} /> : null}

        <div className="grid gap-2">
          {offer.offered.map((o) => {
            const on = picked.includes(o.serviceId);
            const wasRequested = offer.requestedServiceIds.includes(o.serviceId);
            return (
              <button
                key={o.serviceId}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!open}
                onClick={() =>
                  setPicked((ids) =>
                    on ? ids.filter((id) => id !== o.serviceId) : [...ids, o.serviceId],
                  )
                }
                className={`surface-card flex items-start justify-between gap-4 p-4 text-left transition disabled:cursor-default ${
                  on ? "ring-2 ring-primary" : open ? "hover:bg-secondary" : "opacity-80"
                }`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      aria-hidden
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      }`}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    {o.name}
                    {!open && wasRequested ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        requested
                      </span>
                    ) : null}
                  </span>
                  {o.pitch ? (
                    <span className="mt-1 block text-sm text-muted-foreground">{o.pitch}</span>
                  ) : null}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    +{formatDuration(o.durationMinutes)} on the day
                  </span>
                </span>
                <span className="shrink-0 text-lg font-semibold whitespace-nowrap">
                  {formatMoney(o.priceMinor, o.currency)}
                </span>
              </button>
            );
          })}
        </div>

        {open ? (
          <div className="surface-card space-y-3 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Extras selected</span>
              <span className="font-semibold">
                {picked.length === 0 ? "None" : `+${formatMoney(pickedTotal, currency)}`}
              </span>
            </div>
            <Button
              size="xl"
              className="w-full"
              disabled={picked.length === 0 || unchanged || request.isPending}
              onClick={() => void submit()}
            >
              <Sparkles className="size-4" />
              {request.isPending
                ? "Sending…"
                : already
                  ? unchanged
                    ? "Request sent"
                    : "Update my request"
                  : picked.length > 1
                    ? "Request these extras"
                    : "Request this extra"}
            </Button>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              Nothing is charged now. {business.tradingName} will check it fits your slot, add it to
              your booking and send an updated confirmation.
            </p>
            {already ? (
              <p className="text-xs text-muted-foreground">
                You've already asked for{" "}
                {offer.offered
                  .filter((o) => offer.requestedServiceIds.includes(o.serviceId))
                  .map((o) => o.name)
                  .join(", ")}
                . Change the selection above to update it.
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          Booking reference {booking?.reference ?? "—"} ·{" "}
          <Link
            to="/$slug"
            params={{ slug: business.slug }}
            className="underline-offset-2 hover:underline"
          >
            Book something else at {business.tradingName}
          </Link>
        </p>
      </div>
    </Shell>
  );
}

function closedHeading(status: PublicUpsellOfferPage["offer"]["status"], open: boolean): string {
  if (open) return status === "requested" ? "Your request is in" : "Make the most of your visit";
  switch (status) {
    case "added":
      return "Added to your booking";
    case "declined":
      return "This request couldn't be added";
    case "expired":
      return "This offer has closed";
    default:
      return "This offer has closed";
  }
}

function ClosedNotice({ status }: { status: PublicUpsellOfferPage["offer"]["status"] }) {
  const text =
    status === "added"
      ? "The extras you asked for are on your booking — you'll have had an updated confirmation."
      : status === "declined"
        ? "The business wasn't able to fit this in. Get in touch with them if you'd like to arrange it another time."
        : "The booking has started or been changed, so extras can't be added from here any more.";
  return <div className="rounded-xl border bg-secondary px-4 py-3 text-sm">{text}</div>;
}

function Shell({
  business,
  children,
}: {
  business: PublicUpsellOfferPage["business"] | null;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <header className="pt-safe border-b bg-nav text-nav-foreground">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          {business?.branding.logoUrl ? (
            <img
              src={business.branding.logoUrl}
              alt=""
              className="size-9 shrink-0 rounded-md object-contain"
            />
          ) : null}
          <div className="min-w-0">
            {business ? (
              <p className="truncate text-base font-semibold tracking-tight">
                {business.tradingName}
              </p>
            ) : (
              <Wordmark />
            )}
            <p className="text-xs text-nav-foreground/70">Add extras to your booking</p>
          </div>
        </div>
      </header>
      <div className="pb-safe mx-auto w-full max-w-3xl p-4 sm:p-8">{children}</div>
    </main>
  );
}
