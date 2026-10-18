import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Banknote,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Building2,
  CalendarDays,
  Car,
  ClipboardList,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Gift,
  Hourglass,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Link2,
  ListChecks,
  LogOut,
  MapPin,
  MessageSquare,
  MessageSquareText,
  Menu,
  Package,
  Palette,
  Plus,
  Settings,
  Sparkles,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteAccountDialog } from "@/components/DeleteAccountSection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardMenu, type MenuItemDef, type MoreRowDef } from "@/components/DashboardMenu";
import { GlobalSearch, type SearchablePage } from "@/components/GlobalSearch";
import { Wordmark } from "@/components/Wordmark";
import { PushBellPrompt } from "@/components/PushBellPrompt";
import { AddBookingModal } from "@/components/AddBookingModal";
import { EventModal } from "@/components/EventModal";
import { AddWaitlistDialog, type WaitlistDialogDefaults } from "@/components/AddWaitlistDialog";
import { AddBusinessDialog } from "@/components/AddBusinessDialog";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { DemoTour } from "@/components/DemoTour";
import { BillingBanner } from "@/components/BillingBanner";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { OfflinePack } from "@/components/OfflinePack";
import { CreateFirstBusiness } from "@/components/CreateFirstBusiness";
import { PageGhost } from "@/components/ghost";
import { NoBusinessInApp } from "@/components/NoBusinessInApp";
import { NoCustomerAccount } from "@/components/NoCustomerAccount";
import { HeaderBackButton } from "@/components/BackLink";
import {
  useBusinessOnboarding,
  useLinkedRecordDefinition,
  useDismissAllNotifications,
  useDismissNotification,
  useMarkNotificationRead,
  useNotifications,
  usePortalBusinesses,
  usePortalLink,
  useSubscription,
  useWaitlistSummary,
} from "@/lib/api/hooks";
import { useSupportRequests } from "@/lib/api/support";
import {
  billingNavAlert,
  isBillingBlocked,
  isBillingPath,
  subscriptionAccessState,
} from "@/lib/billing/access";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { bookingUrlFor, isCustomerHost } from "@/lib/hosts";
import type { MenuBadge } from "@/lib/menu";
import { billingSurface, isNativeApp, saasPurchasesAllowedInApp } from "@/lib/native";
import { PERMISSIONS, roleLabels } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useAuth } from "@/lib/auth/auth-store";
import { useLiveUpdates } from "@/lib/live/use-live-updates";
import { hiddenNavFrom, navFeatureForPath } from "@/lib/nav-features";
import { notificationHref } from "@/lib/notification-link";
import { markSessionLanded } from "@/lib/session-landing";
import { useSoloPlan } from "@/lib/sole";
import { lastActivity } from "@/lib/support";
import { useUiPreferences } from "@/lib/ui-preferences-store";
import { useUnseenReleases } from "@/lib/use-unseen-releases";
import { cn } from "@/lib/utils";

function pluralizeTerm(term: string) {
  const trimmed = term.trim();
  if (!trimmed) return trimmed;
  return trimmed.toLowerCase().endsWith("s") ? trimmed : `${trimmed}s`;
}

/** Industry terminology for nav — keep the bookings list distinct from the catalogue. */
function navLabel(
  to: string,
  fallback: string,
  terminology: {
    client: string;
    staff: string;
    service: string;
    booking: string;
    linkedRecord: string;
  },
): string {
  if (to === "/clients") return pluralizeTerm(terminology.client);
  if (to === "/vehicles") return pluralizeTerm(terminology.linkedRecord);
  if (to === "/staff") return terminology.staff;
  if (to === "/services") return pluralizeTerm(terminology.service.replace(/\s+type$/i, ""));
  if (to === "/bookings") {
    const bookingLabel = pluralizeTerm(terminology.booking);
    const sessionLabel = pluralizeTerm(terminology.service.replace(/\s+type$/i, ""));
    if (bookingLabel.toLowerCase() === sessionLabel.toLowerCase()) return fallback;
    return bookingLabel;
  }
  return fallback;
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  anyOf: string[];
};

/**
 * Every page the menu can show, gated by permission. Which section each sits in
 * (Schedule, Clients, What you offer, Money) is `MENU_SECTION_OF` in `lib/menu`;
 * Settings lives in the More group rather than here.
 */
