import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronDown,
  Copy,
  Download,
  Link2,
  MessageSquare,
  Minus,
  Package,
  Plus,
  ShieldOff,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { BookingPanel } from "@/components/BookingPanel";
import { FileAttachments } from "@/components/FileAttachments";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState, PersonAvatar, SectionCard, StatusBadge } from "@/components/ui-bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useAddCustomerConsent,
  useAddCustomerNote,
  useAdjustEntitlement,
  useAnonymiseCustomer,
  useAssignCustomerTag,
  useCreateCustomerTag,
  useCustomer,
  useCustomerBookings,
  useCustomerConsents,
  useCustomerCredits,
  useCustomerNotes,
  useCustomerTags,
  useCustomerTagsCatalogue,
  useEntitlementLedger,
  useLinkCustomerPortalUser,
  useMessages,
  useOpenConversation,
  usePackages,
  usePayments,
  useRemoveCustomerTag,
  useRequestCustomerDsarExport,
  useSendMessage,
  useUpdateCustomer,
  useUpdateCustomerStatus,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import { customerDisplayName, type Customer, type EntitlementView } from "@/lib/api/types";
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
  const isAnonymised = client.status === "anonymised";
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

      {isAnonymised ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            This client has been anonymised for privacy compliance. Personal details, tags and
            consents can no longer be edited.
          </p>
        </div>
      ) : null}

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
          <Button variant="outline" onClick={() => setQuick("message")} disabled={isAnonymised}>
            <MessageSquare className="size-4" /> Message
          </Button>
          <Button variant="outline" onClick={() => setQuick("package")} disabled={isAnonymised}>
            <Package className="size-4" /> Sell package
          </Button>
          <Button onClick={() => setBookingOpen(true)} disabled={isAnonymised}>
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
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="details">Details, tags &amp; consents</TabsTrigger>
          <TabsTrigger value="privacy">Portal &amp; privacy</TabsTrigger>
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
                disabled={isAnonymised}
              />
              <Button
                disabled={addNote.isPending || isAnonymised}
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

        <TabsContent value="files" className="mt-4">
          <SectionCard
            title="Attachments"
            description="Photos, waivers and other documents held against this client (RECA-504)."
          >
            <FileAttachments
              ownerType="customer"
              ownerId={client.id}
              canUpload={!isAnonymised && tenant.can(PERMISSIONS.CUSTOMER_UPDATE)}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="details" className="mt-4 space-y-6">
          <ClientDetailsTab client={client} disabled={isAnonymised} />
        </TabsContent>

        <TabsContent value="privacy" className="mt-4 space-y-6">
          <ClientPrivacyTab client={client} disabled={isAnonymised} />
        </TabsContent>
      </Tabs>

      <div>
        {isAnonymised ? (
          <p className="text-sm text-muted-foreground">
            Anonymised clients cannot be reactivated or archived.
          </p>
        ) : (
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
        )}
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

/** Writable preferred-contact values; historical `sms` rows fall back to "none" for editing. */
function toEditablePreferredChannel(value: string): "email" | "phone" | "none" {
  return value === "email" || value === "phone" || value === "none" ? value : "none";
}

