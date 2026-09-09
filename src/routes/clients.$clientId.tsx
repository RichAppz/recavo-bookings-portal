import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  ArrowRightLeft,
  CalendarPlus,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Download,
  History,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CustomerAddressFields } from "@/components/CustomerAddressFields";
import { addressToForm, formToAddress, type AddressFormState } from "@/lib/customers/address-form";
import { DetailGhost, TableGhost } from "@/components/ghost";
import { AddBookingModal } from "@/components/AddBookingModal";
import { BookingPanel } from "@/components/BookingPanel";
import { CreateInvoiceDialog } from "@/components/CreateInvoiceDialog";
import { FileAttachments } from "@/components/FileAttachments";
import { InvoicesTable } from "@/components/InvoicesTable";
import { InvoicingUpgradeDialog } from "@/components/InvoicingUpgradeDialog";
import { LinkedRecordPhotosDialog } from "@/components/LinkedRecordPhotos";
import {
  activeSortedFields,
  DeleteLinkedRecordDialog,
  LinkedRecordFormDialog,
  OwnershipHistoryDialog,
  summariseValues,
  TransferLinkedRecordDialog,
  type LinkedRecordField,
} from "@/components/LinkedRecordDialogs";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState, PersonAvatar, SectionCard, StatusBadge } from "@/components/ui-bits";
import { ClientSignupLinksCard } from "@/components/ClientSignupLinksCard";
import { CustomerAvatar } from "@/components/CustomerAvatar";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import type { ContactChannel } from "@/lib/api/types";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { ApiError, queryKeys, toastApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  useCustomerNotifications,
  useCustomers,
  useCustomerTagsCatalogue,
  useEntitlementLedger,
  useLinkCustomerPortal,
  useLinkedRecordDefinition,
  useLinkedRecordOwnership,
  useMemberships,
  useMessages,
  useOpenConversation,
  usePackages,
  usePatchLinkedRecord,
  useTransferLinkedRecord,
  usePaymentsList,
  useRecordCustomerConsent,
  useRunReminders,
  useSendMessage,
  useUnassignCustomerTag,
  useUpdateCustomer,
  useUpdateCustomerStatus,
} from "@/lib/api/hooks";
import { useInvoices, useInvoicingEntitled } from "@/lib/api/invoices";
import {
  customerAddressLine,
  customerDisplayName,
  userDisplayName,
  type Customer,
  type EntitlementView,
  type LinkedRecord,
  type LinkedRecordOwnership,
  type Notification,
} from "@/lib/api/types";
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
  const linkedRecordDefinition = useLinkedRecordDefinition();
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
        <CustomerAvatar customer={client} size={72} editable />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{customerDisplayName(client)}</h1>
            {client.nickname ? (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm text-muted-foreground">
                Known as {client.nickname}
              </span>
            ) : null}
            <StatusBadge status={client.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[client.emailDisplay, client.phoneDisplay].filter(Boolean).join(" · ") || "No contact"}{" "}
            · Client since {ukDate(client.createdAt.slice(0, 10))}
          </p>
          {client.address ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {customerAddressLine(client.address)}
            </p>
          ) : null}
          {client.userId ? (
            <p className="mt-1 text-xs text-muted-foreground">Has a linked portal account</p>
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
          {tenant.can(PERMISSIONS.INVOICE_READ) ? (
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
          ) : null}
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="consents">Consents</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="linked">
            {linkedRecordDefinition.data?.definition.pluralLabel ?? "Linked records"}
          </TabsTrigger>
          <TabsTrigger value="portal">Portal</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
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
                          {b.allDay
                            ? "All day"
                            : formatInTz(b.start, b.timezone, { timeStyle: "short" })}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {(b.lineItems?.length ?? 0) > 1
                            ? b.lineItems.map((li) => li.name).join(" + ")
                            : b.serviceSnapshot.name}
                        </p>
                        {(b.lineItems?.length ?? 0) > 1 ? (
                          <p className="text-xs text-muted-foreground">
                            {b.lineItems.length} services · {formatMoney(b.priceMinor, b.currency)}
                          </p>
                        ) : null}
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

          {tenant.business ? (
            <ClientSignupLinksCard
              clientId={clientId}
              slug={tenant.business.slug}
              disabled={anonymised}
            />
          ) : null}
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
                        {p.providerPaymentId ?? "—"}
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

        {tenant.can(PERMISSIONS.INVOICE_READ) ? (
          <TabsContent value="invoices" className="mt-4">
            <ClientInvoicesTab customerId={client.id} disabled={anonymised} />
          </TabsContent>
        ) : null}

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

        <TabsContent value="notifications" className="mt-4">
          <CustomerNotificationsTab customerId={client.id} />
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
  const [nickname, setNickname] = useState(client.nickname ?? "");
  const [address, setAddress] = useState<AddressFormState>(addressToForm(client.address));
  const [email, setEmail] = useState(client.emailDisplay ?? "");
  const [phone, setPhone] = useState(client.phoneDisplay ?? "");
  const [preferredChannel, setPreferredChannel] = useState<"email" | "phone" | "sms" | "none">(
    client.contactPreferences.preferredChannel,
  );
  const [operationalNotifications, setOperationalNotifications] = useState(
    client.contactPreferences.operationalNotifications,
  );
  const [marketingConsent, setMarketingConsent] = useState(client.marketingConsent.granted);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // SMS is allowed on every plan (ADR 0020); the note below says what it'll cost.
  const smsCredits = useSmsCreditsSummary();

  useEffect(() => {
    setFirstName(client.firstName);
    setLastName(client.lastName ?? "");
    setNickname(client.nickname ?? "");
    setAddress(addressToForm(client.address));
    setEmail(client.emailDisplay ?? "");
    setPhone(client.phoneDisplay ?? "");
    setPreferredChannel(client.contactPreferences.preferredChannel);
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
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="pf-nickname">Known as</Label>
          <Input
            id="pf-nickname"
            value={nickname}
            maxLength={80}
            disabled={disabled}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Dave – red Audi"
          />
          {fieldErrors.nickname ? (
            <p className="text-xs text-destructive">{fieldErrors.nickname}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Optional. A name that helps you remember them; never shown to the client.
            </p>
          )}
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
        <CustomerAddressFields
          idPrefix="pf-addr"
          value={address}
          onChange={setAddress}
          disabled={disabled}
          className="sm:col-span-2"
        />
        <div className="grid gap-2 sm:col-span-2">
          <Label>Preferred channel</Label>
          <Select
            value={preferredChannel}
            disabled={disabled}
            onValueChange={(v) => setPreferredChannel(v as ContactChannel)}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
          {fieldErrors.preferredChannel ? (
            <p className="text-xs text-destructive">{fieldErrors.preferredChannel}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            SMS needs a mobile number — reminders fall back to email until one is saved.
            {preferredChannel === "sms" && smsCredits.level !== "unlimited"
              ? ` ${smsCredits.note}`
              : ""}
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
                    nickname: nickname.trim() || null,
                    address: formToAddress(address),
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

/** Every invoice raised for this client (drafts included), with a shortcut to raise another. */
function ClientInvoicesTab({ customerId, disabled }: { customerId: string; disabled: boolean }) {
  const tenant = useTenant();
  const invoices = useInvoices({ customerId, limit: 200 });
  const entitled = useInvoicingEntitled();
  const [createOpen, setCreateOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const canManage = tenant.can(PERMISSIONS.INVOICE_MANAGE);

  const startCreate = () => {
    if (entitled === false) setUpsellOpen(true);
    else setCreateOpen(true);
  };

  return (
    <>
      <SectionCard
        title="Invoices"
        description="Newest first"
        bodyClassName="p-0"
        action={
          canManage ? (
            <Button
              size="sm"
              disabled={disabled || entitled === undefined}
              title={
                entitled === false
                  ? "Invoicing isn’t on your plan yet — add the bolt-on to raise invoices."
                  : undefined
              }
              onClick={startCreate}
            >
              <Plus className="size-4" /> New invoice
            </Button>
          ) : null
        }
      >
        <InvoicesTable
          invoices={invoices.data}
          loading={invoices.isLoading}
          error={invoices.isError}
          showCustomer={false}
          empty={
            <EmptyState
              title="No invoices for this client"
              description={
                canManage
                  ? "Raise one from a job in the booking panel, or start a blank invoice here."
                  : undefined
              }
            />
          }
        />
      </SectionCard>
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultCustomerId={customerId}
      />
      <InvoicingUpgradeDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        onEnabled={() => setCreateOpen(true)}
      />
    </>
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
  const tenant = useTenant();
  const term = tenant.terminology.linkedRecord;
  const records = useCustomerLinkedRecords(customerId);
  const definition = useLinkedRecordDefinition();
  const create = useCreateCustomerLinkedRecord(customerId);
  const patch = usePatchLinkedRecord(customerId);

  const fields = useMemo<LinkedRecordField[]>(
    () => activeSortedFields((definition.data?.fields ?? []) as unknown as LinkedRecordField[]),
    [definition.data],
  );
  const hasSchema = fields.length > 0;

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<LinkedRecord | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<LinkedRecord | null>(null);
  const [photosFor, setPhotosFor] = useState<LinkedRecord | null>(null);
  const [deletingFor, setDeletingFor] = useState<LinkedRecord | null>(null);

  // Resolve the transfer target from the live list so that after a 409 (stale
  // version) the refetched record — with its bumped version — flows into the
  // dialog and a retry can succeed.
  const transferring = transferringId
    ? ((records.data ?? []).find((r) => r.id === transferringId) ?? null)
    : null;

  return (
    <SectionCard
      title={`${term} records`}
      description={`${term} records for this client. The schema and templates are configured in Settings.`}
      action={
        <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
          <Button size="sm" disabled={disabled || !hasSchema} onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add {term.toLowerCase()}
          </Button>
        </Can>
      }
      bodyClassName="p-0"
    >
      {records.isLoading || definition.isLoading ? (
        <TableGhost rows={3} />
      ) : !hasSchema ? (
        <div className="p-6">
          <EmptyState
            title={`No ${term.toLowerCase()} schema yet`}
            description="Enable a record schema in Settings before adding records for this client."
          />
        </div>
      ) : (records.data ?? []).length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={`No ${term.toLowerCase()} records`}
            description={`Add a ${term.toLowerCase()} so it can be attached when booking.`}
          />
        </div>
      ) : (
        <ul className="divide-y">
          {(records.data ?? []).map((r) => {
            const summary = summariseValues(fields, (r.values ?? {}) as Record<string, unknown>);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.displayLabel}</p>
                  {summary ? (
                    <p className="truncate text-xs text-muted-foreground">{summary}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Updated {ukDate(r.updatedAt.slice(0, 10))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={`Actions for ${r.displayLabel}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
                        <DropdownMenuItem disabled={disabled} onSelect={() => setEditing(r)}>
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                        {r.status === "active" ? (
                          <DropdownMenuItem
                            disabled={disabled}
                            onSelect={() => setTransferringId(r.id)}
                          >
                            <ArrowRightLeft className="size-4" /> Transfer to another client
                          </DropdownMenuItem>
                        ) : null}
                      </Can>
                      <Can permission={PERMISSIONS.CUSTOMER_READ}>
                        <DropdownMenuItem onSelect={() => setPhotosFor(r)}>
                          <Camera className="size-4" /> Photos
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setHistoryFor(r)}>
                          <History className="size-4" /> Ownership history
                        </DropdownMenuItem>
                      </Can>
                      <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
                        {r.status === "active" ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={disabled || patch.isPending}
                              onSelect={async () => {
                                await patch.mutateAsync({
                                  recordId: r.id,
                                  version: r.version,
                                  body: { status: "archived" },
                                });
                                toast.success(`${term} archived`);
                              }}
                            >
                              <Archive className="size-4" /> Archive
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={disabled}
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeletingFor(r)}
                            >
                              <Trash2 className="size-4" /> Delete
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </Can>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <LinkedRecordFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        fields={fields}
        term={term}
        submitting={create.isPending}
        submitError={create.error}
        onSubmit={async (data) => {
          await create.mutateAsync(data);
          setAddOpen(false);
          toast.success(`${term} added`);
        }}
      />

      <LinkedRecordFormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        fields={fields}
        term={term}
        initial={
          editing
            ? {
                displayLabel: editing.displayLabel,
                values: (editing.values ?? {}) as Record<string, unknown>,
              }
            : undefined
        }
        submitting={patch.isPending}
        submitError={patch.error}
        onSubmit={async (data) => {
          if (!editing) return;
          await patch.mutateAsync({
            recordId: editing.id,
            version: editing.version,
            body: data,
          });
          setEditing(null);
          toast.success(`${term} updated`);
        }}
      />

      <TransferLinkedRecordDialog
        record={transferring}
        sourceCustomerId={customerId}
        term={term}
        onOpenChange={(o) => {
          if (!o) setTransferringId(null);
        }}
      />

      <OwnershipHistoryDialog
        record={historyFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setHistoryFor(null);
        }}
      />

      <DeleteLinkedRecordDialog
        record={deletingFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setDeletingFor(null);
        }}
      />

      <LinkedRecordPhotosDialog
        record={photosFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setPhotosFor(null);
        }}
      />
    </SectionCard>
  );
}

function CustomerNotificationsTab({ customerId }: { customerId: string }) {
  const notifications = useCustomerNotifications(customerId);
  const runReminders = useRunReminders();
  const list = notifications.data ?? [];

  return (
    <SectionCard
      title="Notifications"
      description="Reminders and updates sent to this client. Texts use your prepaid credits and fall back to email when none are left."
      action={
        <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
          <Button
            size="sm"
            variant="outline"
            disabled={runReminders.isPending}
            onClick={async () => {
              const res = await runReminders.mutateAsync();
              await notifications.refetch();
              toast.success(`Reminder sweep complete — ${res.sent} sent, ${res.skipped} skipped`);
            }}
          >
            {runReminders.isPending ? "Running…" : "Run reminder sweep"}
          </Button>
        </Can>
      }
      bodyClassName="p-0"
    >
      {notifications.isLoading ? (
        <TableGhost rows={4} />
      ) : list.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No notifications yet"
            description="Reminders appear here once they've been sent to this client."
          />
        </div>
      ) : (
        <ul className="divide-y">
          {list.map((n: Notification) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{n.subject || n.templateKey}</p>
                <p className="text-xs text-muted-foreground">
                  {n.channel === "in_app" ? "In-app" : n.channel.toUpperCase()} ·{" "}
                  {ukDate(n.createdAt.slice(0, 10))}
                  {n.readAt ? " · read" : ""}
                </p>
              </div>
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
