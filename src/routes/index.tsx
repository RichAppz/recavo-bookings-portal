import { useState, type ReactNode } from "react";
import { z } from "zod";
import { createFileRoute, Link, Navigate, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarPlus, Lock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AddWaitlistDialog, type WaitlistDialogDefaults } from "@/components/AddWaitlistDialog";
import { EventModal } from "@/components/EventModal";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { BookingPanel } from "@/components/BookingPanel";
import { EmptyState } from "@/components/ui-bits";
import { PageGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import { AttentionCard, AttentionStrip, type WorthALook } from "@/components/overview/Attention";
import { CustomiseSheet } from "@/components/overview/Customise";
import {
  AttendanceCard,
  Footnote,
  HeadlineNumbers,
  MoneyInCard,
  PerformanceHeader,
} from "@/components/overview/Performance";
import { QuickActionsCard } from "@/components/overview/QuickActionsCard";
import { TodayCard } from "@/components/overview/TodayCard";
import { UpNextCard, UpNextEmpty, UpNextGhost } from "@/components/overview/UpNext";
import { MoneyProvider, useMoney, useNow, useOverviewPrefs } from "@/components/overview/shared";
import {
  useActionWindow,
  usePeriodBookings,
  usePeriodDashboards,
  useTodayBookings,
  useTrend,
} from "@/components/overview/data";
import { useIsMobile } from "@/hooks/use-mobile";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useAuth } from "@/lib/auth/auth-store";
import { useTenant } from "@/lib/tenant/tenant-context";
import { saasPurchasesAllowedInApp } from "@/lib/native";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useBusinessOnboarding,
  useConnectAccount,
  useCustomersById,
  usePackageRequests,
  useStaffList,
  useWaitlistSummary,
} from "@/lib/api/hooks";
import { useUpsellOffersSummary } from "@/lib/api/upsells";
import { ApiError } from "@/lib/api";
import { customerDisplayName, type CalendarBlock } from "@/lib/api/types";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { bookingSettlement } from "@/lib/booking-payment";
import { formatInTz } from "@/lib/format";
import { bookingUrlFor } from "@/lib/hosts";
import { hiddenNavFrom } from "@/lib/nav-features";
import { requestSetup } from "@/lib/onboarding/setup-prompt";
import { isSessionEntry } from "@/lib/session-landing";
import { useSoloPlan } from "@/lib/sole";
import { localDay } from "@/lib/working-days";
import {
  LEFT_COLUMN,
  PERFORMANCE_CARDS,
  QUICK_ACTIONS,
  RIGHT_COLUMN,
  attendanceToMark,
  attentionItems,
  busiestWeekday,
  firstName,
  greetingFor,
  groupOrder,
  hourIn,
  moneyDue,
  nounFor,
  paymentsToCollect,
  periodWindow,
  phoneOrder,
  pickUpNext,
  shortDayLabel,
  type AttentionItem,
  type OverviewCard,
  type QuickActionKey,
} from "@/lib/overview";