function ClientDetailsTab({ client, disabled }: { client: Customer; disabled: boolean }) {
  const updateCustomer = useUpdateCustomer();
  const [firstName, setFirstName] = useState(client.firstName);
  const [lastName, setLastName] = useState(client.lastName ?? "");
  const [email, setEmail] = useState(client.emailDisplay ?? "");
  const [phone, setPhone] = useState(client.phoneDisplay ?? "");
  const [preferredChannel, setPreferredChannel] = useState(
    toEditablePreferredChannel(client.contactPreferences.preferredChannel),
  );
  const [marketingConsent, setMarketingConsent] = useState(client.marketingConsent.granted);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isLegacySms = client.contactPreferences.preferredChannel === "sms";

  const save = async () => {
    setFieldErrors({});
    try {
      await updateCustomer.mutateAsync({
        customerId: client.id,
        version: client.version,
        body: {
          firstName,
          lastName: lastName || null,
          email: email || null,
          phone: phone || null,
          preferredChannel,
          marketingConsent,
        },
      });
      toast.success("Client details saved");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setFieldErrors(
          Object.fromEntries(
            err.fieldErrors
              .filter((fe) => fe.field)
              .map((fe) => [fe.field, fe.message || fe.code || "Invalid"]),
          ),
        );
      }
    }
  };

  return (
    <>
      <SectionCard
        title="Contact details"
        description={
          disabled
            ? "This client is anonymised — details cannot be edited."
            : "Changes are saved under optimistic concurrency; if someone else updated this client first you'll be asked to retry."
        }
      >
        <fieldset disabled={disabled} className="grid gap-4 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="d-first">First name</Label>
              <Input
                id="d-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.firstName)}
              />
              {fieldErrors.firstName ? (
                <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-last">Last name</Label>
              <Input
                id="d-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.lastName)}
              />
              {fieldErrors.lastName ? (
                <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="d-email">Email</Label>
              <Input
                id="d-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email ? (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-phone">Mobile</Label>
              <Input
                id="d-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={Boolean(fieldErrors.phone)}
              />
              {fieldErrors.phone ? (
                <p className="text-xs text-destructive">{fieldErrors.phone}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <Label>Preferred contact channel</Label>
            <Select
              value={preferredChannel}
              onValueChange={(v) => setPreferredChannel(v as "email" | "phone" | "none")}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
            {isLegacySms ? (
              <p className="text-xs text-muted-foreground">
                Was set to SMS before that channel launched — choose a supported channel and save.
              </p>
            ) : null}
            {fieldErrors.preferredChannel ? (
              <p className="text-xs text-destructive">{fieldErrors.preferredChannel}</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Marketing consent</p>
              <p className="text-xs text-muted-foreground">
                Whether this client has opted in to marketing communications.
              </p>
            </div>
            <Switch
              checked={marketingConsent}
              onCheckedChange={setMarketingConsent}
              disabled={disabled}
            />
          </div>
          <div>
            <Button onClick={save} disabled={updateCustomer.isPending || disabled}>
              {updateCustomer.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </fieldset>
      </SectionCard>

      <ClientTagsCard customerId={client.id} disabled={disabled} />
      <ClientConsentsCard customerId={client.id} disabled={disabled} />
    </>
  );
}

function ClientTagsCard({ customerId, disabled }: { customerId: string; disabled: boolean }) {
  const catalogue = useCustomerTagsCatalogue();
  const assigned = useCustomerTags(customerId);
  const createTag = useCreateCustomerTag();
  const assignTag = useAssignCustomerTag(customerId);
  const removeTag = useRemoveCustomerTag(customerId);
  const [newTag, setNewTag] = useState("");

  const assignedIds = useMemo(
    () => new Set((assigned.data ?? []).map((t) => t.id)),
    [assigned.data],
  );
  const activeCatalogue = (catalogue.data ?? []).filter((t) => t.status === "active");

  return (
    <SectionCard title="Tags" description="Segment clients for filtering and messaging (RECA-78).">
      {assigned.isLoading || catalogue.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tags…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {activeCatalogue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags created for this business yet.</p>
          ) : (
            activeCatalogue.map((tag) => {
              const isAssigned = assignedIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={disabled || assignTag.isPending || removeTag.isPending}
                  onClick={() => (isAssigned ? removeTag.mutate(tag.id) : assignTag.mutate(tag.id))}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    isAssigned
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-input text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <TagIcon className="size-3" />
                  {tag.name}
                  {isAssigned ? <X className="size-3" /> : null}
                </button>
              );
            })
          )}
        </div>
      )}
      {!disabled ? (
        <div className="mt-4 flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Create a new tag (e.g. VIP)"
            className="max-w-xs"
          />
          <Button
            variant="outline"
            disabled={createTag.isPending || !newTag.trim()}
            onClick={async () => {
              const tag = await createTag.mutateAsync(newTag.trim());
              setNewTag("");
              await assignTag.mutateAsync(tag.id);
              toast.success(`Tag "${tag.name}" created and assigned`);
            }}
          >
            <Plus className="size-4" /> New tag
          </Button>
        </div>
      ) : null}
    </SectionCard>
  );
}

function ClientConsentsCard({ customerId, disabled }: { customerId: string; disabled: boolean }) {
  const consents = useCustomerConsents(customerId);
  const addConsent = useAddCustomerConsent(customerId);
  const [channel, setChannel] = useState("marketing_email");
  const [granted, setGranted] = useState(true);

  return (
    <SectionCard title="Consent records" description="Explicit consent capture per channel.">
      {consents.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading consents…</p>
      ) : (consents.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No consent records yet.</p>
      ) : (
        <ul className="space-y-2">
          {[...(consents.data ?? [])]
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
            .map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span className="font-medium">{c.channel}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={c.granted ? "default" : "secondary"}>
                    {c.granted ? "Granted" : "Withdrawn"}
                  </Badge>
                  {ukDate(c.recordedAt.slice(0, 10))}
                </span>
              </li>
            ))}
        </ul>
      )}
      {!disabled ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="consent-channel">Channel</Label>
            <Input
              id="consent-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="marketing_email"
              className="w-48"
            />
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Switch checked={granted} onCheckedChange={setGranted} />
            <span className="text-sm">{granted ? "Granted" : "Withdrawn"}</span>
          </div>
          <Button
            variant="outline"
            disabled={addConsent.isPending || !channel.trim()}
            onClick={async () => {
              await addConsent.mutateAsync({
                channel: channel.trim(),
                granted,
                source: "staff_console",
              });
              toast.success("Consent recorded");
            }}
          >
            Record consent
          </Button>
        </div>
      ) : null}
    </SectionCard>
  );
}

function ClientPrivacyTab({ client, disabled }: { client: Customer; disabled: boolean }) {
  const linkPortal = useLinkCustomerPortalUser();
  const dsarExport = useRequestCustomerDsarExport();
  const anonymise = useAnonymiseCustomer();
  const [userId, setUserId] = useState("");
  const [copied, setCopied] = useState(false);

  return (
    <>
      <SectionCard
        title="Portal account"
        description="Link this client to an existing RECAVO portal user account."
      >
        {client.userId ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="default">
              <Check className="size-3" /> Linked
            </Badge>
            <code className="rounded bg-secondary px-2 py-1 text-xs">{client.userId}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(client.userId ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy className="size-4" /> {copied ? "Copied" : "Copy user ID"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Not linked to a portal account. Paste the portal user ID the client registered with to
              link their booking history to that account (staff.dashboard doesn't mint invite links
              — the client registers first, then you link the account here).
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Portal user ID (UUID)"
                className="max-w-sm"
                disabled={disabled}
              />
              <Button
                variant="outline"
                disabled={disabled || linkPortal.isPending || !userId.trim()}
                onClick={async () => {
                  await linkPortal.mutateAsync({ customerId: client.id, userId: userId.trim() });
                  setUserId("");
                  toast.success("Portal account linked");
                }}
              >
                <Link2 className="size-4" /> Link account
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Data export (DSAR)"
        description="Bundle this client's personal data for a subject access request."
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={dsarExport.isPending}>
              <Download className="size-4" /> Request DSAR export
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Request a DSAR export?</AlertDialogTitle>
              <AlertDialogDescription>
                This bundles {customerDisplayName(client)}'s personal data for a subject access
                request. The export is generated asynchronously.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await dsarExport.mutateAsync(client.id);
                  toast.success("DSAR export requested", {
                    description: "It will be available in your business exports shortly.",
                  });
                }}
              >
                Request export
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SectionCard>

      <SectionCard
        title="Anonymise client"
        description="Irreversibly redact this client's personal data (GDPR erasure)."
      >
        {disabled ? (
          <p className="text-sm text-muted-foreground">This client has already been anonymised.</p>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={anonymise.isPending}>
                <AlertTriangle className="size-4" /> Anonymise client
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Anonymise {customerDisplayName(client)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently redacts their name, email and phone number and disables further
                  edits. Bookings and payment records are retained for accounting but no longer
                  identify this client. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    await anonymise.mutateAsync(client.id);
                    toast.success("Client anonymised");
                  }}
                >
                  Anonymise permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </SectionCard>
    </>
  );
}