const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, anyOf: [PERMISSIONS.BUSINESS_READ] },
  {
    to: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    anyOf: [PERMISSIONS.BOOKING_READ_ALL, PERMISSIONS.BOOKING_READ_OWN],
  },
  {
    to: "/bookings",
    label: "Bookings",
    icon: ClipboardList,
    anyOf: [PERMISSIONS.BOOKING_READ_ALL, PERMISSIONS.BOOKING_READ_OWN],
  },
  // Staff events share the diary with bookings, so they share its permissions.
  {
    to: "/events",
    label: "Events",
    icon: Clock,
    anyOf: [PERMISSIONS.BOOKING_READ_ALL, PERMISSIONS.BOOKING_READ_OWN],
  },
  // Clients who wanted a slot the diary couldn't give them; the badge is how
  // many are waiting.
  { to: "/waitlist", label: "Waitlist", icon: Hourglass, anyOf: [PERMISSIONS.BOOKING_READ_ALL] },
  { to: "/clients", label: "Clients", icon: Users, anyOf: [PERMISSIONS.CUSTOMER_READ] },
  // Reminders to clients that they are due back (a wash every 2 months, a ceramic
  // top-up every 2 years), set up and listed here. All verticals: a PT can use it
  // for re-assessments just as well.
  { to: "/follow-ups", label: "Reminders", icon: BellRing, anyOf: [PERMISSIONS.BOOKING_READ_ALL] },
  { to: "/messages", label: "Messages", icon: MessageSquare, anyOf: [PERMISSIONS.CUSTOMER_READ] },
  { to: "/referrals", label: "Referrals", icon: Gift, anyOf: [PERMISSIONS.BUSINESS_READ] },
  // Label follows the record schema's terminology ("Vehicles" for detailing);
  // hidden entirely when the business has no linked-record schema.
  { to: "/vehicles", label: "Vehicles", icon: Car, anyOf: [PERMISSIONS.CUSTOMER_READ] },
  { to: "/services", label: "Sessions", icon: Layers, anyOf: [PERMISSIONS.BUSINESS_READ] },
  // Materials a job uses up (ceramic, pads). Automotive only — hidden for other
  // verticals below — and gated like the catalogue it hangs off.
  { to: "/consumables", label: "Consumables", icon: Package, anyOf: [PERMISSIONS.BUSINESS_READ] },
  {
    to: "/packages",
    label: "Packages",
    icon: Banknote,
    anyOf: [PERMISSIONS.PACKAGE_MANAGE, PERMISSIONS.BUSINESS_READ],
  },
  {
    to: "/offer-links",
    label: "Offer links",
    icon: Link2,
    anyOf: [PERMISSIONS.PACKAGE_MANAGE, PERMISSIONS.BUSINESS_READ],
  },
  { to: "/locations", label: "Locations", icon: MapPin, anyOf: [PERMISSIONS.BUSINESS_READ] },
  {
    to: "/staff",
    label: "Staff",
    icon: UserRound,
    anyOf: [PERMISSIONS.TEAM_INVITE, PERMISSIONS.BUSINESS_READ],
  },
  // How the public page looks and reads; the New badge marks it until the next release.
  { to: "/booking-page", label: "Booking page", icon: Palette, anyOf: [PERMISSIONS.BUSINESS_READ] },
  { to: "/payments", label: "Payments", icon: CreditCard, anyOf: [PERMISSIONS.PAYMENT_READ] },
  { to: "/invoices", label: "Invoices", icon: FileText, anyOf: [PERMISSIONS.INVOICE_READ] },
  { to: "/reports", label: "Reports", icon: BarChart3, anyOf: [PERMISSIONS.REPORT_READ] },
  // Billing lives under Settings → Billing; /billing stays routable for Stripe
  // return URLs and the locked-out landing, but isn't a nav destination.
];

/** Below this width the menu starts folded unless the person has chosen otherwise. */
const AUTO_COLLAPSE_QUERY = "(min-width: 64rem) and (max-width: 1099px)";

