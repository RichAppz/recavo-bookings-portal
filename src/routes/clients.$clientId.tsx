import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { DetailGhost } from "@/components/ghost";
import { AddBookingModal } from "@/components/AddBookingModal";
import { ReminderDrawer } from "@/components/reminders/ReminderDrawer";
import { remindersAvailable } from "@/lib/service-reminders";
import { AddWaitlistDialog, type WaitlistDialogDefaults } from "@/components/AddWaitlistDialog";
import { BookingPanel } from "@/components/BookingPanel";
import { CreateInvoiceDialog } from "@/components/CreateInvoiceDialog";
import { InvoicingUpgradeDialog } from "@/components/InvoicingUpgradeDialog";
import { activeSortedFields, type LinkedRecordField } from "@/components/LinkedRecordDialogs";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState } from "@/components/ui-bits";
import { BookingsTab } from "@/components/client-profile/BookingsTab";
import { DetailsTab } from "@/components/client-profile/DetailsTab";
import {
  ProfileHeader,
  StatusBanner,
  SummaryStrip,
  type HeaderActions,
  type StripCell,
} from "@/components/client-profile/Header";
import { MessagesTab, useUnreadFromClient } from "@/components/client-profile/MessagesTab";
import {
  InvoicesCard,
  MoneyTiles,
  PackagesCard,
  PaymentsCard,
} from "@/components/client-profile/MoneyTab";
import { NotesFilesTab } from "@/components/client-profile/NotesFilesTab";
import { OverviewTab } from "@/components/client-profile/OverviewTab";
import { CountBadge } from "@/components/client-profile/parts";
import { RecordsTab } from "@/components/client-profile/RecordsTab";
import type { ServiceFollowUp, WaitlistEntry } from "@/lib/api/types";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { ApiError } from "@/lib/api";
import {
  useBookingsSettlements,
  useCustomer,
  useCustomerBookings,
  useCustomerCredits,
  useCustomerNotes,
  useLinkedRecord,
  useLinkedRecordDefinition,
  usePackages,
  usePaymentsList,
  useServices,
  useStaffList,
  useUpdateCustomerStatus,
} from "@/lib/api/hooks";
import { useInvoicingEntitled } from "@/lib/api/invoices";
import { customerDisplayName, type EntitlementView } from "@/lib/api/types";
import {
  availableTabs,
  bookingFilterCounts,
  bookingTitle,
  creditsSummary,
  defaultBookingFilter,
  isUpcomingBooking,
  longDate,
  moneyRows,
  monthYear,
  profilePill,
  profileSummary,
  resolveProfileTab,
  sessionsSubline,
  shortDate,
  weekdayDate,
  type BookingFilter,
  type DetailsSection,
  type ProfileTab,
} from "@/lib/client-profile";
import { PERMISSIONS } from "@/lib/permissions";
import { formatInTz, formatMoney, isoDate } from "@/lib/format";
import { suggestedBookingDate } from "@/lib/waitlist";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useIsPhone } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Deep-link support: `?tab=linked&record=<id>` lands on the client's vehicle from a booking.
 * Old tab names (`profile`, `payments`, `privacy`…) are redirected to their new home.
 */
const searchSchema = z.object({
  tab: z.string().optional(),
  record: z.string().optional(),
});

