import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  FileText,
  Gift,
  House,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui-bits";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth/auth-store";
import { userDisplayName } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export type AccountView =
  "overview" | "calendar" | "offers" | "credits" | "purchases" | "invoices" | "profile";

/** The five things a client reaches for on a phone; the rest live in the slide-out menu. */
const TAB_BAR: readonly { view: AccountView; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "overview", label: "Home", icon: House },
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "credits", label: "Credits", icon: Ticket },
  { view: "invoices", label: "Invoices", icon: FileText },
  { view: "profile", label: "Profile", icon: UserRound },
];

const NAV: readonly { view: AccountView; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "offers", label: "Offers", icon: Gift },
  { view: "credits", label: "Credits", icon: Ticket },
  { view: "purchases", label: "Purchases", icon: Receipt },
  { view: "invoices", label: "Invoices", icon: FileText },
  { view: "profile", label: "Profile", icon: UserRound },
];

/**
 * The frame for a signed-in customer, deliberately shaped like the staff shell.
 *
 * A single scrolling column was readable on a phone and close to useless on a
 * laptop, where it left two thirds of the screen empty and buried a month of
 * sessions below the fold. The sidebar buys back that width and gives each part
 * of an account — what's booked, what's paid for, what's been spent — a place
 * of its own rather than a position in one long list.
 */
export function AccountShell({
  view,
  title,
  description,
  actions,
  children,
}: {
  readonly view: AccountView;
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setMobileNav(false), [pathname, view]);

  return (
    // `overflow-x-clip` is the backstop: whatever a card gets wrong, the page itself
    // can never grow wider than the phone. `clip` rather than `hidden`, because
    // `overflow-x: hidden` makes this the scroll container and unsticks the header.
    <div className="min-h-screen overflow-x-clip bg-background">
      {mobileNav ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      ) : null}

      <aside
        className={cn(
          "pt-safe pb-safe pl-safe w-sidebar fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
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

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active = item.view === view;
            return (
              <Link
                key={item.view}
                to="/account"
                search={{ view: item.view }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className={cn("size-4.5", active && "text-sidebar-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <PersonAvatar name={userDisplayName(user, "?")} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-sidebar-accent-foreground">
                {userDisplayName(user)}
              </span>
              <span className="block truncate text-[11px] text-sidebar-foreground/70">
                {user?.email ?? ""}
              </span>
            </span>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-sidebar">
        <header className="pt-safe sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
          <div className="px-safe-4 sm:px-safe-6 flex h-16 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <span className="text-sm font-medium lg:hidden">My account</span>
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          </div>
        </header>

        <main className="px-safe-4 sm:px-safe-6 mx-auto w-full min-w-0 max-w-[1440px] space-y-6 pt-4 pb-28 sm:p-6 lg:pb-safe-12">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">{title}</h1>
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <Link
              to="/account"
              search={{ view: "profile" }}
              aria-label="Profile"
              className="shrink-0 lg:hidden"
            >
              <PersonAvatar name={userDisplayName(user, "?")} size={40} />
            </Link>
          </div>
          {children}
        </main>

        <nav
          aria-label="Account"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
        >
          <ul className="mx-auto grid max-w-lg grid-cols-5 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
            {TAB_BAR.map((item) => {
              const active = item.view === view;
              return (
                <li key={item.view}>
                  <Link
                    to="/account"
                    search={{ view: item.view }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <item.icon className={cn("size-5", active && "text-primary")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
