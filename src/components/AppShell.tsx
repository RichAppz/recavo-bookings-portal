import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
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
  MapPin,
  MessageSquare,
  Menu,
  Plus,
  PlayCircle,
  RotateCcw,
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
import { AddBookingModal } from "@/components/AddBookingModal";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { DemoTour } from "@/components/DemoTour";
import { useDemo } from "@/lib/demo-store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/bookings", label: "Bookings", icon: ClipboardList },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/services", label: "Services", icon: Layers },
  { to: "/packages", label: "Packages", icon: Banknote },
  { to: "/staff", label: "Staff", icon: UserRound },
  { to: "/locations", label: "Locations", icon: MapPin },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/payments", label: "Payments", icon: CreditCard },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
        <CalendarDays className="size-4.5" strokeWidth={2.4} />
      </span>
      {!compact ? (
        <span className="text-[19px] font-semibold tracking-tight text-sidebar-accent-foreground">
          RECAVO
        </span>
      ) : null}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const demo = useDemo();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileNav, setMobileNav] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [quick, setQuick] = useState<QuickAction>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => setMobileNav(false), [pathname]);

  const unread = demo.conversations.reduce((n, c) => n + c.unread, 0);
  const results = search.trim()
    ? demo.clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 5)
    : [];

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
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
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
                {item.label}
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
          <Link
            to="/platform"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <Building2 className="size-4.5" /> Platform view
          </Link>
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
                  RE
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-sidebar-accent-foreground">
                    RECAVO
                  </span>
                  <span className="block text-[11px] text-sidebar-foreground/70">Growth plan</span>
                </span>
                <ChevronsUpDown className="size-4 text-sidebar-foreground/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel>Switch business</DropdownMenuLabel>
              <DropdownMenuItem>RECAVO</DropdownMenuItem>
              <DropdownMenuItem>Northside Tutors</DropdownMenuItem>
              <DropdownMenuItem>Studio Eight Beauty</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/platform">Platform owner view</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/60">
                <PersonAvatar name="Alex Morgan" src="https://i.pravatar.cc/160?img=13" size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-sidebar-accent-foreground">
                    Alex Morgan
                  </span>
                  <span className="block text-[11px] text-sidebar-foreground/70">
                    Owner and Head Coach
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem asChild><Link to="/settings">Account settings</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={() => demo.resetDemo()}>
                <RotateCcw className="size-4" /> Reset demo data
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/book">Open client booking page</Link></DropdownMenuItem>
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
                placeholder="Search clients, bookings, payments"
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
                      <PersonAvatar name={c.name} src={c.avatar} size={28} />
                      {c.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                className="hidden sm:inline-flex"
                onClick={() => setTourOpen(true)}
              >
                <PlayCircle className="size-4" /> Demo tour
              </Button>

              <Select value={demo.currentLocation} onValueChange={demo.setCurrentLocation}>
                <SelectTrigger className="hidden w-[210px] bg-card lg:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {demo.locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <ThemeToggle />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="relative" aria-label="Notifications">
                    <Bell className="size-4" />
                    <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-warning" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                  <DropdownMenuItem className="flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">Failed Stripe payment</span>
                    <span className="text-xs text-muted-foreground">
                      Lucas Green — £35.00 Fitness Assessment
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">3 packages expire this week</span>
                    <span className="text-xs text-muted-foreground">James Wilson and 2 others</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">2 unread client messages</span>
                    <span className="text-xs text-muted-foreground">James Wilson</span>
                  </DropdownMenuItem>
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
                  <DropdownMenuItem onClick={() => setBookingOpen(true)}>Add booking</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuick("client")}>Add client</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuick("group")}>Create group session</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuick("block")}>Block availability</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuick("package")}>Sell package</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuick("message")}>Send message</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" asChild className="hidden xl:inline-flex">
                <Link to="/book">
                  View booking page <ExternalLink className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6">{children}</main>
      </div>

      <AddBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
      <DemoTour open={tourOpen} onOpenChange={setTourOpen} />
    </div>
  );
}

export function useQuickActions() {
  return useState<QuickAction>(null);
}