export const Route = createFileRoute("/clients/$clientId")({
  validateSearch: searchSchema,
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

const TAB_LABELS: Record<Exclude<ProfileTab, "linked">, string> = {
  overview: "Overview",
  bookings: "Bookings",
  money: "Money",
  messages: "Messages",
  notes: "Notes and files",
  details: "Details",
};

function ClientProfile() {
  const { clientId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tenant = useTenant();
  const isPhone = useIsPhone();
  const [nowMs] = useState(() => Date.now());

  const [quick, setQuick] = useState<QuickAction>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  // "Book" from a follow-up row: the service and vehicle come along with the client.
  const [bookingFollowUp, setBookingFollowUp] = useState<ServiceFollowUp | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  // A fresh object each time so "Show it" on the same reminder twice still scrolls.
  const [shownFollowUp, setShownFollowUp] = useState<{ id: string } | null>(null);
  // "Book" from a waitlist row: service, vehicle, place and person come along too, and
  // the entry closes itself once the booking exists.
  const [bookingWaitlist, setBookingWaitlist] = useState<WaitlistEntry | null>(null);
  const [waitlistDefaults, setWaitlistDefaults] = useState<WaitlistDialogDefaults | null>(null);
  const [editingWaitlist, setEditingWaitlist] = useState<WaitlistEntry | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [bookingFilter, setBookingFilter] = useState<BookingFilter | null>(null);
  const [recordFilter, setRecordFilter] = useState<{ id: string; label: string } | null>(null);
  const [messageFocus, setMessageFocus] = useState(0);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<ProfileTab | null>(null);
  const [section, setSection] = useState<{ name?: DetailsSection; key: number }>({ key: 0 });

  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const canEdit = tenant.can(PERMISSIONS.CUSTOMER_UPDATE);
  const canBook = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const showReminders = remindersAvailable(tenant.business?.industryTemplateKey);
  const canInvoiceRead = tenant.can(PERMISSIONS.INVOICE_READ);
  const canInvoiceManage = tenant.can(PERMISSIONS.INVOICE_MANAGE);
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";
  const currency = tenant.business?.currency ?? "GBP";

  const customer = useCustomer(clientId);
  const linkedRecordDefinition = useLinkedRecordDefinition();
  const bookings = useCustomerBookings(clientId);
  const credits = useCustomerCredits(clientId);
  const packages = usePackages();
  const payments = usePaymentsList({ customerId: clientId, enabled: canMoney });
  const notes = useCustomerNotes(clientId);
  const staff = useStaffList();
  const servicesForReminder = useServices();
  const updateStatus = useUpdateCustomerStatus();
  const invoicingEntitled = useInvoicingEntitled();
  const unread = useUnreadFromClient(clientId);
  const settlements = useBookingsSettlements(bookings.data ?? [], canMoney);

  const bookingList = useMemo(() => bookings.data ?? [], [bookings.data]);
  const paymentList = useMemo(() => payments.payments ?? [], [payments.payments]);
  const creditViews = useMemo(() => credits.data ?? [], [credits.data]);

  const hasSchema =
    activeSortedFields(
      (linkedRecordDefinition.data?.fields ?? []) as unknown as LinkedRecordField[],
    ).length > 0;
  const anonymised = customer.data?.status === "anonymised";
  const availability = {
    money: true,
    // Until the schema has loaded, keep a `?tab=linked` deep link rather than bouncing it.
    linked: linkedRecordDefinition.isLoading || hasSchema,
    anonymised,
  };
  const resolved = resolveProfileTab(search.tab, availability);
  const tab = resolved.tab;
  const tabs = availableTabs(availability).filter((t) => t !== "linked" || hasSchema);

  useEffect(() => {
    if (!customer.data || linkedRecordDefinition.isLoading || !search.tab) return;
    if (resolved.section) setSection((s) => ({ name: resolved.section, key: s.key + 1 }));
    if (search.tab === resolved.tab) return;
    void navigate({
      search: (s) => ({ ...s, tab: resolved.tab }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.data?.id, linkedRecordDefinition.isLoading, search.tab]);

  // "All N jobs" from the vehicle panel: arrive on Bookings filtered to that vehicle.
  const bookingsRecordId = search.tab === "bookings" ? search.record : undefined;
  const bookingsRecord = useLinkedRecord(bookingsRecordId);
  const [appliedRecord, setAppliedRecord] = useState<string | null>(null);
  useEffect(() => {
    if (!bookingsRecordId || appliedRecord === bookingsRecordId || !bookingsRecord.data) return;
    setAppliedRecord(bookingsRecordId);
    setRecordFilter({ id: bookingsRecordId, label: bookingsRecord.data.displayLabel });
  }, [bookingsRecordId, appliedRecord, bookingsRecord.data]);

  const summary = useMemo(
    () => profileSummary(clientId, bookingList, paymentList, nowMs),
    [clientId, bookingList, paymentList, nowMs],
  );
  const creditTotals = useMemo(() => creditsSummary(creditViews, nowMs), [creditViews, nowMs]);
  const filterCounts = useMemo(() => bookingFilterCounts(bookingList, nowMs), [bookingList, nowMs]);
  const upcoming = useMemo(
    () =>
      bookingList
        .filter((b) => isUpcomingBooking(b, nowMs))
        .sort((a, b) => a.start.localeCompare(b.start)),
    [bookingList, nowMs],
  );

  const packageName = (packageId: string | null) =>
    packages.data?.find((p) => p.id === packageId)?.name ?? "Package";
  const money = (minor: number, cur: string = currency) => formatMoney(minor, cur);
  const staffName = (id: string) => staff.data?.find((s) => s.id === id)?.displayName ?? null;
  const locationName = (id: string) => tenant.locations.find((l) => l.id === id)?.name ?? null;

  const rows = useMemo(
    () =>
      canMoney
        ? moneyRows({
            bookings: bookingList,
            settlementsByBooking: settlements.byBooking,
            payments: paymentList,
            packageName: (id) => packages.data?.find((p) => p.id === id)?.name ?? "Package",
            bookingLabel: (b) => `${bookingTitle(b)} · ${shortDate(b.start, timezone)}`,
            nowMs,
          })
        : [],
    [canMoney, bookingList, settlements.byBooking, paymentList, packages.data, nowMs, timezone],
  );

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
  const name = customerDisplayName(client);

  const switchTab = (next: ProfileTab) => {
    void navigate({
      search: (s) => ({ ...s, tab: next, record: next === "linked" ? s.record : undefined }),
      replace: true,
    });
  };
  const goTab = (next: ProfileTab) => {
    if (next === tab) return;
    if (tab === "details" && detailsDirty) {
      setPendingTab(next);
      return;
    }
    switchTab(next);
  };
  const goBookings = (filter: BookingFilter) => {
    setRecordFilter(null);
    setBookingFilter(filter);
    goTab("bookings");
  };
  const openNewBooking = () => setBookingOpen(true);
  const startInvoice = () => {
    if (invoicingEntitled === false) setUpsellOpen(true);
    else setInvoiceOpen(true);
  };

  const reactivate = async () => {
    await updateStatus.mutateAsync({
      customerId: client.id,
      version: client.version,
      status: "active",
    });
    toast.success(`${name} reactivated`);
  };
  const archive = async () => {
    const updated = await updateStatus.mutateAsync({
      customerId: client.id,
      version: client.version,
      status: "archived",
    });
    setConfirmArchive(false);
    toast.success(`${name} archived`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () =>
          updateStatus.mutate(
            { customerId: client.id, version: updated.version, status: "active" },
            { onSuccess: () => toast.success(`${name} is back in your client list`) },
          ),
      },
    });
  };

  const actions: HeaderActions = anonymised
    ? {}
    : {
        message: () => {
          goTab("messages");
          setMessageFocus((n) => n + 1);
        },
        newBooking: canBook ? openNewBooking : undefined,
        sellPackage: () => setQuick("package"),
        addToWaitlist: () => setWaitlistDefaults({ customerId: client.id }),
        setReminder: canBook && showReminders ? () => setReminderOpen(true) : undefined,
        newInvoice: canInvoiceManage ? startInvoice : undefined,
        archive: canEdit && client.status === "active" ? () => setConfirmArchive(true) : undefined,
        reactivate: canEdit && client.status === "archived" ? () => void reactivate() : undefined,
      };

  const pill = profilePill(
    client,
    { owedMinor: summary.owedMinor, creditsLeft: creditTotals.left, sessions: summary.attended },
    nowMs,
  );

  const next = summary.nextBooking;
  const nextTz = next?.timezone || timezone;
  const cells: StripCell[] = [
    {
      key: "sessions",
      label: "Sessions",
      value: String(summary.attended),
      sub: sessionsSubline(summary),
      aria: `${summary.attended} sessions ${sessionsSubline(summary)}`,
      onClick: () => goBookings("past"),
    },
  ];
  if (!isPhone) {
    cells.push({
      key: "next",
      label: "Next booking",
      value: next ? weekdayDate(next.start, nextTz) : "Nothing booked",
      sub: next
        ? `${next.allDay ? "All day" : formatInTz(next.start, nextTz, { timeStyle: "short" })} · ${bookingTitle(next)}`
        : canBook && !anonymised
          ? "Book"
          : "",
      subTone: !next && canBook && !anonymised ? "blue" : undefined,
      aria: next
        ? `Next booking ${weekdayDate(next.start, nextTz)}, ${bookingTitle(next)}`
        : "Nothing booked",
      onClick: () => (!next && canBook && !anonymised ? openNewBooking() : goBookings("upcoming")),
    });
  }
  cells.push({
    key: "credits",
    label: "Credits",
    value: creditTotals.left > 0 ? `${creditTotals.left} left` : "None",
    sub:
      creditTotals.activePackages > 0
        ? `of ${creditTotals.issued}${creditTotals.soonestExpiry ? ` · expires ${new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: timezone }).format(new Date(creditTotals.soonestExpiry))}` : ""}`
        : "No package",
    subTone: creditTotals.expiringSoon ? "amber" : undefined,
    aria: `${creditTotals.left} credits left`,
    onClick: () => goTab("money"),
  });
  if (canMoney) {
    cells.push(
      {
        key: "spent",
        label: "Spent",
        value: money(summary.spentMinor),
        sub: `since ${monthYear(client.createdAt, timezone)}`,
        aria: `Spent ${money(summary.spentMinor)} since ${monthYear(client.createdAt, timezone)}`,
        onClick: () => goTab("money"),
      },
      {
        key: "owes",
        label: "Owes",
        value: money(summary.owedMinor),
        sub:
          summary.owedMinor > 0
            ? `${summary.owedBookingIds.length} booking${summary.owedBookingIds.length === 1 ? "" : "s"}`
            : "all paid up",
        subTone: summary.owedMinor > 0 ? "red" : "green",
        aria:
          summary.owedMinor > 0
            ? `Owes ${money(summary.owedMinor)} on ${summary.owedBookingIds.length} bookings`
            : "Owes nothing, all paid up",
        onClick: () => goTab("money"),
      },
    );
  }

  const purchaseLine = (view: EntitlementView) => {
    const paid = paymentList.find(
      (p) => p.packagePurchaseId && p.packagePurchaseId === view.entitlement.purchaseId,
    );
    const issuedAt = view.entitlement.createdAt;
    if (!issuedAt) return null;
    const bought = `bought ${shortDate(issuedAt, timezone)}`;
    return paid && canMoney ? `${bought} for ${money(paid.amountMinor, paid.currency)}` : bought;
  };

  const recordsLabel = linkedRecordDefinition.data?.definition.pluralLabel ?? "Records";
  const serviceNoun = tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service";
  const notesCount = (notes.data ?? []).length;

  const tabLabel = (t: ProfileTab) => (t === "linked" ? recordsLabel : TAB_LABELS[t]);
  const badge = (t: ProfileTab) => {
    if (t === "bookings" && bookingList.length > 0) {
      return <CountBadge tone="grey">{bookingList.length}</CountBadge>;
    }
    if (t === "messages" && unread > 0) return <CountBadge tone="amber">{unread}</CountBadge>;
    if (t === "notes" && notesCount > 0) return <CountBadge tone="grey">{notesCount}</CountBadge>;
    return null;
  };
  const badgeLabel = (t: ProfileTab) =>
    t === "messages" && unread > 0
      ? `Messages, ${unread} unread`
      : t === "bookings" && bookingList.length > 0
        ? `Bookings, ${bookingList.length}`
        : t === "notes" && notesCount > 0
          ? `Notes and files, ${notesCount}`
          : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-[18px]">
      <ProfileHeader
        client={client}
        pill={pill}
        timezone={timezone}
        actions={actions}
        isPhone={isPhone}
      />

      {anonymised ? (
        <StatusBanner tone="red">
          This client has been anonymised. Personal details were removed on{" "}
          {longDate(client.updatedAt ?? client.createdAt, timezone)}.
        </StatusBanner>
      ) : client.status === "archived" ? (
        <StatusBanner
          tone="grey"
          action={
            canEdit ? (
              <Button
                size="sm"
                variant="outline"
                disabled={updateStatus.isPending}
                onClick={() => void reactivate()}
              >
                Reactivate
              </Button>
            ) : null
          }
        >
          Archived. Hidden from your client list.
        </StatusBanner>
      ) : null}

      {anonymised ? null : <SummaryStrip cells={cells} isPhone={isPhone} />}

      <Tabs value={tab} onValueChange={(v) => goTab(v as ProfileTab)}>
        <TabsList
          className={cn(
            "gap-x-[26px]",
            isPhone && "sticky top-0 z-20 -mx-4 bg-background px-4 sm:static",
          )}
        >
          {tabs.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              aria-label={badgeLabel(t)}
              className="px-0 text-[14.5px] font-semibold data-[state=active]:border-foreground data-[state=active]:font-extrabold"
            >
              {isPhone && t === "notes" ? "Notes" : tabLabel(t)}
              {badge(t)}
            </TabsTrigger>
          ))}
        </TabsList>

        {anonymised ? null : (
          <TabsContent value="overview" className="mt-4">
            <OverviewTab
              client={client}
              timezone={timezone}
              nowMs={nowMs}
              upcoming={upcoming}
              notes={notes.data ?? []}
              credits={creditViews}
              staffName={staffName}
              locationName={locationName}
              packageName={(id) => packageName(id)}
              purchaseLine={purchaseLine}
              money={money}
              canBook={canBook}
              canEdit={canEdit}
              canMoney
              highlight={shownFollowUp}
              onOpenBooking={setSelectedBookingId}
              onAllBookings={() => goBookings("upcoming")}
              onNewBooking={openNewBooking}
              onBookFollowUp={(f) => {
                setBookingFollowUp(f);
                setBookingOpen(true);
              }}
              onRemind={showReminders ? () => setReminderOpen(true) : undefined}
              onBookWaitlist={(e) => {
                setBookingWaitlist(e);
                setBookingOpen(true);
              }}
              onEditWaitlist={setEditingWaitlist}
              onAllNotes={() => goTab("notes")}
              onMoney={() => goTab("money")}
              onDetails={() => goTab("details")}
            />
          </TabsContent>
        )}

        <TabsContent value="bookings" className="mt-4">
          <BookingsTab
            bookings={bookingList}
            filter={bookingFilter ?? defaultBookingFilter(filterCounts)}
            onFilter={setBookingFilter}
            record={recordFilter}
            onClearRecord={() => setRecordFilter(null)}
            timezone={timezone}
            nowMs={nowMs}
            staffName={staffName}
            money={money}
            settlements={settlements.byBooking}
            serviceNoun={serviceNoun}
            staffNoun={tenant.terminology.staff}
            bookingNoun={tenant.terminology.booking}
            onOpenBooking={setSelectedBookingId}
            isPhone={isPhone}
          />
        </TabsContent>

        <TabsContent value="money" className="mt-4 grid gap-4">
          {canMoney ? (
            <>
              <MoneyTiles
                spent={money(summary.spentMinor)}
                refunded={summary.refundedMinor > 0 ? money(summary.refundedMinor) : null}
                owed={summary.owedMinor > 0 ? money(summary.owedMinor) : null}
                owedBookingIds={summary.owedBookingIds}
                oldestOwedAt={summary.oldestOwedAt}
                credits={creditTotals}
                timezone={timezone}
                readOnly={anonymised}
              />
              <PaymentsCard
                rows={rows}
                loading={payments.isLoading || bookings.isLoading || settlements.isLoading}
                timezone={timezone}
                money={money}
                onOpenBooking={setSelectedBookingId}
                isPhone={isPhone}
              />
            </>
          ) : null}
          <PackagesCard
            clientId={client.id}
            firstName={client.firstName}
            slug={tenant.business?.slug ?? null}
            credits={creditViews}
            loading={credits.isLoading}
            error={credits.isError}
            packageName={(id) => packageName(id)}
            timezone={timezone}
            nowMs={nowMs}
            canAdjust={tenant.can(PERMISSIONS.CREDIT_ADJUST)}
            readOnly={anonymised}
            onSellPackage={() => setQuick("package")}
          />
          {canInvoiceRead ? (
            <InvoicesCard
              customerId={client.id}
              canManage={canInvoiceManage}
              readOnly={anonymised}
              entitled={invoicingEntitled}
              onNewInvoice={startInvoice}
            />
          ) : null}
        </TabsContent>

        {anonymised ? null : (
          <>
            <TabsContent value="messages" className="mt-4">
              <MessagesTab
                customerId={client.id}
                firstName={client.firstName}
                timezone={timezone}
                focusKey={messageFocus}
                isPhone={isPhone}
              />
            </TabsContent>

            <TabsContent value="linked" className="mt-4">
              <RecordsTab
                customerId={client.id}
                disabled={anonymised}
                focusRecordId={search.record}
                bookings={bookingList}
                timezone={timezone}
                nowMs={nowMs}
                onShowBookings={(record) => {
                  setRecordFilter(record);
                  setBookingFilter("all");
                  goTab("bookings");
                }}
              />
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <NotesFilesTab
                customerId={client.id}
                notes={notes.data ?? []}
                timezone={timezone}
                canUpload={canEdit}
              />
            </TabsContent>

            <TabsContent value="details" className="mt-4">
              <DetailsTab
                client={client}
                timezone={timezone}
                canEdit={canEdit}
                canExport={tenant.can(PERMISSIONS.CUSTOMER_EXPORT)}
                section={section.name}
                sectionKey={section.key}
                onArchive={canEdit ? () => setConfirmArchive(true) : undefined}
                onReactivate={canEdit ? () => void reactivate() : undefined}
                onDirtyChange={setDetailsDirty}
                onRefresh={() => void customer.refetch()}
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      <ReminderDrawer
        target={
          reminderOpen && showReminders ? { mode: "add", who: "one", customerId: client.id } : null
        }
        onClose={() => setReminderOpen(false)}
        services={servicesForReminder.data ?? []}
        canStopScheduled={canBook}
        onShowExisting={(f) => {
          goTab("overview");
          setShownFollowUp({ id: f.id });
        }}
        onCreated={(f) => {
          goTab("overview");
          setShownFollowUp({ id: f.id });
        }}
      />

      <AddBookingModal
        key={bookingWaitlist?.id ?? bookingFollowUp?.id ?? "plain"}
        open={bookingOpen}
        onOpenChange={(open) => {
          setBookingOpen(open);
          if (!open) {
            setBookingFollowUp(null);
            setBookingWaitlist(null);
          }
        }}
        defaultCustomerId={client.id}
        defaultServiceId={bookingWaitlist?.serviceId ?? bookingFollowUp?.serviceId}
        defaultLinkedRecordId={
          bookingWaitlist?.linkedRecordId ?? bookingFollowUp?.linkedRecordId ?? undefined
        }
        defaultStaffId={bookingWaitlist?.staffId ?? undefined}
        defaultDate={
          bookingWaitlist
            ? suggestedBookingDate(bookingWaitlist.preferences, isoDate(new Date()))
            : undefined
        }
        waitlistEntryId={bookingWaitlist?.id}
        onNoAvailability={(picked) => {
          setBookingOpen(false);
          setWaitlistDefaults({ ...picked, from: picked.date });
        }}
      />
      <AddWaitlistDialog
        open={waitlistDefaults !== null}
        onOpenChange={(open) => {
          if (!open) setWaitlistDefaults(null);
        }}
        defaults={waitlistDefaults ?? undefined}
      />
      <AddWaitlistDialog
        open={editingWaitlist !== null}
        onOpenChange={(open) => {
          if (!open) setEditingWaitlist(null);
        }}
        entry={editingWaitlist}
      />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} customerId={client.id} />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        defaultCustomerId={client.id}
      />
      <InvoicingUpgradeDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        onEnabled={() => setInvoiceOpen(true)}
      />

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {client.firstName} will be hidden from your client list. Bookings, payments and
              history stay, and you can reactivate them any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateStatus.isPending}
              onClick={(e) => {
                e.preventDefault();
                void archive();
              }}
            >
              {updateStatus.isPending ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingTab !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTab(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You've changed {client.firstName}'s details without saving. Leaving now loses them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingTab;
                setPendingTab(null);
                setDetailsDirty(false);
                if (target) switchTab(target);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
