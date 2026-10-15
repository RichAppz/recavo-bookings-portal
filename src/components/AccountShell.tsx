import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  FileText,
  Gift,
  House,
  LayoutDashboard,
  Menu,
  Receipt,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui-bits";
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
 * Warm neutrals shared with the Studio booking page so the account feels like its
 * continuation. The console's teal primary is re-pointed to near-black here so
 * every shadcn button inside the account picks up the design's dark pill without
 * touching each call site.
 */
const SHELL_STYLE: CSSProperties = {
  "--account-bg": "#f5f4f1",
  "--account-line": "#e6e4df",
  "--account-muted": "#5f656e",
  "--background": "#f5f4f1",
  "--card": "#ffffff",
  "--border": "#e6e4df",
  "--muted-foreground": "#5f656e",
  "--primary": "#15171c",
  "--primary-foreground": "#ffffff",
  "--ring": "#15171c",
} as CSSProperties;

/**
 * The frame for a signed-in customer.
 *
 * On a laptop a light sidebar sits flush with the page: same warm background, a
 * hairline on the right, and a white pill marking where you are. The staff
 * console's dark rail is deliberately not reused here — a client should never
 * feel they've wandered into the business's tools. On a phone the sidebar gives
 * way to a tab bar and the page title carries the avatar, so there is no chrome
 * above "Hi Sarah".
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
    <div
      className="min-h-screen overflow-x-clip bg-[var(--account-bg)] text-[#15171c]"
      style={SHELL_STYLE}
    >
      {mobileNav ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      ) : null}

      <aside
        className={cn(
          "pt-safe pb-safe pl-safe w-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--account-line)] bg-[var(--account-bg)] transition-transform lg:translate-x-0",
          mobileNav ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 pt-6 pb-4">
          <span className="text-[17px] font-extrabold tracking-tight">RECAVO</span>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = item.view === view;
            return (
              <Link
                key={item.view}
                to="/account"
                search={{ view: item.view }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] transition-colors",
                  active
                    ? "border border-[var(--account-line)] bg-white font-semibold shadow-[0_1px_2px_rgba(21,23,28,0.04)]"
                    : "font-medium text-[var(--account-muted)] hover:bg-white/60 hover:text-[#15171c]",
                )}
              >
                <item.icon
                  className={cn(
                    "size-4.5",
                    active ? "text-[#15171c]" : "text-[var(--account-muted)]",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 px-6 py-6">
          <PersonAvatar name={userDisplayName(user, "?")} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
              {userDisplayName(user)}
            </span>
            <button
              onClick={() => void signOut()}
              className="block text-[12px] text-[var(--account-muted)] underline underline-offset-2 hover:text-[#15171c]"
            >
              Sign out
            </button>
          </span>
        </div>
      </aside>

      <div className="lg:pl-sidebar">
        <main className="px-safe-4 sm:px-safe-6 mx-auto w-full min-w-0 max-w-[1440px] space-y-6 pt-safe-4 pb-28 sm:p-6 lg:px-10 lg:pt-8 lg:pb-safe-12">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[30px] font-bold tracking-tight sm:text-[34px]">{title}</h1>
              {description ? (
                <p className="mt-1 text-sm text-[var(--account-muted)]">{description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* Phones already have "Book" on the business card; the header action would repeat it. */}
              {actions ? (
                <div className="hidden lg:flex lg:items-center lg:gap-2">{actions}</div>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full lg:hidden"
                onClick={() => setMobileNav(true)}
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
              <Link
                to="/account"
                search={{ view: "profile" }}
                aria-label="Profile"
                className="lg:hidden"
              >
                <PersonAvatar name={userDisplayName(user, "?")} size={40} />
              </Link>
            </div>
          </div>
          {children}
        </main>

        <nav
          aria-label="Account"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--account-line)] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:hidden"
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
                      "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                      active
                        ? "font-semibold text-[#15171c]"
                        : "font-medium text-[var(--account-muted)]",
                    )}
                  >
                    <item.icon className="size-5" />
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
