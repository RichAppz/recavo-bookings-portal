import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, LayoutDashboard, LogOut, Menu, Receipt, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui-bits";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth/auth-store";
import { userDisplayName } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export type AccountView = "overview" | "calendar" | "credits" | "purchases";

const NAV: readonly { view: AccountView; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "credits", label: "Credits", icon: Ticket },
  { view: "purchases", label: "Purchases", icon: Receipt },
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
            <span className="text-sm font-medium lg:hidden">My account</span>
            <div className="ml-auto flex items-center gap-2">
              {actions}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