const homeSearchSchema = z.object({
  email: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: homeSearchSchema,
  beforeLoad: ({ search }) => {
    const email = search.email?.trim();
    if (email) {
      throw redirect({ to: "/register", search: { email } });
    }
  },
  head: () => ({
    meta: [
      { title: "Overview — RECAVO" },
      {
        name: "description",
        content:
          "Live business overview for RECAVO: today's sessions, revenue, attendance and tasks needing attention.",
      },
      { property: "og:title", content: "Overview — RECAVO" },
      {
        property: "og:description",
        content:
          "Live business overview for RECAVO: today's sessions, revenue, attendance and tasks needing attention.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <Home />
      </AppShell>
    </RequireAuth>
  ),
});

/** Dashboard requires REPORT_READ *and* plan feature `reports.basic` (RECA-157). */
function isPlanGated(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 402 || (error.status === 403 && error.code === "FEATURE_NOT_AVAILABLE"))
  );
}

/**
 * Once setup is done the working view is the calendar, so that is where the app
 * opens. While the checklist is still in progress the Overview (which hosts it)
 * stays the landing page.
 */
function Home() {
  // Captured on first render, before the shell marks the session as landed.
  const [entry] = useState(isSessionEntry);
  const onboarding = useBusinessOnboarding();

  if (entry) {
    if (onboarding.isLoading) return <PageGhost />;
    const status = onboarding.data?.status;
    if (status === "complete" || status === "dismissed") {
      return <Navigate to="/calendar" replace />;
    }
  }
  return <OverviewPage />;
}

function OverviewPage() {
  const tenant = useTenant();
  const { user } = useAuth();
  const { prefs, update } = useOverviewPrefs(tenant.businessId, user?.id);
  const canSeeMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  return (
    <MoneyProvider
      currency={tenant.business?.currency ?? "GBP"}
      hidden={prefs.hideAmounts && canSeeMoney}
      allowed={canSeeMoney}
    >
      <Overview prefs={prefs} update={update} />
    </MoneyProvider>
  );
}

function Overview({
  prefs,
  update,
}: {
  prefs: ReturnType<typeof useOverviewPrefs>["prefs"];
  update: ReturnType<typeof useOverviewPrefs>["update"];
}) {
  const tenant = useTenant();
  const { user } = useAuth();
  const money = useMoney();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const variant = isMobile ? "phone" : "desktop";
  const now = useNow();
  const timeZone = tenant.business?.defaultTimezone ?? "Europe/London";
  const industry = tenant.business?.industryTemplateKey;
  const detailer = industry === "car_detailing";
  const bookingNoun = tenant.terminology.booking.trim() || "Booking";
  const hiddenNav = hiddenNavFrom(tenant.configuration);
  const packagesOn = !hiddenNav.has("packages");
  const soloPlan = useSoloPlan();

  const [quick, setQuick] = useState<QuickAction>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [waitlistDefaults, setWaitlistDefaults] = useState<WaitlistDialogDefaults | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarBlock | null>(null);
  const [customiseOpen, setCustomiseOpen] = useState(false);

  /* ---------- data ---------- */
  const today = useTodayBookings(timeZone, now);
  const actionWindow = useActionWindow(timeZone, now);
  const staff = useStaffList();
  const myStaff = staff.data?.find((s) => s.userId === user?.id) ?? null;
  // A trainer's Up next is their own next session; owners and managers see the business's.
  const trainerView = Boolean(myStaff) && !tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const upNext = pickUpNext(
    trainerView
      ? actionWindow.bookings.filter((b) => b.staffId === myStaff?.id)
      : actionWindow.bookings,
    now,
  );
  const todayIso = localDay(now.toISOString(), timeZone);
  const upNextDay = upNext ? localDay(upNext.start, upNext.timezone || timeZone) : null;
  const upNextShown =
    upNext &&
    upNextDay &&
    (upNextDay === todayIso || shortDayLabel(upNextDay, todayIso) === "tomorrow")
      ? upNext
      : null;

  const canReports = tenant.can(PERMISSIONS.REPORT_READ);
  const win = periodWindow(prefs.period, timeZone, now);
  const dashboards = usePeriodDashboards(win.range, win.previous, canReports);
  const periodBookings = usePeriodBookings(win.fromDate, win.endDate, timeZone);
  const trend = useTrend(
    prefs.period,
    timeZone,
    now,
    canReports && !isMobile && prefs.period !== "all",
  );
  const current = dashboards.current.data;
  const gated = dashboards.current.isError && isPlanGated(dashboards.current.error);
  const statsPending = dashboards.current.isLoading || (!tenant.business && tenant.isLoading);
  const stillToCollect = win.fromDate
    ? periodBookings.bookings
        .filter(moneyDue)
        .reduce((sum, b) => sum + bookingSettlement(b).outstandingMinor, 0)
    : null;
  const busiestDay = busiestWeekday(
    periodBookings.bookings
      .filter((b) => b.status !== "cancelled_by_customer" && b.status !== "cancelled_by_business")
      .map((b) => localDay(b.start, b.timezone || timeZone)),
  );
  const connect = useConnectAccount();
  const onlinePaymentsOff = connect.isSuccess && !connect.data?.chargesEnabled;

  /* ---------- needs your attention ---------- */
  const canReadAll = tenant.can(PERMISSIONS.BOOKING_READ_ALL);
  const canPackages = tenant.can(PERMISSIONS.PACKAGE_MANAGE);
  const canMark = tenant.can(PERMISSIONS.BOOKING_MARK_ATTENDANCE);
  const toCollect = money.allowed ? paymentsToCollect(actionWindow.bookings, now) : [];
  const toMark = canMark ? attendanceToMark(actionWindow.bookings, now) : [];
  const packageRequests = usePackageRequests("pending", { enabled: canPackages });
  const requests = packageRequests.data ?? [];
  const waitlist = useWaitlistSummary({ enabled: canReadAll });
  const upsells = useUpsellOffersSummary({ enabled: canReadAll });
  const sms = useSmsCreditsSummary();
  const onboarding = useBusinessOnboarding();
  const names = useCustomersById([
    ...toCollect.slice(0, 2).map((b) => b.leadCustomerId),
    ...requests.slice(0, 2).map((r) => r.customerId),
  ]);
  const nameOf = (id: string | null | undefined) => {
    const c = id ? names.get(id) : undefined;
    return c ? customerDisplayName(c) : "A client";
  };
  const setupDone =
    !onboarding.data ||
    onboarding.data.status === "complete" ||
    onboarding.data.status === "dismissed" ||
    onboarding.data.percentComplete >= 100;
  const setupLeft = Math.max(
    0,
    (onboarding.data?.requiredTotal ?? 0) - (onboarding.data?.requiredCompleted ?? 0),
  );
  const nextStep = onboarding.data?.steps.find((s) => s.required && !s.completed && !s.skipped);
  const items = attentionItems({
    detailer,
    bookingNoun,
    payments: {
      count: toCollect.length,
      who: toCollect
        .slice(0, 2)
        .map(
          (b) =>
            `${nameOf(b.leadCustomerId)} ${shortDayLabel(localDay(b.start, b.timezone || timeZone), todayIso)}`,
        ),
      totalLabel:
        toCollect.length > 0
          ? money.format(toCollect.reduce((s, b) => s + bookingSettlement(b).outstandingMinor, 0))
          : null,
    },
    attendance: {
      count: toMark.length,
      single: toMark[0]
        ? `${toMark[0].serviceSnapshot.name}, ${formatInTz(toMark[0].start, toMark[0].timezone || timeZone, { hour: "2-digit", minute: "2-digit" })}`
        : null,
    },
    packageRequests: {
      count: requests.length,
      who: requests
        .slice(0, 2)
        .map((r) => `${nameOf(r.customerId)} · ${r.packageName} ${money.format(r.priceMinor)}`),
    },
    addOns: { count: upsells.data?.requested ?? 0 },
    waitlist: { count: waitlist.data?.waiting ?? 0 },
    sms:
      tenant.can(PERMISSIONS.BUSINESS_UPDATE) && (sms.level === "low" || sms.level === "empty")
        ? { balance: sms.credits?.balance ?? 0, low: true }
        : undefined,
    setup: setupDone ? undefined : { left: setupLeft, next: nextStep?.title ?? null },
  });
  const worth: WorthALook[] = [
    ...(packagesOn && canPackages
      ? [{ key: "expiring", label: "Packages nearing expiry", to: "/packages" as const }]
      : []),
    ...(tenant.can(PERMISSIONS.CUSTOMER_READ)
      ? [{ key: "messages", label: "Client messages", to: "/messages" as const }]
      : []),
    ...(tenant.can(PERMISSIONS.BUSINESS_READ)
      ? [
          {
            key: "availability",
            label: soloPlan ? "Your availability" : "Staff availability",
            to: "/staff" as const,
          },
        ]
      : []),
  ];

  const onAttention = (item: AttentionItem) => {
    switch (item.kind) {
      case "payments":
        if (toCollect.length === 1 && toCollect[0]) setSelectedBookingId(toCollect[0].id);
        else void navigate({ to: "/bookings" });
        return;
      case "attendance":
        if (toMark.length === 1 && toMark[0]) setSelectedBookingId(toMark[0].id);
        else void navigate({ to: "/bookings" });
        return;
      case "package_requests":
        if (requests.length === 1 && requests[0]) {
          void navigate({ to: "/packages", search: { request: requests[0].id } });
        } else void navigate({ to: "/packages" });
        return;
      case "add_ons":
        void navigate({ to: "/bookings" });
        return;
      case "waitlist":
        void navigate({ to: "/waitlist" });
        return;
      case "sms_low":
        void navigate({ to: "/billing/sms-credits" });
        return;
      case "setup":
        requestSetup();
        return;
    }
  };

  /* ---------- actions ---------- */
  const slug = tenant.business?.slug;
  const copyLink = async () => {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(bookingUrlFor(slug));
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link", { description: bookingUrlFor(slug) });
    }
  };
  const shareLink = async () => {
    if (!slug) return;
    const url = bookingUrlFor(slug);
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url, title: tenant.business?.tradingName ?? "Book with us" });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copyLink();
  };
  const quickActions = prefs.quickOrder.filter(
    (k) =>
      QUICK_ACTIONS.includes(k) &&
      !(k === "group" && detailer) &&
      !(k === "sell_package" && !packagesOn) &&
      !(k === "add_waitlist" && hiddenNav.has("waitlist")),
  );
  const onQuick = (key: QuickActionKey) => {
    switch (key) {
      case "add_booking":
        setBookingOpen(true);
        return;
      case "group":
        setQuick("group");
        return;
      case "add_event":
        setEditingEvent(null);
        setEventOpen(true);
        return;
      case "add_client":
        setQuick("client");
        return;
      case "add_waitlist":
        setWaitlistDefaults({});
        return;
      case "sell_package":
        setQuick("package");
        return;
      case "send_message":
        setQuick("message");
        return;
      case "block_time":
        setQuick("block");
        return;
      case "copy_link":
        void copyLink();
        return;
    }
  };

  /* ---------- header ---------- */
  const first = firstName(user?.name);
  const greeting = `${greetingFor(hourIn(timeZone, now))}${first ? `, ${first}` : ""}`;
  const todayCount = today.bookings.length;
  const todayExpected = today.bookings.reduce((s, b) => s + b.priceMinor, 0);
  const longDate = formatInTz(now.toISOString(), timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const shortDate = formatInTz(now.toISOString(), timeZone, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const countText = `${todayCount} ${nounFor(bookingNoun, todayCount)} today`;
  const businessName = tenant.businesses.length > 1 ? tenant.business?.tradingName : null;

  const firstBookingStep = onboarding.data?.steps.find((s) => s.key === "first_booking");
  const newBusiness =
    Boolean(firstBookingStep && !firstBookingStep.completed) &&
    actionWindow.query.isSuccess &&
    actionWindow.bookings.length === 0 &&
    todayCount === 0;

  const cardLabels: Record<OverviewCard, string> = {
    up_next: "Up next",
    today: "Today",
    attention: "Needs your attention",
    quick: "Quick actions",
    headline: "Headline numbers",
    money: "Money in",
    attendance: detailer ? "Job outcomes" : "Attendance",
  };
  const visible = (c: OverviewCard) => !prefs.hidden.includes(c);

  /* ---------- cards ---------- */
  const retryToday = () => {
    void today.query.refetch();
    void today.events.refetch();
  };
  const cards: Record<OverviewCard, () => ReactNode> = {
    up_next: () =>
      actionWindow.query.isLoading ? (
        <UpNextGhost />
      ) : upNextShown ? (
        <UpNextCard
          booking={upNextShown}
          now={now}
          timeZone={timeZone}
          onOpen={() => setSelectedBookingId(upNextShown.id)}
        />
      ) : (
        <UpNextEmpty
          firstBooking={newBusiness}
          bookingNoun={bookingNoun}
          onShare={() => void shareLink()}
          onAdd={() => setBookingOpen(true)}
        />
      ),
    today: () =>
      newBusiness ? null : (
        <TodayCard
          bookings={today.bookings}
          events={today.events.data ?? []}
          loading={today.query.isLoading}
          error={today.query.isError}
          onRetry={retryToday}
          now={now}
          timeZone={timeZone}
          variant={variant}
          onOpenBooking={setSelectedBookingId}
          onOpenEvent={(block) => {
            setEditingEvent(block);
            setEventOpen(true);
          }}
          onAdd={() => setBookingOpen(true)}
        />
      ),
    attention: () =>
      isMobile ? (
        <AttentionStrip items={items} onSelect={onAttention} worth={worth} />
      ) : (
        <AttentionCard
          items={items}
          loading={actionWindow.query.isLoading}
          error={actionWindow.query.isError}
          onRetry={() => void actionWindow.query.refetch()}
          onSelect={onAttention}
          worth={worth}
        />
      ),
    quick: () => (
      <QuickActionsCard
        actions={quickActions.filter((k) => !prefs.quickHidden.includes(k))}
        bookingNoun={bookingNoun}
        onAction={onQuick}
        bare={isMobile}
      />
    ),
    headline: () => (
      <HeadlineNumbers
        win={win}
        current={current}
        previous={dashboards.previous.data}
        trend={trend}
        industry={industry}
        bookingNoun={bookingNoun}
        loading={statsPending}
        error={dashboards.current.isError}
        onRetry={() => void dashboards.current.refetch()}
        newBusiness={newBusiness}
        variant={variant}
      />
    ),
    money: () => (
      <MoneyInCard
        win={win}
        current={current}
        loading={statsPending}
        error={dashboards.current.isError}
        onRetry={() => void dashboards.current.refetch()}
        stillToCollect={stillToCollect}
        packagesOn={packagesOn}
        onlinePaymentsOff={onlinePaymentsOff}
        bookingNoun={bookingNoun}
      />
    ),
    attendance: () => (
      <AttendanceCard
        win={win}
        current={current}
        loading={statsPending}
        error={dashboards.current.isError}
        onRetry={() => void dashboards.current.refetch()}
        industry={industry}
        bookingNoun={bookingNoun}
        packagesOn={packagesOn}
        busiestDay={busiestDay}
      />
    ),
  };
  const render = (list: readonly OverviewCard[]) =>
    list.filter(visible).map((c) => {
      const node = cards[c]();
      return node ? <div key={c}>{node}</div> : null;
    });

  const performanceHeader = (
    <PerformanceHeader
      win={win}
      period={prefs.period}
      onPeriod={(period) => update({ period })}
      hideAmounts={prefs.hideAmounts}
      onHideAmounts={(hideAmounts) => update({ hideAmounts })}
      onCustomise={() => setCustomiseOpen(true)}
      locationOnly={tenant.currentLocationId !== "all"}
      variant={variant}
      canSeeMoney={money.allowed}
    />
  );
  const performanceGate = !canReports ? (
    <EmptyState
      title="Reports are restricted"
      description="Ask a business owner or administrator to grant you report access to see revenue and attendance."
    />
  ) : gated ? (
    <EmptyState
      icon={<Lock className="size-5" />}
      title={
        saasPurchasesAllowedInApp()
          ? "Upgrade your plan for reports"
          : "Reports aren't on your plan"
      }
      description="Revenue, attendance and occupancy reporting isn't included on your current plan."
      action={
        saasPurchasesAllowedInApp() ? (
          <Button variant="outline" asChild>
            <Link to="/settings/$page" params={{ page: "plan" }}>
              View plans
            </Link>
          </Button>
        ) : undefined
      }
    />
  ) : null;

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-[30px] font-extrabold tracking-[-0.025em] md:text-[32px] md:leading-tight">
          {greeting}
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground md:text-sm">
          {isMobile ? (
            <>
              {shortDate} · <strong className="font-bold text-foreground">{countText}</strong>
              {money.allowed && todayExpected > 0
                ? ` · ${money.format(todayExpected)} expected`
                : ""}
            </>
          ) : (
            <>
              {longDate}
              {businessName ? ` · ${businessName}` : ""} ·{" "}
              <strong className="font-bold text-foreground">{countText}</strong>
            </>
          )}
        </p>
      </div>
      {isMobile ? null : (
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/reports">View reports</Link>
          </Button>
          <Button onClick={() => setBookingOpen(true)}>
            <CalendarPlus className="size-4" /> Add {nounFor(bookingNoun, 1)}
          </Button>
        </div>
      )}
    </header>
  );

  const perfCards = groupOrder(prefs.order, PERFORMANCE_CARDS).filter(visible);
  const desktop = (
    <div className="space-y-6 lg:px-1">
      {header}
      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        <div className="min-w-0 space-y-4">{render(groupOrder(prefs.order, LEFT_COLUMN))}</div>
        <div className="min-w-0 space-y-4">{render(groupOrder(prefs.order, RIGHT_COLUMN))}</div>
      </div>
      <section aria-label="Performance" className="space-y-4 pt-2">
        {performanceHeader}
        {performanceGate ?? (
          <>
            {perfCards.includes("headline") ? cards.headline() : null}
            {perfCards.some((c) => c !== "headline") ? (
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {perfCards
                  .filter((c) => c !== "headline")
                  .map((c) => (
                    <div key={c} className="min-w-0 empty:hidden">
                      {cards[c]()}
                    </div>
                  ))}
              </div>
            ) : null}
            <Footnote current={current} bookingNoun={bookingNoun} />
          </>
        )}
      </section>
    </div>
  );

  const phoneCards = phoneOrder(prefs).filter(visible);
  const firstPerf = phoneCards.findIndex((c) => PERFORMANCE_CARDS.includes(c));
  const phone = (
    <div className="space-y-3">
      {header}
      {phoneCards.map((c, i) => {
        const isPerf = PERFORMANCE_CARDS.includes(c);
        if (isPerf && performanceGate) {
          return i === firstPerf ? (
            <div key={c} className="space-y-3 pt-2">
              {performanceHeader}
              {performanceGate}
            </div>
          ) : null;
        }
        const node = cards[c]();
        if (!node) return null;
        return (
          <div key={c} className={i === firstPerf ? "space-y-3 pt-2" : undefined}>
            {i === firstPerf ? performanceHeader : null}
            {node}
          </div>
        );
      })}
      {firstPerf >= 0 && !performanceGate ? (
        <Footnote current={current} bookingNoun={bookingNoun} />
      ) : null}
    </div>
  );

  return (
    <>
      {isMobile ? phone : desktop}

      <CustomiseSheet
        open={customiseOpen}
        onOpenChange={setCustomiseOpen}
        prefs={prefs}
        update={update}
        cardLabels={cardLabels}
        quickActions={quickActions}
        bookingNoun={bookingNoun}
        side={isMobile ? "bottom" : "right"}
      />
      <AddBookingModal
        open={bookingOpen}
        onOpenChange={setBookingOpen}
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
      <EventModal
        open={eventOpen}
        onOpenChange={(o) => {
          setEventOpen(o);
          if (!o) setEditingEvent(null);
        }}
        block={editingEvent}
      />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
    </>
  );
}
