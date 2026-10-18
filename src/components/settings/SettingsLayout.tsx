import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { SaveBar, SettingsDraftsProvider } from "@/components/settings/save-bar";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { StatsGhost, TableGhost } from "@/components/ghost";
import { Input } from "@/components/ui/input";
import { stripeHidden, useConnectAccount, usePaymentsHold, useSubscription } from "@/lib/api/hooks";
import { billingNavAlert } from "@/lib/billing/access";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { billingSurface } from "@/lib/native";
import { PERMISSIONS, canManageSaasBilling } from "@/lib/permissions";
import {
  DEFAULT_SETTINGS_PAGE,
  isSettingsPageKey,
  settingsAttention,
  visibleSettingsNav,
  type SettingsAttention,
  type SettingsPageKey,
} from "@/lib/settings-nav";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/** `/settings/get-paid` → `get-paid`; `/settings` → null. */
function pageFromPath(pathname: string): SettingsPageKey | null {
  const match = /^\/settings\/([^/]+)\/?$/.exec(pathname);
  const key = match?.[1];
  return isSettingsPageKey(key) ? key : null;
}

/**
 * Settings shell (redesign spec §1–§2): page header, the left index with search
 * and amber dots, and the current page beside it. Under 640px the index is a
 * screen of its own — `/settings` shows the list, `/settings/<page>` shows the
 * page with a back button — done with CSS so the server and client agree.
 */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const business = tenant.business;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pageKey = pageFromPath(pathname);
  const atIndex = pageKey === null;

  return (
    <SettingsDraftsProvider>
      <PageHeader
        title="Settings"
        description={`How RECAVO works for ${business?.tradingName ?? "your business"}.`}
      />
      {tenant.isLoading ? (
        <div className="space-y-6">
          <StatsGhost />
          <div className="surface-card overflow-hidden">
            <TableGhost />
          </div>
        </div>
      ) : !business ? (
        <EmptyState title="Couldn't load your business" description="Please try again shortly." />
      ) : (
        <div className="grid gap-8 sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
          <SettingsIndex
            active={pageKey ?? DEFAULT_SETTINGS_PAGE}
            className={atIndex ? "block" : "hidden sm:block"}
          />
          <div className={cn("min-w-0", atIndex ? "hidden sm:block" : "block")}>{children}</div>
        </div>
      )}
      <SaveBar />
    </SettingsDraftsProvider>
  );
}

function useSettingsAttention(): SettingsAttention {
  const tenant = useTenant();
  const connect = useConnectAccount();
  const hold = usePaymentsHold();
  const subscription = useSubscription();
  const sms = useSmsCreditsSummary();
  const chargesReady = connect.data?.chargesEnabled === true && !hold.data;
  const bankReady = tenant.configuration?.bankTransfer?.enabled === true;
  // A business RECAVO has hidden Stripe from is not "missing" Stripe.
  const stillLoading = connect.isLoading || hold.isLoading || !tenant.configuration;
  const paymentsReady =
    stillLoading || chargesReady || bankReady || (stripeHidden(hold.data) && bankReady);
  const alert = billingNavAlert(subscription.data?.subscription, billingSurface());
  return settingsAttention({
    paymentsReady,
    paymentFailed: alert !== null,
    textCredits: sms.level,
  });
}

function SettingsIndex({ active, className }: { active: SettingsPageKey; className?: string }) {
  const tenant = useTenant();
  const subscription = useSubscription();
  const [query, setQuery] = useState("");
  const attention = useSettingsAttention();
  const groups = visibleSettingsNav(
    {
      canReadAudit: tenant.can(PERMISSIONS.AUDIT_READ),
      canManageBilling: canManageSaasBilling({
        can: tenant.can,
        roleKeys: tenant.roleKeys,
        blocked: !subscription.data?.subscription,
      }),
    },
    query,
  );

  return (
    <nav
      aria-label="Settings"
      className={cn("min-w-0 sm:sticky sm:top-20 sm:self-start", className)}
    >
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings"
          aria-label="Search settings"
          className="h-10 bg-card pl-9 sm:h-9"
        />
      </div>
      {groups.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">Nothing matches “{query.trim()}”.</p>
      ) : (
        <div className="grid gap-5">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="mb-1 px-2 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                {group.label}
              </p>
              <ul className="grid gap-0.5">
                {group.items.map((item) => {
                  const isActive = item.key === active;
                  const reason = attention[item.key];
                  return (
                    <li key={item.key}>
                      <Link
                        to="/settings/$page"
                        params={{ page: item.key }}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors sm:min-h-9 sm:py-0",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                          isActive
                            ? "bg-secondary font-bold text-foreground"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate">{item.label}</span>
                            {reason ? (
                              <span
                                className="inline-block size-1.5 shrink-0 rounded-full bg-amber"
                                title={reason}
                              >
                                <span className="sr-only">Needs attention: {reason}</span>
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:hidden">
                            {item.hint}
                          </span>
                        </span>
                        <ChevronRight
                          className="size-4 shrink-0 text-muted-foreground sm:hidden"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
