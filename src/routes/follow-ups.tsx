import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BellRing,
  ChevronDown,
  ChevronRight,
  Plus,
  Repeat,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AVATAR_TINTS, TonePill } from "@/components/client-profile/parts";
import { TableGhost } from "@/components/ghost";
import { ReminderDrawer, type ReminderDrawerTarget } from "@/components/reminders/ReminderDrawer";
import { ReminderMenu } from "@/components/reminders/ReminderMenu";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { useVehicleLookup } from "@/components/vehicles/use-vehicles-data";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api";
import {
  useClientStatsBookings,
  useDismissFollowUps,
  useEveryFollowUp,
  useServices,
} from "@/lib/api/hooks";
import type { ServiceFollowUp } from "@/lib/api/types";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  followUpNames,
  orphanedFollowUps,
  reminderRuleRows,
  type ReminderRuleRow,
} from "@/lib/follow-ups";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import {
  REMINDER_TABS,
  duePill,
  formatReminderWhen,
  lastInLabel,
  matchesRuleFilter,
  reminderMessagePreview,
  reminderStats,
  reminderTab,
  remindersAvailable,
  ruleResults,
  ruleTimingLine,
  sortForTab,
  type DueTone,
  type ReminderTab,
} from "@/lib/service-reminders";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  tab: z.enum(["due", "booked", "snoozed", "dismissed"]).optional(),
  rule: z.string().optional(),
});

export const Route = createFileRoute("/follow-ups")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Reminders — RECAVO" },
      {
        name: "description",
        content: "Bring clients back when they're due. We message them for you.",
      },
      { property: "og:title", content: "RECAVO Reminders" },
      {
        property: "og:description",
        content: "Who is due back, when, and whether they have been reminded.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <RemindersPage />
      </AppShell>
    </RequireAuth>
  ),
});

const PAGE_SIZE = 25;

const DUE_TONE: Record<DueTone, "amber" | "blue" | "grey"> = {
  overdue: "amber",
  soon: "blue",
  later: "grey",
};

function customerName(f: ServiceFollowUp): string {
  const c = f.customer;
  if (!c) return "Client";
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Client";
}

function money(minor: number, currency: string | null | undefined): string {
  try {
    return formatMoney(minor, currency || "GBP");
  } catch {
    return "—";
  }
}

function tintFor(id: string | null | undefined): string {
  if (!id) return AVATAR_TINTS[0]!;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length]!;
}

function Avatar({ f, size = 28 }: { f: ServiceFollowUp; size?: number }) {
  const initials = [f.customer?.firstName, f.customer?.lastName]
    .filter(Boolean)
    .map((s) => s!.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
        tintFor(f.customerId),
      )}
    >
      {initials || "?"}
    </span>
  );
}

