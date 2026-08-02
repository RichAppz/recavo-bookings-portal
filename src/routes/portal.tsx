import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CalendarX, LogOut, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PersonAvatar, StatusBadge } from "@/components/ui-bits";
import { Wordmark } from "@/components/Wordmark";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useAuth } from "@/lib/auth/auth-store";
import { api, newIdempotencyKey, toastApiError } from "@/lib/api";
import type { Booking } from "@/lib/api/types";
import { formatInTz, formatMoney } from "@/lib/format";
import { toast } from "sonner";

const searchSchema = z.object({
  businessId: z.string().optional(),
});

type PortalCustomer = {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string | null;
  emailDisplay: string | null;
  phoneDisplay: string | null;
};

export const Route = createFileRoute("/portal")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "My account — RECAVO" },
      { name: "description", content: "View and manage your upcoming sessions." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <PortalShell />
    </RequireAuth>
  ),
});

function PortalShell() {
  const { businessId } = Route.useSearch();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-nav text-nav-foreground">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Wordmark compact />
          <span className="text-sm font-medium">My account</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-nav-foreground hover:text-nav-foreground"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-5 py-8">
        {!businessId ? (
          <EmptyState
            title="Missing business"
            description="This account link is missing a business id. Please use the link provided by your studio."
          />
        ) : (
          <PortalContent businessId={businessId} />
        )}
      </div>
    </div>
  );
}

function PortalContent({ businessId }: { businessId: string }) {
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ["portal", "me", businessId],
    queryFn: async () => {
      const res = await api.get<{ customer: PortalCustomer }>("/api/v1/portal/me", {
        query: { businessId },
      });
      return res.data.customer;
    },
  });

  const bookings = useQuery({
    queryKey: ["portal", "bookings", businessId],
    queryFn: async () => {
      const res = await api.get<{ bookings: Booking[] }>("/api/v1/portal/bookings", {
        query: { businessId },
      });
      return res.data.bookings;
    },
  });

  const cancelBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      await api.post(
        `/api/v1/portal/bookings/${bookingId}/cancel`,
        {},
        { query: { businessId }, idempotencyKey: newIdempotencyKey() },
      );
    },
    onSuccess: () => {
      toast.success("Booking cancelled");
      void qc.invalidateQueries({ queryKey: ["portal", "bookings", businessId] });
    },
    onError: (err) => toastApiError(err),
  });

  const now = new Date().toISOString();
  const upcoming = (bookings.data ?? [])
    .filter(
      (b) =>
        b.start >= now &&
        b.status !== "cancelled_by_customer" &&
        b.status !== "cancelled_by_business",
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const past = (bookings.data ?? [])
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => b.start.localeCompare(a.start));

  return (
    <>
      {me.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your account…</p>
      ) : me.isError ? (
        <EmptyState
          title="Couldn't load your account"
          description="Please sign in again or contact the studio."
        />
      ) : me.data ? (
        <div className="surface-card flex items-center gap-4 p-5">
          <PersonAvatar name={`${me.data.firstName} ${me.data.lastName ?? ""}`} size={56} />
          <div>
            <h1 className="text-lg font-semibold">
              {me.data.firstName} {me.data.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {me.data.emailDisplay ?? me.data.phoneDisplay ?? ""}
            </p>
          </div>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Upcoming sessions</h2>
        {bookings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your sessions…</p>
        ) : bookings.isError ? (
          <EmptyState title="Couldn't load your bookings" description="Please try again shortly." />
        ) : upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming sessions"
            description="Book your next session with your studio."
          />
        ) : (
          <ul className="space-y-3">
            {upcoming.map((b) => (
              <li key={b.id} className="surface-card flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-medium">{b.serviceSnapshot.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {formatInTz(b.start, b.timezone, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <p className="mt-1 text-xs font-medium">
                    {formatMoney(b.priceMinor, b.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.status === "confirmed" || b.status === "awaiting_payment" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancelBooking.isPending}
                      onClick={() => cancelBooking.mutate(b.id)}
                    >
                      <CalendarX className="size-4" /> Cancel
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Past sessions</h2>
          <ul className="space-y-3">
            {past.slice(0, 10).map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-4 rounded-xl border p-4 text-sm"
              >
                <div>
                  <p className="font-medium">{b.serviceSnapshot.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" />{" "}
                    {formatInTz(b.start, b.timezone, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
