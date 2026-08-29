import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import {
  Banknote,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronsUpDown,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  Layers,
  LogOut,
  MapPin,
  MessageSquare,
  Menu,
  Plus,
  Search,
  Settings,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { PersonAvatar } from "@/components/ui-bits";
import { Wordmark } from "@/components/Wordmark";
import { AddBookingModal } from "@/components/AddBookingModal";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { DemoTour } from "@/components/DemoTour";
import { BillingBanner } from "@/components/BillingBanner";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { CreateFirstBusiness } from "@/components/CreateFirstBusiness";
import { PageGhost } from "@/components/ghost";
import { NoCustomerAccount } from "@/components/NoCustomerAccount";
import {
  useCustomers,
  useMarkNotificationRead,
  useNotifications,
  usePortalBusinesses,
  usePortalLink,
  useSubscription,
} from "@/lib/api/hooks";
import { customerDisplayName, userDisplayName } from "@/lib/api/types";
import { isBillingBlocked, isBillingPath } from "@/lib/billing/access";
import { bookingUrlFor, isCustomerHost } from "@/lib/hosts";
import { PERMISSIONS, roleLabels } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useAuth } from "@/lib/auth/auth-store";
import { cn } from "@/lib/utils";

/** Industry terminology for nav — keep bookings vs catalogue labels distinct. */
function navLabel(
  to: string,
  fallback: string,
  terminology: { client: string; staff: string; service: string; booking: string },
): string {
  if (to === "/clients") return `${terminology.client}s`;
  if (to === "/staff") return terminology.staff;
  if (to === "/bookings") return `${terminology.booking}s`;
  if (to === "/services") {
    const service = terminology.service.trim();
    const booking = terminology.booking.trim();
    if (service.toLowerCase() === booking.toLowerCase()) {
      return `${service} types`;
    }
    return service.toLowerCase().endsWith("s") ? service : `${service}s`;
  }
  return fallback;
}

