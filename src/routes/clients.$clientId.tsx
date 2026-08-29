import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarPlus,
  ChevronDown,
  Copy,
  Download,
  MessageSquare,
  Minus,
  Package,
  Plus,
  ShieldOff,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DetailGhost, TableGhost } from "@/components/ghost";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { ApiError } from "@/lib/api";
import {
  useAddCustomerNote,
  useAdjustEntitlement,
  useAnonymiseCustomer,
  useAssignCustomerTag,
  useCreateCustomerLinkedRecord,
  useCreateCustomerTag,
  useCustomer,
  useCustomerAssignedTags,
  useCustomerBookings,
  useCustomerConsents,
  useCustomerCredits,
  useCustomerDsarExport,
  useCustomerLinkedRecords,
  useCustomerNotes,
  useCustomerTagsCatalogue,
  useEntitlementLedger,
  useLinkCustomerPortal,
  useMessages,
  useOpenConversation,
  usePackages,
  usePaymentsList,
  useRecordCustomerConsent,
  useSendMessage,
  useUnassignCustomerTag,
  useUpdateCustomer,
  useUpdateCustomerStatus,
} from "@/lib/api/hooks";
import { customerDisplayName, type Customer, type EntitlementView } from "@/lib/api/types";
import { PERMISSIONS } from "@/lib/permissions";
import { formatInTz, formatMoney, ukDate } from "@/lib/format";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
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
  const [confirmDsar, setConfirmDsar] = useState(false);
  const [confirmAnonymise, setConfirmAnonymise] = useState(false);

  const customer = useCustomer(clientId);
  const bookings = useCustomerBookings(clientId);
  const credits = useCustomerCredits(clientId);
  const packages = usePackages();
  const payments = usePaymentsList({ customerId: clientId });
  const notes = useCustomerNotes(clientId);
  const addNote = useAddCustomerNote(clientId);
  const updateStatus = useUpdateCustomerStatus();
  const dsarExport = useCustomerDsarExport(clientId);
  const anonymise = useAnonymiseCustomer(clientId);

  if (customer.isLoading) {
    return <DetailGhost />;
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
  const anonymised = client.status === "anonymised";
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
  const lifetimeSpendMinor = (payments.payments ?? [])
    .filter((p) => p.state === "succeeded" || p.state === "partially_refunded")
    .reduce((sum, p) => sum + p.amountMinor - p.amountRefundedMinor, 0);

  const downloadDsar = async () => {
    const data = await dsarExport.mutateAsync();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dsar-${client.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("DSAR export downloaded");
    setConfirmDsar(false);
  };

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
            {[client.emailDisplay, client.phoneDisplay].filter(Boolean).join(" · ") || "No contact"}{" "}
            · Client since {ukDate(client.createdAt.slice(0, 10))}
          </p>
          {client.userId ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Portal user: {client.userId}
            </p>
          ) : null}
          {anonymised ? (
            <p className="mt-2 text-sm text-destructive">
              This client has been anonymised. Profile edits are disabled.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={anonymised} onClick={() => setQuick("message")}>
            <MessageSquare className="size-4" /> Message
          </Button>
          <Button variant="outline" disabled={anonymised} onClick={() => setQuick("package")}>
            <Package className="size-4" /> Sell package
          </Button>
          <Button disabled={anonymised} onClick={() => setBookingOpen(true)}>
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

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="consents">Consents</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="linked">Linked records</TabsTrigger>
          <TabsTrigger value="portal">Portal</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <CustomerProfileForm client={client} disabled={anonymised} />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {bookings.isLoading ? (
              <TableGhost rows={5} />
            ) : upcoming.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No upcoming bookings"
                  description={`${customerDisplayName(client)} has nothing in the diary. Create a booking to get them back in.`}
                  action={
                    <Button disabled={anonymised} onClick={() => setBookingOpen(true)}>
                      Create booking
                    </Button>
                  }
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
              <TableGhost rows={4} />
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
                    disabled={anonymised}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {payments.isLoading ? (
              <TableGhost rows={5} />
            ) : (payments.payments ?? []).length === 0 ? (
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
                  {(payments.payments ?? []).map((p) => (
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
                disabled={anonymised}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a training note, injury update or preference…"
              />
              <Button
                disabled={addNote.isPending || anonymised}
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

        <TabsContent value="consents" className="mt-4">
          <CustomerConsentsTab customerId={client.id} disabled={anonymised} />
        </TabsContent>

        <TabsContent value="tags" className="mt-4">
          <CustomerTagsTab customerId={client.id} disabled={anonymised} />
        </TabsContent>

        <TabsContent value="linked" className="mt-4">
          <CustomerLinkedRecordsTab customerId={client.id} disabled={anonymised} />
        </TabsContent>

        <TabsContent value="portal" className="mt-4">
          <CustomerPortalLinkTab client={client} disabled={anonymised} />
        </TabsContent>

        <TabsContent value="privacy" className="mt-4 space-y-4">
          <SectionCard
            title="Data subject rights"
            description="Export or anonymise this client under GDPR. Contact fields are already masked as returned by the API."
          >
            <div className="flex flex-wrap gap-2">
              <Can permission={PERMISSIONS.CUSTOMER_EXPORT}>
                <Button
                  variant="outline"
                  disabled={dsarExport.isPending || anonymised}
                  onClick={() => setConfirmDsar(true)}
                >
                  <Download className="size-4" /> DSAR export
                </Button>
              </Can>
              <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
                <Button
                  variant="destructive"
                  disabled={anonymise.isPending || anonymised}
                  onClick={() => setConfirmAnonymise(true)}
                >
                  Anonymise client
                </Button>
              </Can>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <SectionCard
            title="Attachments"
            description="Photos, waivers and other documents held against this client."
          >
            <FileAttachments
              ownerType="customer"
              ownerId={client.id}
              canUpload={tenant.can(PERMISSIONS.CUSTOMER_UPDATE)}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <ClientMessages customerId={client.id} disabled={anonymised} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
          <Button
            variant="outline"
            disabled={updateStatus.isPending || anonymised}
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
        </Can>
      </div>

      <AddBookingModal
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        defaultCustomerId={client.id}
      />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} customerId={client.id} />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />

      <AlertDialog open={confirmDsar} onOpenChange={setConfirmDsar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export DSAR bundle?</AlertDialogTitle>
            <AlertDialogDescription>
              This requests a personal-data export for {customerDisplayName(client)} and downloads
              the JSON response.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={dsarExport.isPending}
              onClick={(e) => {
                e.preventDefault();
                void downloadDsar();
              }}
            >
              {dsarExport.isPending ? "Exporting…" : "Export"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAnonymise} onOpenChange={setConfirmAnonymise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonymise this client?</AlertDialogTitle>
            <AlertDialogDescription>
              This is irreversible. Personal details will be stripped and further edits will be
              disabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep client</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={anonymise.isPending}
              onClick={async (e) => {
                e.preventDefault();
                await anonymise.mutateAsync();
                toast.success("Client anonymised");
                setConfirmAnonymise(false);
              }}
            >
              {anonymise.isPending ? "Anonymising…" : "Anonymise"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CustomerProfileForm({ client, disabled }: { client: Customer; disabled: boolean }) {
  const update = useUpdateCustomer();
  const [firstName, setFirstName] = useState(client.firstName);
  const [lastName, setLastName] = useState(client.lastName ?? "");
  const [email, setEmail] = useState(client.emailDisplay ?? "");
  const [phone, setPhone] = useState(client.phoneDisplay ?? "");
  const [preferredChannel, setPreferredChannel] = useState<"email" | "phone" | "none">(
    client.contactPreferences.preferredChannel === "sms"
      ? "none"
      : client.contactPreferences.preferredChannel,
  );
  const [operationalNotifications, setOperationalNotifications] = useState(
    client.contactPreferences.operationalNotifications,
  );
  const [marketingConsent, setMarketingConsent] = useState(client.marketingConsent.granted);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFirstName(client.firstName);
    setLastName(client.lastName ?? "");
    setEmail(client.emailDisplay ?? "");
    setPhone(client.phoneDisplay ?? "");
    setPreferredChannel(
      client.contactPreferences.preferredChannel === "sms"
        ? "none"
        : client.contactPreferences.preferredChannel,
    );
    setOperationalNotifications(client.contactPreferences.operationalNotifications);
    setMarketingConsent(client.marketingConsent.granted);
    setFieldErrors({});
  }, [client]);

  return (
    <SectionCard
      title="Profile"
      description="Contact details are shown as returned by the API (may be masked). Saves use If-Match."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="pf-first">First name</Label>
          <Input
            id="pf-first"
            value={firstName}
            disabled={disabled}
            onChange={(e) => setFirstName(e.target.value)}
          />
          {fieldErrors.firstName ? (
            <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-last">Last name</Label>
          <Input
            id="pf-last"
            value={lastName}
            disabled={disabled}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-email">Email</Label>
          <Input
            id="pf-email"
            type="email"
            value={email}
            disabled={disabled}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldErrors.email ? (
            <p className="text-xs text-destructive">{fieldErrors.email}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-phone">Phone</Label>
          <Input
            id="pf-phone"
            value={phone}
            disabled={disabled}
            onChange={(e) => setPhone(e.target.value)}
          />
          {fieldErrors.phone ? (
            <p className="text-xs text-destructive">{fieldErrors.phone}</p>
          ) : null}
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label>Preferred channel</Label>
          <Select
            value={preferredChannel}
            disabled={disabled}
            onValueChange={(v) => setPreferredChannel(v as "email" | "phone" | "none")}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
          {fieldErrors.preferredChannel ? (
            <p className="text-xs text-destructive">{fieldErrors.preferredChannel}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            SMS is not available until delivery ships.
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium">Operational notifications</p>
            <p className="text-xs text-muted-foreground">Booking reminders and service updates.</p>
          </div>
          <Switch
            checked={operationalNotifications}
            disabled={disabled}
            onCheckedChange={setOperationalNotifications}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium">Marketing consent</p>
            <p className="text-xs text-muted-foreground">
              Last updated{" "}
              {client.marketingConsent.updatedAt
                ? ukDate(client.marketingConsent.updatedAt.slice(0, 10))
                : "never"}
            </p>
          </div>
          <Switch
            checked={marketingConsent}
            disabled={disabled}
            onCheckedChange={setMarketingConsent}
          />
        </label>
      </div>
      <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
        <div className="mt-4">
          <Button
            disabled={disabled || update.isPending || !firstName.trim()}
            onClick={async () => {
              setFieldErrors({});
              try {
                await update.mutateAsync({
                  customerId: client.id,
                  version: client.version,
                  body: {
                    firstName: firstName.trim(),
                    lastName: lastName.trim() || null,
                    email: email.trim() || null,
                    phone: phone.trim() || null,
                    preferredChannel,
                    operationalNotifications,
                    marketingConsent,
                    marketingConsentSource: "staff_console",
                  },
                });
                toast.success("Profile saved");
              } catch (err) {
                if (err instanceof ApiError) {
                  if (err.isConflict) {
                    toast.error("This client was updated elsewhere", {
                      description: "Refresh the profile, then reapply your changes.",
                    });
                    return;
                  }
                  const next: Record<string, string> = {};
                  for (const fe of err.fieldErrors) {
                    if (fe.field) next[fe.field] = fe.message || fe.code || "Invalid";
                  }
                  setFieldErrors(next);
                }
              }
            }}
          >
            {update.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </Can>
    </SectionCard>
  );
}

function CustomerConsentsTab({ customerId, disabled }: { customerId: string; disabled: boolean }) {
  const consents = useCustomerConsents(customerId);
  const record = useRecordCustomerConsent(customerId);
  const [channel, setChannel] = useState("email");
  const [granted, setGranted] = useState(true);
  const [source, setSource] = useState("staff_console");

  return (
    <SectionCard title="Consents" description="Recorded marketing and notice consents.">
      <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Channel</Label>
            <Input
              value={channel}
              disabled={disabled}
              onChange={(e) => setChannel(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Source</Label>
            <Input value={source} disabled={disabled} onChange={(e) => setSource(e.target.value)} />
          </div>
          <label className="flex items-end gap-3 pb-2">
            <Switch checked={granted} disabled={disabled} onCheckedChange={setGranted} />
            <span className="text-sm">{granted ? "Granted" : "Withdrawn"}</span>
          </label>
          <Button
            className="sm:col-span-3 sm:w-fit"
            disabled={disabled || record.isPending || !channel.trim()}
            onClick={async () => {
              await record.mutateAsync({
                channel: channel.trim(),
                granted,
                source: source.trim() || null,
              });
              toast.success("Consent recorded");
            }}
          >
            Record consent
          </Button>
        </div>
      </Can>
      {consents.isLoading ? (
        <div className="surface-card overflow-hidden">
          <TableGhost rows={3} />
        </div>
      ) : (consents.data ?? []).length === 0 ? (
        <EmptyState title="No consents recorded" />
      ) : (
        <ul className="divide-y rounded-xl border">
          {(consents.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {c.channel} · {c.granted ? "Granted" : "Withdrawn"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.source ?? "—"} · {ukDate(c.recordedAt.slice(0, 10))}
                </p>
              </div>
              <StatusBadge status={c.granted ? "active" : "archived"} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function CustomerTagsTab({ customerId, disabled }: { customerId: string; disabled: boolean }) {
  const catalogue = useCustomerTagsCatalogue({ status: "active" });
  const assigned = useCustomerAssignedTags(customerId);
  const assign = useAssignCustomerTag(customerId);
  const unassign = useUnassignCustomerTag(customerId);
  const createTag = useCreateCustomerTag();
  const [tagId, setTagId] = useState("");
  const [newTag, setNewTag] = useState("");

  const assignedIds = useMemo(
    () => new Set((assigned.data ?? []).map((t) => t.id)),
    [assigned.data],
  );
  const available = (catalogue.data ?? []).filter((t) => !assignedIds.has(t.id));

  return (
    <SectionCard
      title="Tags"
      description="Assign catalogue tags for segmentation. Create tags here or in settings."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {(assigned.data ?? []).map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium"
          >
            {t.name}
            <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
              <button
                type="button"
                disabled={disabled || unassign.isPending}
                className="rounded-full p-0.5 hover:bg-background"
                aria-label={`Remove ${t.name}`}
                onClick={async () => {
                  await unassign.mutateAsync(t.id);
                  toast.success("Tag removed");
                }}
              >
                <X className="size-3" />
              </button>
            </Can>
          </span>
        ))}
        {(assigned.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags assigned.</p>
        ) : null}
      </div>

      <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-[200px] flex-1 gap-2">
            <Label>Assign tag</Label>
            <Select value={tagId} disabled={disabled} onValueChange={setTagId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a tag" />
              </SelectTrigger>
              <SelectContent>
                {available.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={disabled || !tagId || assign.isPending}
            onClick={async () => {
              await assign.mutateAsync(tagId);
              setTagId("");
              toast.success("Tag assigned");
            }}
          >
            Assign
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="grid min-w-[200px] flex-1 gap-2">
            <Label>Create catalogue tag</Label>
            <Input
              value={newTag}
              disabled={disabled}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="VIP"
            />
          </div>
          <Button
            variant="outline"
            disabled={disabled || !newTag.trim() || createTag.isPending}
            onClick={async () => {
              const tag = await createTag.mutateAsync(newTag.trim());
              await assign.mutateAsync(tag.id);
              setNewTag("");
              toast.success("Tag created and assigned");
            }}
          >
            Create & assign
          </Button>
        </div>
      </Can>
    </SectionCard>
  );
}

function CustomerLinkedRecordsTab({
  customerId,
  disabled,
}: {
  customerId: string;
  disabled: boolean;
}) {
  const records = useCustomerLinkedRecords(customerId);
  const create = useCreateCustomerLinkedRecord(customerId);
  const [label, setLabel] = useState("");

  return (
    <SectionCard
      title="Linked records"
      description="Instance records for this client. Schema/templates are configured in Settings."
    >
      <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
        <div className="mb-6 flex flex-wrap items-end gap-2">
          <div className="grid min-w-[220px] flex-1 gap-2">
            <Label>Display label</Label>
            <Input
              value={label}
              disabled={disabled}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Bella (dog)"
            />
          </div>
          <Button
            disabled={disabled || create.isPending || !label.trim()}
            onClick={async () => {
              await create.mutateAsync({ displayLabel: label.trim(), values: {} });
              setLabel("");
              toast.success("Linked record created");
            }}
          >
            Add record
          </Button>
        </div>
      </Can>
      {records.isLoading ? (
        <div className="surface-card overflow-hidden">
          <TableGhost rows={3} />
        </div>
      ) : (records.data ?? []).length === 0 ? (
        <EmptyState
          title="No linked records"
          description="Add a record when one is needed for booking."
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {(records.data ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{r.displayLabel}</p>
                <p className="text-xs text-muted-foreground">
                  Updated {ukDate(r.updatedAt.slice(0, 10))}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function CustomerPortalLinkTab({ client, disabled }: { client: Customer; disabled: boolean }) {
  const link = useLinkCustomerPortal(client.id);
  const [userId, setUserId] = useState("");
  const [resultUserId, setResultUserId] = useState<string | null>(client.userId);

  useEffect(() => {
    setResultUserId(client.userId);
  }, [client.userId]);

  return (
    <SectionCard
      title="Portal link"
      description="Links this customer to an existing portal user by userId (not a shareable magic link)."
    >
      {resultUserId ? (
        <div className="mb-4 rounded-xl border bg-secondary/40 p-4">
          <p className="text-sm font-medium">Linked portal user</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-background px-2 py-1 text-xs">{resultUserId}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(resultUserId);
                toast.success("User ID copied");
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">No portal user linked yet.</p>
      )}

      <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
        <div className="grid gap-3 sm:max-w-lg">
          <div className="grid gap-2">
            <Label htmlFor="portal-user">Portal user ID (UUID)</Label>
            <Input
              id="portal-user"
              value={userId}
              disabled={disabled}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>
          <Button
            disabled={disabled || link.isPending || !userId.trim()}
            onClick={async () => {
              const updated = await link.mutateAsync(userId.trim());
              setResultUserId(updated.userId);
              setUserId("");
              toast.success("Portal user linked");
            }}
          >
            {link.isPending ? "Linking…" : "Link portal user"}
          </Button>
        </div>
      </Can>
    </SectionCard>
  );
}

function EntitlementRow({
  view,
  packageName,
  disabled,
}: {
  view: EntitlementView;
  packageName: string;
  disabled?: boolean;
}) {
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
          disabled={disabled || adjust.isPending}
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
          disabled={disabled || adjust.isPending || view.balance.available <= 0}
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
            <li className="px-0 py-2">
              <TableGhost rows={3} />
            </li>
          ) : null}
          {!ledger.isLoading && (ledger.data?.entries ?? []).length === 0 ? (
            <li className="text-xs text-muted-foreground">No ledger activity yet.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function ClientMessages({ customerId, disabled }: { customerId: string; disabled?: boolean }) {
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
              disabled={disabled}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply…"
            />
            <Button
              disabled={disabled || sendMessage.isPending}
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
