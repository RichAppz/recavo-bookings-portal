import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarPlus,
  ChevronDown,
  MessageSquare,
  Minus,
  Package,
  Plus,
  ShieldOff,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { BookingPanel } from "@/components/BookingPanel";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState, PersonAvatar, SectionCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useTenant } from "@/lib/tenant/tenant-context";
import {
  useAddCustomerNote,
  useAdjustEntitlement,
  useCustomer,
  useCustomerBookings,
  useCustomerCredits,
  useCustomerNotes,
  useEntitlementLedger,
  useMessages,
  useOpenConversation,
  usePackages,
  usePayments,
  useSendMessage,
  useUpdateCustomerStatus,
  uploadFileViaIntent,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import { customerDisplayName, type EntitlementView } from "@/lib/api/types";
import { formatInTz, formatMoney, ukDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Client profile — RECAVO" },
      {
        name: "description",
        content:
          "Full client profile: upcoming bookings, package credits, ledger, payment history, notes and messages.",
      },
      { property: "og:title", content: "RECAVO client profile" },
      {
        property: "og:description",
        content: "Bookings, credits, payments and notes for a single client.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ClientProfile />
      </AppShell>
    </RequireAuth>
  ),
});

function ClientProfile() {
  const { clientId } = Route.useParams();
  const tenant = useTenant();
  const [quick, setQuick] = useState<QuickAction>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const customer = useCustomer(clientId);
  const bookings = useCustomerBookings(clientId);
  const credits = useCustomerCredits(clientId);
  const packages = usePackages();
  const payments = usePayments({ customerId: clientId });
  const notes = useCustomerNotes(clientId);
  const addNote = useAddCustomerNote(clientId);
  const updateStatus = useUpdateCustomerStatus();

  if (customer.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading client…</p>;
  }

  if (customer.isError || !customer.data) {
    return (
      <EmptyState
        title="Client not found"
        description={
          customer.error instanceof ApiError
            ? customer.error.detail || customer.error.title
            : "This client may have been removed."
        }
        action={
          <Button asChild>
            <Link to="/clients">Back to clients</Link>
          </Button>
        }
      />
    );
  }

  const client = customer.data;
  const now = new Date().toISOString();
  const upcoming = (bookings.data ?? [])
    .filter(
      (b) =>
        b.start >= now &&
        b.status !== "cancelled_by_customer" &&
        b.status !== "cancelled_by_business" &&
        b.status !== "expired",
    )
    .sort((a, b) => a.start.localeCompare(b.start));

  const totalCredits = (credits.data ?? []).reduce((sum, e) => sum + e.balance.available, 0);
  const lifetimeSpendMinor = (payments.data?.payments ?? [])
    .filter((p) => p.state === "succeeded" || p.state === "partially_refunded")
    .reduce((sum, p) => sum + p.amountMinor - p.amountRefundedMinor, 0);

  return (
    <>
      <Link
        to="/clients"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All clients
      </Link>

      <div className="surface-card flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
        <PersonAvatar name={customerDisplayName(client)} size={72} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{customerDisplayName(client)}</h1>
            <StatusBadge status={client.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[client.emailDisplay, client.phoneDisplay].filter(Boolean).join(" · ")} · Client since{" "}
            {ukDate(client.createdAt.slice(0, 10))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setQuick("message")}>
            <MessageSquare className="size-4" /> Message
          </Button>
          <Button variant="outline" onClick={() => setQuick("package")}>
            <Package className="size-4" /> Sell package
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              className="sr-only"
              disabled={uploading || !tenant.businessId}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || !tenant.businessId) return;
                setUploading(true);
                try {
                  await uploadFileViaIntent(tenant.businessId, file, {
                    ownerType: "customer",
                    ownerId: client.id,
                  });
                  toast.success("File uploaded");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setUploading(false);
                }
              }}
            />
            <Button variant="outline" asChild disabled={uploading}>
              <span>{uploading ? "Uploading…" : "Upload file"}</span>
            </Button>
          </label>
          <Button onClick={() => setBookingOpen(true)}>
            <CalendarPlus className="size-4" /> Create booking
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total bookings", String((bookings.data ?? []).length)],
          ["Upcoming bookings", String(upcoming.length)],
          ["Lifetime spend", formatMoney(lifetimeSpendMinor, tenant.business?.currency ?? "GBP")],
          ["Credit balance", `${totalCredits} credits`],
        ].map(([label, value]) => (
          <div key={label} className="surface-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList className="flex-wrap">
          <TabsTrigger value="upcoming">Upcoming bookings</TabsTrigger>
          <TabsTrigger value="packages">Packages and credits</TabsTrigger>
          <TabsTrigger value="payments">Payment history</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {bookings.isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading bookings…</p>
            ) : upcoming.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No upcoming bookings"
                  description={`${customerDisplayName(client)} has nothing in the diary. Create a booking to get them back in.`}
                  action={<Button onClick={() => setBookingOpen(true)}>Create booking</Button>}
                />
              </div>
            ) : (
              <ul className="divide-y">
                {upcoming.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => setSelectedBookingId(b.id)}
                      className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left hover:bg-secondary/50"
                    >
                      <div className="w-40">
                        <p className="text-sm font-semibold">
                          {formatInTz(b.start, b.timezone, { dateStyle: "medium" })}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatInTz(b.start, b.timezone, { timeStyle: "short" })}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{b.serviceSnapshot.name}</p>
                      </div>
                      <StatusBadge status={b.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="packages" className="mt-4 space-y-6">
          <SectionCard title="Packages and credits" bodyClassName="p-0">
            {credits.isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading credits…</p>
            ) : credits.isError ? (
              <div className="p-6">
                <EmptyState title="Couldn't load credits" description="Please try again shortly." />
              </div>
            ) : (credits.data ?? []).length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No packages"
                  description="Sell a package to add credits to this account."
                />
              </div>
            ) : (
              <div className="divide-y">
                {(credits.data ?? []).map((view) => (
                  <EntitlementRow
                    key={view.entitlement.id}
                    view={view}
                    packageName={
                      packages.data?.find((p) => p.id === view.entitlement.packageId)?.name ??
                      "Package"
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {payments.isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading payments…</p>
            ) : (payments.data?.payments ?? []).length === 0 ? (
              <div className="p-6">
                <EmptyState title="No payments recorded" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs text-muted-foreground">
                  <tr>
                    {["Date", "Provider ref", "Amount", "Refunded", "Status", "Receipt"].map(
                      (h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(payments.data?.payments ?? []).map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {ukDate(p.createdAt.slice(0, 10))}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {p.providerPaymentId ?? p.id}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(p.amountMinor, p.currency)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(p.amountRefundedMinor, p.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.state} />
                      </td>
                      <td className="px-4 py-3">
                        {p.receiptUrl ? (
                          <a
                            href={p.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <SectionCard title="Internal notes" description="Only visible to your team">
            <div className="space-y-3">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a training note, injury update or preference…"
              />
              <Button
                disabled={addNote.isPending}
                onClick={async () => {
                  if (!note.trim()) return toast.error("Write a note first");
                  await addNote.mutateAsync(note);
                  setNote("");
                  toast.success("Note added");
                }}
              >
                Save note
              </Button>
            </div>
            <ul className="mt-6 space-y-4">
              {(notes.data ?? []).map((n) => (
                <li key={n.id} className="rounded-xl border p-4">
                  <p className="text-sm">{n.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ukDate(n.createdAt.slice(0, 10))}
                  </p>
                </li>
              ))}
              {(notes.data ?? []).length === 0 ? (
                <EmptyState
                  title="No notes yet"
                  description="Notes help the whole team coach consistently."
                />
              ) : null}
            </ul>
          </SectionCard>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <ClientMessages customerId={client.id} />
        </TabsContent>
      </Tabs>

      <div>
        <Button
          variant="outline"
          disabled={updateStatus.isPending}
          onClick={() =>
            updateStatus.mutate({
              customerId: client.id,
              version: client.version,
              status: client.status === "active" ? "archived" : "active",
            })
          }
        >
          <ShieldOff className="size-4" />
          {client.status === "active" ? "Archive client" : "Reactivate client"}
        </Button>
      </div>

      <AddBookingModal
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        defaultCustomerId={client.id}
      />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} customerId={client.id} />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
    </>
  );
}

function EntitlementRow({ view, packageName }: { view: EntitlementView; packageName: string }) {
  const [showLedger, setShowLedger] = useState(false);
  const ledger = useEntitlementLedger(showLedger ? view.entitlement.id : undefined);
  const adjust = useAdjustEntitlement();

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{packageName}</p>
          <p className="text-xs text-muted-foreground">
            Expires {ukDate(view.entitlement.expiresAt.slice(0, 10))} · issued{" "}
            {view.entitlement.unitsIssued}
          </p>
        </div>
        <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary tabular-nums">
          {view.balance.available} available
        </span>
        <StatusBadge status={view.entitlement.status} />
        <Button
          variant="outline"
          size="sm"
          disabled={adjust.isPending}
          onClick={() =>
            adjust.mutate({
              entitlementId: view.entitlement.id,
              signedUnits: 1,
              reasonCode: "manual_add",
            })
          }
        >
          <Plus className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={adjust.isPending || view.balance.available <= 0}
          onClick={() =>
            adjust.mutate({
              entitlementId: view.entitlement.id,
              signedUnits: -1,
              reasonCode: "manual_remove",
            })
          }
        >
          <Minus className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowLedger((v) => !v)}>
          <ChevronDown
            className={`size-4 transition-transform ${showLedger ? "rotate-180" : ""}`}
          />{" "}
          Ledger
        </Button>
      </div>
      {showLedger ? (
        <ul className="mt-3 space-y-2 border-t pt-3">
          {(ledger.data?.entries ?? []).map((entry) => (
            <li key={entry.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {entry.type.replace(/_/g, " ")} · {ukDate(entry.occurredAt.slice(0, 10))}
              </span>
              <span className="font-medium tabular-nums">
                {entry.type.startsWith("adjusted_negative") ||
                entry.type === "consumed" ||
                entry.type === "expired"
                  ? `-${entry.units}`
                  : `+${entry.units}`}
              </span>
            </li>
          ))}
          {ledger.isLoading ? (
            <li className="text-xs text-muted-foreground">Loading ledger…</li>
          ) : null}
          {!ledger.isLoading && (ledger.data?.entries ?? []).length === 0 ? (
            <li className="text-xs text-muted-foreground">No ledger activity yet.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function ClientMessages({ customerId }: { customerId: string }) {
  const [reply, setReply] = useState("");
  const openConversation = useOpenConversation();
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    openConversation.mutate({ customerId }, { onSuccess: (conv) => setConversationId(conv.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const messages = useMessages(conversationId ?? undefined);
  const sendMessage = useSendMessage(conversationId ?? undefined);

  return (
    <SectionCard title="Conversation">
      {!conversationId ? (
        <p className="text-sm text-muted-foreground">Opening conversation…</p>
      ) : (
        <>
          <ul className="space-y-3">
            {(messages.data?.messages ?? []).map((m) => (
              <li
                key={m.id}
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.senderType === "staff"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-secondary"
                }`}
              >
                <p>{m.body}</p>
                <p className="mt-1 text-[11px] opacity-70">{ukDate(m.createdAt.slice(0, 10))}</p>
              </li>
            ))}
            {(messages.data?.messages ?? []).length === 0 ? (
              <EmptyState
                title="No messages yet"
                description="Say hello to start the conversation."
              />
            ) : null}
          </ul>
          <div className="mt-4 flex gap-2">
            <Input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply…"
            />
            <Button
              disabled={sendMessage.isPending}
              onClick={async () => {
                if (!reply.trim()) return;
                await sendMessage.mutateAsync(reply);
                setReply("");
                toast.success("Message sent");
              }}
            >
              Send
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