function RemindersPage() {
  const tenant = useTenant();
  const phone = useIsPhone();
  const navigate = useNavigate({ from: "/follow-ups" });
  const search = Route.useSearch();
  const tab: ReminderTab = search.tab ?? "due";
  const ruleFilter = search.rule ?? "";
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const available = remindersAvailable(tenant.business?.industryTemplateKey);
  const canAct = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const canEditRules = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const serviceNoun = (
    tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service"
  ).toLowerCase();

  const every = useEveryFollowUp({ enabled: available && !tenant.isLoading });
  const services = useServices();
  const vehicles = useVehicleLookup({ enabled: available });
  const all = useMemo(() => every.data?.items ?? [], [every.data]);
  const bookings = useClientStatsBookings(
    available && canMoney && all.some((f) => f.status === "completed"),
  );
  const rules = useMemo(() => reminderRuleRows(services.data ?? []), [services.data]);
  const ruleById = useMemo(() => new Map(rules.map((r) => [r.rule.id, r])), [rules]);

  const [page, setPage] = useState(0);
  const [drawer, setDrawer] = useState<ReminderDrawerTarget | null>(null);
  const [booking, setBooking] = useState<ServiceFollowUp | null>(null);
  const [detail, setDetail] = useState<ServiceFollowUp | null>(null);
  const [rulesSheet, setRulesSheet] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const setSearch = (next: { tab?: ReminderTab; rule?: string }) => {
    setPage(0);
    void navigate({
      search: (prev) => ({
        ...prev,
        tab: (next.tab ?? prev.tab) === "due" ? undefined : (next.tab ?? prev.tab),
        rule: next.rule === undefined ? prev.rule : next.rule || undefined,
      }),
      replace: true,
    });
  };

  const now = useMemo(() => new Date(), [every.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(
    () => all.filter((f) => matchesRuleFilter(f, ruleFilter)),
    [all, ruleFilter],
  );
  const counts = useMemo(() => {
    const out: Record<ReminderTab, number> = { due: 0, booked: 0, snoozed: 0, dismissed: 0 };
    for (const f of filtered) {
      const t = reminderTab(f, now);
      if (t) out[t] += 1;
    }
    return out;
  }, [filtered, now]);
  const rows = useMemo(
    () =>
      sortForTab(
        filtered.filter((f) => reminderTab(f, now) === tab),
        tab,
      ),
    [filtered, tab, now],
  );
  const pageRows = phone
    ? rows.slice(0, (page + 1) * PAGE_SIZE)
    : rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const bookingsById = useMemo(() => {
    const list = bookings.data?.bookings;
    return Array.isArray(list) ? new Map(list.map((b) => [b.id, b])) : null;
  }, [bookings.data]);
  const stats = useMemo(() => reminderStats(all, bookingsById, now), [all, bookingsById, now]);
  const hasOneOffs = all.some((f) => f.source === "manual");

  // Open reminders left behind by a repeat reminder that has since been removed.
  const orphans = useMemo(() => orphanedFollowUps(all, services.data), [all, services.data]);
  const dismissMany = useDismissFollowUps();
  const stopOrphans = async () => {
    const { stopped, failed } = await dismissMany.mutateAsync(orphans);
    if (failed.length > 0) {
      toast.error(
        `Stopped ${stopped.length} of ${orphans.length}. ${followUpNames(failed.map((f) => f.item))} couldn't be stopped. Try again.`,
      );
    } else {
      toast.success(`Stopped ${orphans.length} ${orphans.length === 1 ? "reminder" : "reminders"}`);
    }
  };

  // "Show it" from the drawer: move to the tab and page that hold it, then flash it.
  const showRow = (f: ServiceFollowUp) => {
    const t = reminderTab(f, now) ?? "due";
    const list = sortForTab(
      all.filter((x) => reminderTab(x, now) === t),
      t,
    );
    const index = list.findIndex((x) => x.id === f.id);
    void navigate({ search: { tab: t === "due" ? undefined : t }, replace: true });
    setPage(index >= 0 ? Math.floor(index / PAGE_SIZE) : 0);
    setHighlight(f.id);
  };
  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`reminder-${highlight}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlight, pageRows]);

  const editRuleFor = (f: ServiceFollowUp) => {
    if (!canEditRules || !f.ruleId) return undefined;
    const row = ruleById.get(f.ruleId);
    if (!row) return undefined;
    return () => setDrawer({ mode: "edit", serviceId: row.serviceId, rule: row.rule });
  };

  const openAdd = () => setDrawer({ mode: "add", who: canEditRules ? "everyone" : "one" });

  if (!tenant.isLoading && !available) {
    return (
      <>
        <PageHeader title="Reminders" />
        <EmptyState
          icon={<BellRing className="size-6" />}
          title="Reminders are for automotive businesses for now"
          description="They bring clients back when a job is due again, like a coating top-up or a maintenance wash. This business isn't set up as car detailing, so there's nothing to set up here yet."
        />
      </>
    );
  }

  const loading = tenant.isLoading || every.isLoading || services.isLoading;
  const nothingYet = !loading && rules.length === 0 && all.length === 0;
  const ruleName = (r: ReminderRuleRow) => r.rule.label?.trim() || r.serviceName;
  const filterLabel = !ruleFilter
    ? "All reminders"
    : ruleFilter === "one-off"
      ? "One-offs only"
      : ruleById.get(ruleFilter)
        ? ruleName(ruleById.get(ruleFilter)!)
        : "All reminders";
  const day = (iso: string | null | undefined) => formatReminderWhen(iso, timezone);

  const subtitle = phone
    ? `${stats.dueThisWeek} due this week · ${stats.overdue} overdue`
    : "Bring clients back when they're due. We message them for you.";

  const vehicleOf = (f: ServiceFollowUp) =>
    f.linkedRecordId ? vehicles.get(f.linkedRecordId) : undefined;

  const dueFor = (f: ServiceFollowUp) => {
    const v = vehicleOf(f);
    return (
      <div className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-bold">{f.title}</span>
          {f.source === "manual" ? (
            <TonePill tone="grey" className="shrink-0">
              One-off
            </TonePill>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {v?.plate ? <NumberPlate registration={v.plate} size="small" /> : null}
          <span className="truncate">
            {v ? v.title : f.linkedRecord ? f.linkedRecord.label : f.serviceName}
          </span>
        </span>
      </div>
    );
  };

  const duePillFor = (f: ServiceFollowUp) => {
    if (tab === "booked") return <TonePill tone="green">Booked</TonePill>;
    if (tab === "snoozed" && f.snoozedUntil)
      return <TonePill tone="grey">Snoozed to {day(f.snoozedUntil)}</TonePill>;
    if (tab === "dismissed") return <TonePill tone="grey">Dismissed</TonePill>;
    const p = duePill(f.dueAt, timezone, now);
    return <TonePill tone={DUE_TONE[p.tone]}>{p.label}</TonePill>;
  };

  const reminderCell = (f: ServiceFollowUp) => {
    if (tab === "booked") {
      const b = f.supersededByBookingId && bookingsById?.get(f.supersededByBookingId);
      return (
        <span className="text-[13px]">
          {canMoney && b ? money(b.priceMinor, b.currency) : "Booked"}
        </span>
      );
    }
    if (f.sentAt) {
      return (
        <span className="grid">
          <span className="text-[13px] font-semibold">Sent {day(f.sentAt)}</span>
          <span className="text-xs text-muted-foreground">Email and text</span>
        </span>
      );
    }
    const sends = f.snoozedUntil && new Date(f.snoozedUntil) > now ? f.snoozedUntil : f.remindAt;
    return <span className="text-[13px] text-muted-foreground">Sends {day(sends)}</span>;
  };

  const dueDate = (f: ServiceFollowUp) => {
    if (tab === "booked") {
      const b = f.supersededByBookingId && bookingsById?.get(f.supersededByBookingId);
      return b ? `Booked for ${day(b.start)}` : "Booked again";
    }
    return formatReminderWhen(f.dueAt, timezone, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const ariaFor = (f: ServiceFollowUp) => {
    const v = vehicleOf(f);
    const p = duePill(f.dueAt, timezone, now);
    return [
      customerName(f),
      `${f.title}${v?.plate ? ` for ${v.plate}` : ""}`,
      `due ${formatReminderWhen(f.dueAt, timezone, { weekday: "long", day: "numeric", month: "long" })}`,
      tab === "due" ? p.label : (REMINDER_TABS.find((t) => t.key === tab)?.label ?? ""),
      f.sentAt ? `reminder sent ${day(f.sentAt)}` : "reminder not sent yet",
    ].join(", ");
  };

  const bookButton = (f: ServiceFollowUp, className?: string) =>
    canAct && tab === "due" ? (
      <Button
        size="sm"
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          setBooking(f);
        }}
        aria-label={`Book ${customerName(f)} for ${f.title}`}
      >
        Book
      </Button>
    ) : null;

  const tabs = (
    <div
      role="tablist"
      aria-label="Which reminders"
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
    >
      {REMINDER_TABS.map((t) => {
        const active = t.key === tab;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${t.label}, ${counts[t.key]}`}
            onClick={() => setSearch({ tab: t.key })}
            className={cn(
              "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "bg-primary font-extrabold text-primary-foreground"
                : "bg-secondary font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="text-xs font-bold tabular-nums opacity-70" aria-hidden>
              {loading ? "" : counts[t.key]}
            </span>
          </button>
        );
      })}
    </div>
  );

  const ruleFilterMenu =
    rules.length > 0 || hasOneOffs ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn("h-[34px] gap-1.5 font-semibold", ruleFilter && "border-foreground/40")}
          >
            <span className="max-w-40 truncate">{filterLabel}</span>
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-72">
          <DropdownMenuRadioGroup value={ruleFilter} onValueChange={(v) => setSearch({ rule: v })}>
            <DropdownMenuRadioItem value="">All reminders</DropdownMenuRadioItem>
            {rules.length > 0 ? <DropdownMenuSeparator /> : null}
            {rules.map((r) => (
              <DropdownMenuRadioItem key={r.rule.id} value={r.rule.id}>
                <span className="truncate">
                  {ruleName(r)}
                  <span className="text-muted-foreground"> · {r.serviceName}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
            {hasOneOffs ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuRadioItem value="one-off">One-offs only</DropdownMenuRadioItem>
              </>
            ) : null}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const emptyText =
    tab === "due"
      ? ruleFilter
        ? "Nobody is due for this reminder right now."
        : "Nobody is due right now. We'll list clients here as their services come due."
      : tab === "booked"
        ? "Nobody has booked again from a reminder yet."
        : tab === "snoozed"
          ? "Nothing is snoozed."
          : "Nothing has been dismissed.";

  let list: ReactNode;
  if (loading) {
    list = <TableGhost rows={5} />;
  } else if (every.isError) {
    list = (
      <div className="p-6">
        <EmptyState
          title="Couldn't load reminders"
          description={
            every.error instanceof ApiError
              ? every.error.detail || every.error.title
              : "Please try again shortly."
          }
          action={<Button onClick={() => every.refetch()}>Try again</Button>}
        />
      </div>
    );
  } else if (rows.length === 0) {
    list = <p className="px-6 py-12 text-center text-sm text-muted-foreground">{emptyText}</p>;
  } else if (phone) {
    list = (
      <ul className="divide-y">
        {pageRows.map((f) => (
          <li
            key={f.id}
            id={`reminder-${f.id}`}
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-colors duration-700",
              tab === "dismissed" && "opacity-70",
              highlight === f.id && "bg-primary-soft",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              onClick={() => setDetail(f)}
              aria-label={ariaFor(f)}
            >
              <Avatar f={f} size={36} />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[15px] font-bold">{customerName(f)}</span>
                  <span className="shrink-0">{duePillFor(f)}</span>
                </span>
                <span className="truncate text-[13px] text-muted-foreground">
                  {f.title} · {day(f.dueAt)}
                </span>
              </span>
            </button>
            {bookButton(f, "h-11 shrink-0 px-4")}
          </li>
        ))}
        {pageRows.length < rows.length ? (
          <li className="p-3 text-center">
            <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
              Show more
            </Button>
          </li>
        ) : null}
      </ul>
    );
  } else {
    list = (
      <div className="overflow-x-auto">
        <div role="table" aria-label="Reminders" className="min-w-[760px] text-sm">
          <div
            role="row"
            className="grid h-10 grid-cols-[1.1fr_1.3fr_112px_128px_92px] items-center gap-3 bg-secondary/50 px-4 text-xs font-bold text-muted-foreground"
          >
            <span role="columnheader">Client</span>
            <span role="columnheader">Due for</span>
            <span role="columnheader">{tab === "booked" ? "Booked" : "Due"}</span>
            <span role="columnheader">{tab === "booked" ? "Value" : "Reminder"}</span>
            <span role="columnheader" className="sr-only">
              Actions
            </span>
          </div>
          {pageRows.map((f) => (
            <div
              key={f.id}
              id={`reminder-${f.id}`}
              role="row"
              tabIndex={0}
              aria-label={ariaFor(f)}
              onClick={() =>
                void navigate({ to: "/clients/$clientId", params: { clientId: f.customerId } })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target === e.currentTarget) {
                  void navigate({ to: "/clients/$clientId", params: { clientId: f.customerId } });
                }
              }}
              className={cn(
                "grid min-h-16 cursor-pointer grid-cols-[1.1fr_1.3fr_112px_128px_92px] items-center gap-3 border-t px-4 py-2.5 transition-colors duration-700 hover:bg-secondary/40",
                tab === "dismissed" && "opacity-70",
                highlight === f.id && "bg-primary-soft",
              )}
            >
              <span role="cell" className="flex min-w-0 items-center gap-2.5">
                <Avatar f={f} />
                <span className="grid min-w-0">
                  <span className="truncate text-[14.5px] font-bold">{customerName(f)}</span>
                  <span className="truncate text-[12.5px] text-muted-foreground">
                    {lastInLabel(f.lastDoneAt, timezone, now)}
                  </span>
                </span>
              </span>
              <span role="cell" className="min-w-0">
                {dueFor(f)}
              </span>
              <span role="cell" className="grid justify-items-start gap-1">
                <span className="text-[13.5px] font-bold">{dueDate(f)}</span>
                {duePillFor(f)}
              </span>
              <span role="cell" className="min-w-0">
                {reminderCell(f)}
              </span>
              <span role="cell" className="flex items-center justify-end gap-1">
                {bookButton(f)}
                <ReminderMenu
                  followUp={f}
                  timezone={timezone}
                  canAct={canAct}
                  onEditRule={editRuleFor(f)}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const pager =
    !phone && rows.length > PAGE_SIZE ? (
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-[13px] text-muted-foreground">
        <span>
          Showing {page * PAGE_SIZE + 1} to {Math.min(rows.length, (page + 1) * PAGE_SIZE)} of{" "}
          {rows.length}
        </span>
        <span className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * PAGE_SIZE >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </span>
      </div>
    ) : null;

  const ruleRow = (r: ReminderRuleRow) => {
    const res = ruleResults(all, r.rule.id, now);
    const body = (
      <>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.16)] dark:text-[#9fe3bf]">
          <Repeat className="size-4" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-sm font-bold">{ruleName(r)}</span>
          <span className="truncate text-xs text-muted-foreground">
            {r.serviceName} · {ruleTimingLine(r.rule)}
            {r.serviceActive ? "" : ` · ${serviceNoun} archived`}
          </span>
          <span className="text-xs font-semibold text-[#1f6b41] dark:text-[#9fe3bf]">
            {res.due} due · {res.cameBack} came back
          </span>
        </span>
        {canEditRules ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </>
    );
    return (
      <li key={r.rule.id}>
        {canEditRules ? (
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40"
            onClick={() => {
              setRulesSheet(false);
              setDrawer({ mode: "edit", serviceId: r.serviceId, rule: r.rule });
            }}
            aria-label={`Edit ${ruleName(r)} reminder on ${r.serviceName}`}
          >
            {body}
          </button>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3">{body}</div>
        )}
      </li>
    );
  };

  const rulesCard = (
    <section
      className="surface-card overflow-hidden rounded-2xl"
      aria-labelledby="repeat-reminders"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div className="grid gap-1">
          <h2 id="repeat-reminders" className="text-[15px] font-extrabold">
            Repeat reminders
          </h2>
          <p className="text-[12.5px] text-muted-foreground">
            Set on a {serviceNoun}. Every time it&rsquo;s done, the client is reminded when
            it&rsquo;s due again.
          </p>
        </div>
        {canEditRules ? (
          <button
            type="button"
            className="shrink-0 cursor-pointer text-[13px] font-bold text-primary"
            onClick={() => setDrawer({ mode: "add", who: "everyone" })}
          >
            + Add
          </button>
        ) : null}
      </div>
      {services.isLoading ? (
        <TableGhost rows={2} />
      ) : rules.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-muted-foreground">None yet.</p>
      ) : (
        <ul className="divide-y border-t">{rules.map(ruleRow)}</ul>
      )}
    </section>
  );

  const latestRule = rules[0];
  const sample = all.find((f) => f.customer && reminderTab(f, now) === "due") ?? all[0];
  const samplePlate = sample ? (vehicleOf(sample)?.plate ?? null) : null;
  const preview = reminderMessagePreview({
    firstName: sample?.customer?.firstName ?? "Sam",
    name: sample?.title ?? (latestRule ? ruleName(latestRule) : "Coating top-up"),
    plate: samplePlate,
    due: sample
      ? formatReminderWhen(sample.dueAt, timezone, { day: "numeric", month: "long" })
      : "3 November",
  });

  const messageCard = (
    <section className="surface-card rounded-2xl p-4" aria-labelledby="what-clients-get">
      <h2 id="what-clients-get" className="text-[15px] font-extrabold">
        What clients get
      </h2>
      <p className="mt-3 rounded-2xl rounded-bl-md bg-secondary px-3.5 py-3 text-[13.5px] leading-relaxed">
        {preview.before}
        <span className="font-bold">{preview.name}</span>
        {preview.after}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Sent by email, and by text if they&rsquo;ve agreed to texts. Change the wording in{" "}
        <Link
          to="/settings/$page"
          params={{ page: "client-messages" }}
          className="font-semibold text-primary hover:underline"
        >
          Settings › Client messages
        </Link>
        .
      </p>
    </section>
  );

  const footerNote = (
    <p className="text-xs text-muted-foreground">
      Reminders for an upcoming {tenant.terminology.booking.toLowerCase()} (the day before, say) are
      in{" "}
      <Link
        to="/settings/$page"
        params={{ page: "client-messages" }}
        className="font-semibold text-primary hover:underline"
      >
        Settings › Client messages
      </Link>
      .
    </p>
  );

  const statTiles = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Overdue"
        value={String(stats.overdue)}
        sub="Not booked yet"
        valueClass="text-[#8a5300] dark:text-[#f3b878]"
        onClick={() => setSearch({ tab: "due" })}
      />
      <StatTile
        label="Due in 30 days"
        value={String(stats.due30)}
        sub={`${stats.dueThisWeek} this week`}
        onClick={() => setSearch({ tab: "due" })}
      />
      <StatTile
        label="Came back"
        value={String(stats.cameBack)}
        sub="Last 90 days"
        onClick={() => setSearch({ tab: "booked" })}
      />
      {canMoney ? (
        <StatTile
          label="Brought in"
          value={
            stats.broughtInMinor === null
              ? bookings.isLoading
                ? "…"
                : "–"
              : money(stats.broughtInMinor, stats.currency ?? tenant.business?.currency)
          }
          sub="From reminders, last 90 days"
          valueClass="text-[#1f6b41] dark:text-[#9fe3bf]"
          onClick={() => setSearch({ tab: "booked" })}
        />
      ) : null}
    </div>
  );

  const orphanBanner =
    canAct && orphans.length > 0 ? (
      <div
        role="status"
        className="flex flex-col gap-2 border-b bg-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        data-testid="orphaned-reminders"
      >
        <p className="flex min-w-0 items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          {orphans.length} {orphans.length === 1 ? "reminder is" : "reminders are"} from a repeat
          reminder you&rsquo;ve since deleted, and will still go out ({followUpNames(orphans)}).
        </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 self-start sm:self-auto"
          disabled={dismissMany.isPending}
          onClick={() => void stopOrphans()}
        >
          {dismissMany.isPending ? "Stopping…" : "Stop them"}
        </Button>
      </div>
    ) : null;

  const addButton =
    canEditRules || canAct ? (
      phone ? (
        <Button
          size="icon"
          className="size-[42px] bg-ring text-[#10172a] hover:bg-ring/90"
          onClick={openAdd}
          aria-label="Add reminder"
        >
          <Plus className="size-5" />
        </Button>
      ) : (
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          Add reminder
        </Button>
      )
    ) : undefined;

  const emptyCard = (
    <div className="surface-card rounded-2xl p-6">
      <EmptyState
        icon={<BellRing className="size-6" />}
        title="Nobody is due yet"
        description={`Add a reminder to a ${serviceNoun} and clients are reminded when it's due again. A coating top-up every year, say.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {canEditRules ? (
              <Button onClick={() => setDrawer({ mode: "add", who: "everyone" })}>
                <Plus className="size-4" /> Add reminder
              </Button>
            ) : null}
            {canAct ? (
              <Button variant="outline" onClick={() => setDrawer({ mode: "add", who: "one" })}>
                <UserRound className="size-4" /> One client
              </Button>
            ) : null}
          </div>
        }
      />
    </div>
  );

  const listCard = (
    <div className="surface-card overflow-hidden rounded-2xl">
      {orphanBanner}
      {list}
      {pager}
    </div>
  );

  return (
    <>
      <PageHeader title="Reminders" description={subtitle} actions={addButton} />

      {phone ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {nothingYet ? (
            emptyCard
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">{tabs}</div>
              </div>
              {ruleFilterMenu ? <div>{ruleFilterMenu}</div> : null}
              {listCard}
              <button
                type="button"
                className="surface-card flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
                onClick={() => setRulesSheet(true)}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.16)] dark:text-[#9fe3bf]">
                  <Repeat className="size-4" />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="text-sm font-bold">Repeat reminders</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {rules.length} on · {stats.cameBack}{" "}
                    {stats.cameBack === 1 ? "client" : "clients"} came back
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
              {footerNote}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 content-start gap-4">
            {nothingYet ? (
              emptyCard
            ) : (
              <>
                {statTiles}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {tabs}
                  {ruleFilterMenu}
                </div>
                {listCard}
              </>
            )}
          </div>
          <aside className="grid content-start gap-4">
            {rulesCard}
            {messageCard}
            {footerNote}
          </aside>
        </div>
      )}

      <Sheet open={rulesSheet} onOpenChange={setRulesSheet}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px]">
          <SheetHeader className="border-b px-4 sm:px-5 pt-6 pb-4 text-left">
            <SheetTitle className="text-xl font-extrabold">Repeat reminders</SheetTitle>
            <SheetDescription>
              Set on a {serviceNoun}. Every time it&rsquo;s done, the client is reminded when
              it&rsquo;s due again.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rules.length === 0 ? (
              <p className="p-4 sm:p-5 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y">{rules.map(ruleRow)}</ul>
            )}
            <div className="grid gap-4 p-4">{messageCard}</div>
          </div>
          {canEditRules ? (
            <footer className="border-t px-4 sm:px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                className="h-12 w-full"
                onClick={() => {
                  setRulesSheet(false);
                  setDrawer({ mode: "add", who: "everyone" });
                }}
              >
                <Plus className="size-4" /> Add repeat reminder
              </Button>
            </footer>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={detail !== null} onOpenChange={(o) => (o ? undefined : setDetail(null))}>
        <SheetContent side="bottom" className="max-h-[85vh] gap-0 rounded-t-3xl p-0">
          {detail ? (
            <>
              <SheetHeader className="px-4 sm:px-5 pt-6 pb-3 text-left">
                <SheetTitle className="flex items-center gap-3 text-xl font-extrabold">
                  <Avatar f={detail} size={40} />
                  <span className="truncate">{customerName(detail)}</span>
                </SheetTitle>
                <SheetDescription className="sr-only">Reminder details</SheetDescription>
              </SheetHeader>
              <div className="grid gap-3 px-4 sm:px-5 pb-4 text-sm">
                {dueFor(detail)}
                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                    <dt className="text-xs text-muted-foreground">
                      {tab === "booked" ? "Booked" : "Due"}
                    </dt>
                    <dd className="mt-0.5 font-bold">{dueDate(detail)}</dd>
                    <dd className="mt-1">{duePillFor(detail)}</dd>
                  </div>
                  <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                    <dt className="text-xs text-muted-foreground">Reminder</dt>
                    <dd className="mt-0.5">{reminderCell(detail)}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {lastInLabel(detail.lastDoneAt, timezone, now)}
                </p>
              </div>
              <footer className="flex items-center gap-2 border-t px-4 sm:px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button
                  variant="outline"
                  className="h-12 flex-1"
                  onClick={() => {
                    const id = detail.customerId;
                    setDetail(null);
                    void navigate({ to: "/clients/$clientId", params: { clientId: id } });
                  }}
                >
                  View client
                </Button>
                {canAct && tab === "due" ? (
                  <Button
                    className="h-12 flex-1"
                    onClick={() => {
                      setBooking(detail);
                      setDetail(null);
                    }}
                  >
                    Book
                  </Button>
                ) : null}
                <ReminderMenu
                  followUp={detail}
                  timezone={timezone}
                  canAct={canAct}
                  triggerClassName="size-12"
                  onEditRule={(() => {
                    const edit = editRuleFor(detail);
                    return edit
                      ? () => {
                          setDetail(null);
                          edit();
                        }
                      : undefined;
                  })()}
                />
              </footer>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AddBookingModal
        open={booking !== null}
        onOpenChange={(open) => {
          if (!open) setBooking(null);
        }}
        defaultCustomerId={booking?.customerId}
        defaultServiceId={booking?.serviceId}
        defaultLinkedRecordId={booking?.linkedRecordId ?? undefined}
        defaultDate={
          booking
            ? (() => {
                const due = new Date(booking.dueAt);
                const start =
                  !Number.isNaN(due.getTime()) && due.getTime() >= Date.now() ? due : new Date();
                const formatted = formatReminderWhen(start.toISOString(), timezone, {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                });
                if (!/^\d{2}\/\d{2}\/\d{4}$/.test(formatted)) return undefined;
                return formatted.split("/").reverse().join("-");
              })()
            : undefined
        }
      />

      <ReminderDrawer
        target={drawer}
        onClose={() => setDrawer(null)}
        services={services.data ?? []}
        canStopScheduled={canAct}
        onShowExisting={showRow}
      />
    </>
  );
}

function StatTile({
  label,
  value,
  sub,
  valueClass,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card grid cursor-pointer gap-1 rounded-[14px] px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
    >
      <span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-extrabold tabular-nums", valueClass)}>{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </button>
  );
}