/** Whether a media query matches; `false` on the server and first paint. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function AppShell({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const { signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileNav, setMobileNav] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  // null = closed; an object (possibly empty) = open with those fields prefilled.
  const [waitlistDefaults, setWaitlistDefaults] = useState<WaitlistDialogDefaults | null>(null);
  const [addBusinessOpen, setAddBusinessOpen] = useState(false);
  const [quick, setQuick] = useState<QuickAction>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [setupOpenRequest, setSetupOpenRequest] = useState(0);
  const subscription = useSubscription();
  // Staff-only push channel: credits, message history, bookings refresh as the API records them.
  useLiveUpdates();

  // The console's own palette (warm background, floating panel, navy/mint):
  // scoped to a class on <html> so client-facing pages keep theirs.
  useEffect(() => {
    document.documentElement.classList.add("dash");
    return () => document.documentElement.classList.remove("dash");
  }, []);

  // Menu layout choices follow the person across devices (see ui-preferences-store).
  const { preferences, update: updatePreferences } = useUiPreferences();
  const narrowDesktop = useMediaQuery(AUTO_COLLAPSE_QUERY);
  const menuCollapsed = preferences.menuCollapsed ?? narrowDesktop;

  useEffect(() => setMobileNav(false), [pathname]);
  // Once a real page has rendered, later visits to `/` are the Overview link,
  // not the app opening — see the home route.
  const accessPending = tenant.isLoading || (Boolean(tenant.businessId) && subscription.isLoading);
  useEffect(() => {
    if (!accessPending) markSessionLanded();
  }, [accessPending]);

  const notifications = useNotifications();
  const markNotificationRead = useMarkNotificationRead();
  const dismissNotification = useDismissNotification();
  const dismissAllNotifications = useDismissAllNotifications();
  const canSeeWaitlist = tenant.can(PERMISSIONS.BOOKING_READ_ALL);
  const waitlistSummary = useWaitlistSummary({ enabled: canSeeWaitlist });
  const waiting = waitlistSummary.data?.waiting ?? 0;
  const navigate = useNavigate();
  // Gates the Vehicles nav item: only businesses with a linked-record schema get it.
  const recordDefinition = useLinkedRecordDefinition();
  const hasLinkedRecords = Boolean(recordDefinition.data?.definition);
  // Group sessions are a PT concept — a detailer works one car at a time — so
  // that quick action is hidden for the car-detailing vertical.
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  // A Solo plan seats one person — the owner, who already has a staff record —
  // so there is no team to manage and the Staff item is dropped from the menu.
  const soloPlan = useSoloPlan();
  // Items the business switched off under Settings → Configuration → Menu.
  const hiddenNav = hiddenNavFrom(tenant.configuration);
  const isHiddenByBusiness = (to: string) => {
    const feature = navFeatureForPath(to);
    return feature !== undefined && hiddenNav.has(feature);
  };
  // One answer to "what can this person see?" for both the menu and ⌘K search.
  const visibleNav = NAV.filter(
    (item) =>
      item.anyOf.some((p) => tenant.can(p)) &&
      // The record list only exists for businesses with a schema
      // (vehicles for detailing); everyone else never sees the item.
      (item.to !== "/vehicles" || hasLinkedRecords) &&
      // Consumables are a detailing concept (coatings, pads, chemicals).
      (item.to !== "/consumables" || isCarDetailing) &&
      // One-seat plans have no team to manage.
      (item.to !== "/staff" || !soloPlan) &&
      !isHiddenByBusiness(item.to),
  );
  const canSeeSettings = tenant.can(PERMISSIONS.BUSINESS_READ);
  const menuItems: MenuItemDef[] = visibleNav.map((item) => ({
    to: item.to,
    label: navLabel(item.to, item.label, tenant.terminology),
    icon: item.icon,
    badge:
      item.to === "/waitlist" && waiting > 0
        ? { tone: "grey", text: String(waiting) }
        : item.to === "/booking-page"
          ? { tone: "mint", text: "New" }
          : null,
  }));

  // The More group: setup, credits, billing, updates and help, with a badge
  // where something needs attention (amber), is new (mint) or is just a count (grey).
  const onboarding = useBusinessOnboarding();
  const setupDone =
    Boolean(onboarding.data) &&
    (onboarding.data!.status === "complete" || onboarding.data!.percentComplete >= 100);
  const setupLeft = Math.max(
    0,
    (onboarding.data?.requiredTotal ?? 0) - (onboarding.data?.requiredCompleted ?? 0),
  );
  const sms = useSmsCreditsSummary();
  const billingAlert = billingNavAlert(subscription.data?.subscription, billingSurface());
  const trialDaysLeft = (() => {
    const current = subscription.data?.subscription;
    if (subscriptionAccessState(current) !== "trial" || !current?.trialEnd) return null;
    return Math.max(0, Math.ceil((new Date(current.trialEnd).getTime() - Date.now()) / 86_400_000));
  })();
  const unseen = useUnseenReleases();
  const supportRequests = useSupportRequests();
  const awaitingReplies = (supportRequests.data ?? []).filter(
    (r) => r.status !== "resolved" && lastActivity(r).ours,
  ).length;
  const canViewPlatform = tenant.can(PERMISSIONS.PLATFORM_BILLING_ADMIN);

  const smsBadge: MenuBadge | null =
    sms.credits && sms.level !== "unlimited" && sms.level !== "unknown"
      ? {
          tone: sms.level === "ok" ? "grey" : "amber",
          text: String(sms.credits.balance),
        }
      : null;
  const billingRow: MoreRowDef | null = billingAlert
    ? {
        key: "billing",
        label: "Plan & billing",
        icon: CreditCard,
        to: "/billing",
        badge: {
          tone: "amber",
          text: billingAlert.level === "locked" ? "Pay now" : "Payment failed",
        },
      }
    : trialDaysLeft !== null
      ? {
          key: "billing",
          label: "Plan & billing",
          icon: CreditCard,
          to: "/settings",
          search: { tab: "billing" },
          badge:
            trialDaysLeft <= 7
              ? {
                  tone: "amber",
                  text:
                    trialDaysLeft === 0
                      ? "Trial ends today"
                      : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`,
                }
              : { tone: "grey", text: "Trial" },
        }
      : null;
  const moreRows: MoreRowDef[] = [
    ...(canSeeSettings
      ? [{ key: "settings", label: "Settings", icon: Settings, to: "/settings" }]
      : []),
    ...(onboarding.data && !setupDone
      ? [
          {
            key: "setup",
            label: "Finish setting up",
            icon: ListChecks,
            badge: { tone: "grey" as const, text: `${setupLeft} left` },
            onSelect: () => setSetupOpenRequest((n) => n + 1),
          },
        ]
      : []),
    ...(smsBadge
      ? [
          {
            key: "sms",
            label: "Text credits",
            icon: MessageSquareText,
            to: "/billing/sms-credits",
            badge: smsBadge,
          },
        ]
      : []),
    ...(billingRow ? [billingRow] : []),
    {
      key: "whats-new",
      label: "What's new",
      icon: Sparkles,
      to: "/whats-new",
      badge: unseen > 0 ? { tone: "mint", text: String(unseen) } : null,
    },
    { key: "guides", label: "Guides", icon: BookOpen, to: "/support/guides" },
    ...(tenant.businessId
      ? [
          {
            key: "support",
            label: "Contact support",
            icon: LifeBuoy,
            to: "/support",
            badge:
              awaitingReplies > 0 ? { tone: "mint" as const, text: String(awaitingReplies) } : null,
          },
        ]
      : []),
    ...(canViewPlatform
      ? [{ key: "platform", label: "Platform view", icon: Building2, to: "/platform" }]
      : []),
  ];

  const searchablePages: SearchablePage[] = [
    ...visibleNav.map((item) => ({
      to: item.to,
      label: navLabel(item.to, item.label, tenant.terminology),
      icon: item.icon,
    })),
    ...(canSeeSettings ? [{ to: "/settings", label: "Settings", icon: Settings }] : []),
    { to: "/whats-new", label: "What's new", icon: Sparkles },
    { to: "/support/guides", label: "Guides", icon: BookOpen },
    ...(tenant.businessId ? [{ to: "/support", label: "Support", icon: LifeBuoy }] : []),
  ];
  const unread = (notifications.data?.notifications ?? []).filter((n) => !n.readAt).length;
  const noStaffBusiness = !tenant.isLoading && tenant.businesses.length === 0;
  // Adopt guest purchases before asking what this account owns, or someone who
  // bought as a guest and then signed up with the same address is told they have
  // nothing, and the screen corrects itself a moment later.
  const portalLink = usePortalLink(noStaffBusiness);
  const portalBusinesses = usePortalBusinesses(noStaffBusiness && portalLink.isFetched);
  // Creating a business ends at the plan chooser, so it is only offered where a
  // plan can be bought: the web (Stripe) and the iOS app (In-App Purchase). A
  // store app that cannot sell shows a plain notice instead; see
  // saasPurchasesAllowedInApp. Rendered client-side after the tenant query
  // resolves, so reading the Capacitor bridge here is safe.
  const canStartBusinessHere = saasPurchasesAllowedInApp();
  // A platform billing_bypass (demo / review / comp accounts) grants paid access
  // with no Stripe subscription, so it must not send the console to the plan chooser.
  const billingLocked =
    subscription.isSuccess &&
    !subscription.data?.billingBypass &&
    isBillingBlocked(subscription.data?.subscription);
  const onBilling = isBillingPath(pathname);
  const onPlatform = pathname === "/platform" || pathname.startsWith("/platform/");

  // Only the staff app requires a business, so the prompt to create one lives
  // here rather than around every route: a customer in their portal, or someone
  // opening a staff invitation, has no membership yet and must not be asked to
  // found a studio.
  if (noStaffBusiness) {
    if (!portalLink.isFetched || portalBusinesses.isLoading) {
      return (
        <div className="min-h-screen bg-background">
          <header className="pt-safe px-safe-4 sm:px-safe-6 sticky top-0 z-30 flex min-h-16 items-center bg-background/85 backdrop-blur sm:border-b">
            <Wordmark />
          </header>
          <main className="px-safe-4 sm:px-safe-8 mx-auto w-full max-w-5xl pt-4 pb-safe-12 sm:p-8">
            <PageGhost />
          </main>
        </div>
      );
    }
    const isCustomer = (portalBusinesses.data ?? []).length > 0;
    // No membership, so the address they came in on is the evidence of intent.
    // Customer links all point at the customer host; the business host (and the
    // app, which is the business console only) is reached by choosing it, so
    // whoever signs in there is here to run a business — even if the same
    // address also books sessions somewhere as a client. They get the setup
    // form, with a pointer to where their own bookings live.
    const onCustomerHost =
      !isNativeApp() && typeof window !== "undefined" && isCustomerHost(window.location.hostname);
    if (!onCustomerHost) {
      // Without a way to buy a plan the setup form would dead-end, so those
      // surfaces get a plain notice instead (saasPurchasesAllowedInApp).
      if (!canStartBusinessHere) {
        return <NoBusinessInApp />;
      }
      return <CreateFirstBusiness customerElsewhere={isCustomer} />;
    }
    // On the customer host a customer record means their own account. /account
    // rather than one studio's page: which studio came first is an accident of
    // history, and picking it for them hides the others.
    if (isCustomer) {
      return <Navigate to="/account" replace />;
    }
    // Nothing to go on at all, and on the customer host "set up your studio" is
    // the wrong question — they are mid-claim, or their link has yet to redeem.
    return <NoCustomerAccount />;
  }

  if (!accessPending && billingLocked && !onBilling && !onPlatform) {
    return <Navigate to="/billing" replace />;
  }

  const page = accessPending ? <PageGhost /> : children;

  if (billingLocked && onBilling) {
    return (
      <div className="min-h-screen bg-background">
        <header className="pt-safe px-safe-4 sm:px-safe-6 sticky top-0 z-30 flex min-h-16 items-center justify-between bg-background/85 backdrop-blur sm:border-b">
          <Wordmark />
          <div className="flex items-center gap-1">
            <DeleteAccountDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Delete account
                </Button>
              }
            />
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </header>
        <main className="px-safe-4 sm:px-safe-8 mx-auto w-full max-w-5xl space-y-6 pt-4 pb-safe-12 sm:p-8">
          {page}
        </main>
      </div>
    );
  }

  const menuProps = {
    items: menuItems,
    pathname,
    preferences,
    updatePreferences,
    moreRows,
    business: tenant.business
      ? {
          name: tenant.business.tradingName,
          logoUrl: tenant.configuration?.branding?.logoUrl ?? null,
          roleLabel: roleLabels(tenant.membership?.roleKeys, "Member"),
        }
      : null,
    businesses: tenant.businesses.map((b) => ({ id: b.id, tradingName: b.tradingName })),
    onSwitchBusiness: (id: string) => tenant.switchBusiness(id),
    onAddBusiness: canStartBusinessHere
      ? () => {
          setMobileNav(false);
          setAddBusinessOpen(true);
        }
      : undefined,
    onSignOut: () => void signOut(),
  };

  return (
    <div className="min-h-screen bg-background lg:flex lg:h-dvh lg:overflow-hidden">
      {tenant.businessId ? <OfflinePack /> : null}

      {/* Phone: a drawer over the page. */}
      {mobileNav ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <aside
        className={cn(
          "pt-safe pb-safe pl-safe fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] bg-background shadow-xl transition-transform duration-300 ease-out lg:hidden",
          mobileNav ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={mobileNav ? undefined : true}
      >
        {tenant.isLoading ? (
          <MenuGhost />
        ) : (
          <DashboardMenu
            variant="drawer"
            collapsed={false}
            onToggleCollapsed={() => undefined}
            onClose={() => setMobileNav(false)}
            onNavigate={() => setMobileNav(false)}
            {...menuProps}
          />
        )}
      </aside>

      {/* Desktop: the menu sits on the app background, beside the page panel. */}
      <aside
        className={cn(
          "pt-safe pb-safe pl-safe hidden shrink-0 transition-[width] duration-200 ease-out lg:block",
          menuCollapsed ? "w-[76px]" : "w-[272px]",
        )}
        data-testid="dashboard-menu"
        data-collapsed={menuCollapsed ? "true" : "false"}
      >
        {tenant.isLoading ? (
          <MenuGhost />
        ) : (
          <DashboardMenu
            variant="desktop"
            collapsed={menuCollapsed}
            onToggleCollapsed={() => updatePreferences({ menuCollapsed: !menuCollapsed })}
            {...menuProps}
          />
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:py-3 lg:pr-3">
        {/* The page panel: on a desktop a floating sheet that scrolls on its own
            while the menu stays put; on a phone the page itself. */}
        <div
          className="flex min-h-0 flex-1 flex-col lg:overflow-y-auto lg:rounded-[24px] lg:border lg:border-panel-border lg:bg-panel lg:shadow-panel"
          data-testid="page-panel"
        >
          <header className="pt-safe sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur lg:rounded-t-[24px] lg:bg-panel/90">
            <div className="px-safe-4 sm:px-safe-6 flex h-16 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileNav(true)}
                aria-label="Open menu"
              >
                <Menu className="size-6 sm:size-5" />
              </Button>
              {/* Every click in the app can be undone from here; the desktop and phone
                  shells have no browser chrome, so this is their only Back. */}
              <HeaderBackButton />

              <GlobalSearch pages={searchablePages} />

              <div className="ml-auto flex items-center gap-2">
                {/* A location filter only means something once there is more than one. */}
                {tenant.locations.length > 1 ? (
                  <Select
                    value={tenant.currentLocationId}
                    onValueChange={tenant.setCurrentLocationId}
                  >
                    <SelectTrigger className="hidden w-[210px] bg-card lg:flex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All locations</SelectItem>
                      {tenant.locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="relative"
                      aria-label="Notifications"
                    >
                      <Bell className="size-4" />
                      {unread > 0 ? (
                        <span
                          className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[10px] font-semibold text-white"
                          aria-label={`${unread} unread`}
                        >
                          {unread > 9 ? "9+" : unread}
                        </span>
                      ) : null}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                    <PushBellPrompt />
                    {(notifications.data?.notifications ?? []).slice(0, 5).map((n) => {
                      // The API says where each alert leads (a package request opens that
                      // request, a follow-up the follow-ups list). Older rows about a booking
                      // open the booking. Anything else just marks itself read.
                      const href = notificationHref(n);
                      return (
                        <DropdownMenuItem
                          key={n.id}
                          className="items-start gap-2"
                          onClick={() => {
                            if (!n.readAt) markNotificationRead.mutate(n.id);
                            if (href) void navigate({ href });
                          }}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex w-full min-w-0 items-center gap-1.5 text-sm font-medium">
                              {href ? (
                                <BellRing className="size-3.5 shrink-0 text-primary" />
                              ) : null}
                              <span className="truncate">{n.subject}</span>
                            </span>
                            {/* The clamp box is a flex child; without an explicit width it sizes to its
                                text and wraps past the menu's edge instead of inside it. */}
                            <span className="line-clamp-2 w-full min-w-0 text-xs break-words text-muted-foreground">
                              {n.body}
                            </span>
                          </span>
                          {/* Stopping the click here keeps the row's open/mark-read from firing and
                              leaves the menu open so several can be cleared in a row. Pointer
                              events must still bubble: Radix treats a pointerup it did not see
                              the pointerdown for as a click on the row. */}
                          <button
                            type="button"
                            aria-label={`Clear “${n.subject}”`}
                            data-testid="clear-notification"
                            className="-mt-0.5 -mr-1 shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              dismissNotification.mutate(n.id);
                            }}
                          >
                            <X className="size-3.5" />
                          </button>
                        </DropdownMenuItem>
                      );
                    })}
                    {(notifications.data?.notifications ?? []).length === 0 ? (
                      <DropdownMenuItem disabled>No notifications yet</DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="justify-center text-xs text-muted-foreground"
                          data-testid="clear-all-notifications"
                          onClick={() => dismissAllNotifications.mutate()}
                        >
                          Clear all
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {tenant.business ? (
                  <Button variant="outline" asChild className="hidden xl:inline-flex">
                    {/* The customer hostname, not this one: what a studio opens from
                        here is the same link it hands out. */}
                    <a href={bookingUrlFor(tenant.business.slug)} target="_blank" rel="noreferrer">
                      View booking page <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="h-10 w-10 px-0 [&_svg]:size-5 sm:h-9 sm:w-auto sm:px-4 sm:[&_svg]:size-4">
                      <Plus />
                      <span className="hidden sm:inline">New booking</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setBookingOpen(true)}>
                      Add booking
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setWaitlistDefaults({})}>
                      Add to waitlist
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setQuick("client")}>
                      Add client
                    </DropdownMenuItem>
                    {!isCarDetailing ? (
                      <DropdownMenuItem onClick={() => setQuick("group")}>
                        Create group session
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => setEventOpen(true)}>
                      Add event
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setQuick("block")}>
                      Block availability
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setQuick("package")}>
                      Sell package
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setQuick("message")}>
                      Send message
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <main className="px-safe-4 sm:px-safe-6 mx-auto w-full max-w-[1440px] space-y-6 pt-4 pb-safe-12 sm:p-6">
            {accessPending ? null : <BillingBanner />}
            {page}
          </main>
        </div>
      </div>

      <AddBookingModal
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        onNoAvailability={(picked) => {
          setBookingOpen(false);
          setWaitlistDefaults({ ...picked, from: picked.date });
        }}
      />
      <EventModal open={eventOpen} onOpenChange={setEventOpen} />
      <AddWaitlistDialog
        open={waitlistDefaults !== null}
        onOpenChange={(open) => {
          if (!open) setWaitlistDefaults(null);
        }}
        defaults={waitlistDefaults ?? undefined}
      />
      <AddBusinessDialog open={addBusinessOpen} onOpenChange={setAddBusinessOpen} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
      <DemoTour open={tourOpen} onOpenChange={setTourOpen} />
      <OnboardingChecklist openRequest={setupOpenRequest} onOpenTour={() => setTourOpen(true)} />
    </div>
  );
}

/** Placeholder rows while the tenant loads, so the menu column keeps its shape. */
function MenuGhost() {
  return (
    <div className="flex h-full flex-col gap-2 px-3 pt-5" aria-hidden>
      <div className="mb-3 h-9 w-28 animate-pulse rounded-[10px] bg-sidebar-accent" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-[10px] bg-sidebar-accent/70" />
      ))}
    </div>
  );
}

export function useQuickActions() {
  return useState<QuickAction>(null);
}