const NAV: Array<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  anyOf: string[];
}> = [
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
  { to: "/clients", label: "Clients", icon: Users, anyOf: [PERMISSIONS.CUSTOMER_READ] },
  { to: "/services", label: "Services", icon: Layers, anyOf: [PERMISSIONS.BUSINESS_READ] },
  {
    to: "/packages",
    label: "Packages",
    icon: Banknote,
    anyOf: [PERMISSIONS.PACKAGE_MANAGE, PERMISSIONS.BUSINESS_READ],
  },
  {
    to: "/staff",
    label: "Staff",
    icon: UserRound,
    anyOf: [PERMISSIONS.TEAM_INVITE, PERMISSIONS.BUSINESS_READ],
  },
  { to: "/locations", label: "Locations", icon: MapPin, anyOf: [PERMISSIONS.BUSINESS_READ] },
  { to: "/messages", label: "Messages", icon: MessageSquare, anyOf: [PERMISSIONS.CUSTOMER_READ] },
  { to: "/payments", label: "Payments", icon: CreditCard, anyOf: [PERMISSIONS.PAYMENT_READ] },
  { to: "/reports", label: "Reports", icon: BarChart3, anyOf: [PERMISSIONS.REPORT_READ] },
  {
    to: "/billing",
    label: "Billing",
    icon: CreditCard,
    anyOf: [PERMISSIONS.BILLING_MANAGE, PERMISSIONS.BUSINESS_UPDATE],
  },
  { to: "/settings", label: "Settings", icon: Settings, anyOf: [PERMISSIONS.BUSINESS_READ] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileNav, setMobileNav] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [quick, setQuick] = useState<QuickAction>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [search, setSearch] = useState("");
  const subscription = useSubscription();

  useEffect(() => setMobileNav(false), [pathname]);

  const searchQuery = useCustomers({ search: search.trim(), enabled: search.trim().length > 1 });
  const results = search.trim().length > 1 ? (searchQuery.data?.items ?? []).slice(0, 5) : [];

  const notifications = useNotifications();
  const markNotificationRead = useMarkNotificationRead();
  const unread = (notifications.data?.notifications ?? []).filter((n) => !n.readAt).length;
  const noStaffBusiness = !tenant.isLoading && tenant.businesses.length === 0;
  // Adopt guest purchases before asking what this account owns, or someone who
  // bought as a guest and then signed up with the same address is told they have
  // nothing, and the screen corrects itself a moment later.
  const portalLink = usePortalLink(noStaffBusiness);
  const portalBusinesses = usePortalBusinesses(noStaffBusiness && portalLink.isFetched);
  const canViewPlatform = tenant.can(PERMISSIONS.PLATFORM_BILLING_ADMIN);
  const billingLocked = subscription.isSuccess && isBillingBlocked(subscription.data?.subscription);
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
          <header className="flex h-16 items-center border-b px-4 sm:px-6">
            <Wordmark />
          </header>
          <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
            <PageGhost />
          </main>
        </div>
      );
    }
    // Someone who bought sessions has a customer record but nothing to run, so
    // send them to their own account rather than offering to set up a studio.
    // /account rather than one studio's page: which studio came first is an
    // accident of history, and picking it for them hides the others.
    if ((portalBusinesses.data ?? []).length > 0) {
      return <Navigate to="/account" replace />;
    }
    // Nothing to go on: no membership, no customer link. The hostname is the last
    // evidence of why they came, and on the customer one "set up your studio" is
    // the wrong question — they are mid-claim, or their link has yet to redeem.
    if (typeof window !== "undefined" && isCustomerHost(window.location.hostname)) {
      return <NoCustomerAccount />;
    }
    return <CreateFirstBusiness />;
  }

  const accessPending =
    tenant.isLoading || (Boolean(tenant.businessId) && subscription.isLoading);

  if (!accessPending && billingLocked && !onBilling && !onPlatform) {
    return <Navigate to="/billing" replace />;
  }

  const page = accessPending ? <PageGhost /> : children;

  if (billingLocked && onBilling) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex h-16 items-center justify-between border-b px-4 sm:px-6">
          <Wordmark />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </header>
        <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-8">{page}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {mobileNav ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
          mobileNav ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Wordmark />
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </Button>
        </div>

        <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3">
          {tenant.isLoading
            ? Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-sidebar-accent/70" />
              ))
            : NAV.filter((item) => item.anyOf.some((p) => tenant.can(p))).map((item) => {
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                const label = navLabel(item.to, item.label, tenant.terminology);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className={cn("size-4.5", active && "text-sidebar-primary")} />
                    {label}
                    {item.label === "Messages" && unread > 0 ? (
                      <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[11px] font-semibold text-sidebar-primary-foreground">
                        {unread}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
        </nav>

        <div className="space-y-1 border-t border-sidebar-border p-3">
          {canViewPlatform ? (
            <Link
              to="/platform"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <Building2 className="size-4.5" /> Platform view
            </Link>
          ) : null}
          <button
            onClick={() => setTourOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LifeBuoy className="size-4.5" /> Help centre
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mt-1 flex w-full items-center gap-3 rounded-xl bg-sidebar-accent/70 px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent">
                <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  {(tenant.business?.tradingName ?? "RE").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-sidebar-accent-foreground">
                    {tenant.business?.tradingName ?? "Loading…"}
                  </span>
                  <span className="block text-[11px] text-sidebar-foreground/70">
                    {roleLabels(tenant.membership?.roleKeys, "Member")}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 text-sidebar-foreground/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel>Switch business</DropdownMenuLabel>
              {tenant.businesses.map((b) => (
                <DropdownMenuItem key={b.id} onClick={() => tenant.switchBusiness(b.id)}>
                  {b.tradingName}
                </DropdownMenuItem>
              ))}
              {canViewPlatform ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/platform">Platform owner view</Link>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/60">
                <PersonAvatar name={userDisplayName(user, "?")} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-sidebar-accent-foreground">
                    {userDisplayName(user)}
                  </span>
                  <span className="block truncate text-[11px] text-sidebar-foreground/70">
                    {user?.email && userDisplayName(user) !== user.email
                      ? user.email
                      : roleLabels(tenant.membership?.roleKeys, "Team member")}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/settings" search={{ tab: "account" }}>
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {tenant.business ? (
                <DropdownMenuItem asChild>
                  <a href={bookingUrlFor(tenant.business.slug)} target="_blank" rel="noreferrer">
                    Open client booking page
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>

            <div className="relative hidden max-w-sm flex-1 md:block">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients"
                className="bg-card pl-9"
              />
              {results.length > 0 ? (
                <div className="surface-card absolute top-full left-0 z-40 mt-2 w-full overflow-hidden p-1">
                  {results.map((c) => (
                    <Link
                      key={c.id}
                      to="/clients/$clientId"
                      params={{ clientId: c.id }}
                      onClick={() => setSearch("")}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-secondary"
                    >
                      <PersonAvatar name={customerDisplayName(c)} size={28} />
                      {customerDisplayName(c)}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Select value={tenant.currentLocationId} onValueChange={tenant.setCurrentLocationId}>
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

              <ThemeToggle />

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
                      <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-warning" />
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                  {(notifications.data?.notifications ?? []).slice(0, 5).map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className="flex-col items-start gap-0.5"
                      onClick={() => {
                        if (!n.readAt) markNotificationRead.mutate(n.id);
                      }}
                    >
                      <span className="text-sm font-medium">{n.subject}</span>
                      <span className="text-xs text-muted-foreground">{n.body}</span>
                    </DropdownMenuItem>
                  ))}
                  {(notifications.data?.notifications ?? []).length === 0 ? (
                    <DropdownMenuItem disabled>No notifications yet</DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus className="size-4" />
                    <span className="hidden sm:inline">Create</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setBookingOpen(true)}>
                    Add booking
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuick("client")}>Add client</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuick("group")}>
                    Create group session
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

              {tenant.business ? (
                <Button variant="outline" asChild className="hidden xl:inline-flex">
                  {/* The customer hostname, not this one: what a studio opens from
                      here is the same link it hands out. */}
                  <a href={bookingUrlFor(tenant.business.slug)} target="_blank" rel="noreferrer">
                    View booking page <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6">
          {accessPending ? null : <BillingBanner />}
          {page}
        </main>
      </div>

      <AddBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
      <DemoTour open={tourOpen} onOpenChange={setTourOpen} />
      <OnboardingChecklist />
    </div>
  );
}

export function useQuickActions() {
  return useState<QuickAction>(null);
}
