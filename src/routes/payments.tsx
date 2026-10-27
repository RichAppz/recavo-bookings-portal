import { useMemo, useState, type ReactNode } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TableGhost } from "@/components/ghost";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MethodLabel, MethodTile, PaymentStatusPill } from "@/components/payments/PaymentBits";
import { PaymentPanel } from "@/components/payments/PaymentPanel";
import {
  PaymentsProblemCard,
  PaymentsSetupLine,
  PaymentsSetupStrip,
  usePaymentsSetup,
} from "@/components/payments/PaymentsSetup";
import { MarkPaidDialog, RecordPaymentDrawer } from "@/components/payments/RecordPayment";
import { RefundDrawer } from "@/components/payments/RefundDrawer";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useSendPaymentReminder } from "@/lib/api/hooks";
import { usePaymentsActivity, usePaymentsOwed } from "@/lib/api/payments-activity";
import { toastApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useIsPhone } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { useBookingWords, type BookingWords } from "@/lib/booking-words";
import {
  DEFAULT_PERIOD,
  METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TABS,
  PERIODS,
  PERIOD_LABELS,
  STATUS_LABELS,
  clientName,
  dayLabel,
  disputeIsOpen,
  expectingLabel,
  expectingLine,
  expectedMethod,
  hasRowFilters,
  isRefundOrDispute,
  matchesFilters,
  owedMatches,
  pageOf,
  PAGE_SIZE,
  paymentFigures,
  paymentsCsv,
  periodRange,
  rowAriaLabel,
  shortDate,
  statusLine,
  timeLabel,
  whatFor,
  zonedDay,
  zonedMidnight,
  type ActivityRow,
  type OwedRow,
  type PaymentFilters,
  type PaymentMethod,
  type PaymentStatus,
  type PaymentTab,
  type Period,
} from "@/lib/payments-page";

const list = <T extends string>(allowed: readonly T[]) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const picked = (v ?? "").split(",").filter((x): x is T => allowed.includes(x as T));
      return picked.length > 0 ? picked.join(",") : undefined;
    });

const searchSchema = z.object({
  tab: z.enum(PAYMENT_TABS).optional().catch(undefined),
  q: z.string().optional(),
  period: z.enum(PERIODS).optional().catch(undefined),
  from: z.string().optional(),
  to: z.string().optional(),
  method: list(PAYMENT_METHODS),
  status: list(PAYMENT_STATUSES),
  client: z.string().optional(),
  payment: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

type PaymentsSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/payments")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Payments — RECAVO" },
      {
        name: "description",
        content: "Every payment from your clients, however they paid.",
      },
      { property: "og:title", content: "RECAVO Payments" },
      {
        property: "og:description",
        content: "Card, cash, bank transfer and card machine payments, refunds and disputes.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <PaymentsPage />
      </AppShell>
    </RequireAuth>
  ),
});

const TAB_LABELS: Record<PaymentTab, string> = {
  all: "All",
  owed: "Owed",
  refunds: "Refunds and disputes",
};

/** Disputes can arrive up to 120 days after a card payment; the banner looks back this far. */
const DISPUTE_LOOKBACK_DAYS = 180;

const splitList = <T extends string>(value: string | undefined): T[] =>
  value ? (value.split(",") as T[]) : [];

function downloadCsv(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PaymentsPage() {
  const tenant = useTenant();
  const phone = useIsPhone();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/payments" });
  const timeZone = tenant.business?.defaultTimezone ?? "Europe/London";
  const currency = tenant.business?.currency ?? "GBP";
  const setup = usePaymentsSetup();
  const canRecord = tenant.can(PERMISSIONS.BOOKING_CREATE);

  const tab: PaymentTab = search.tab ?? "all";
  const period: Period = search.period ?? DEFAULT_PERIOD;
  const filters: PaymentFilters = {
    q: search.q,
    methods: splitList<PaymentMethod>(search.method),
    statuses: splitList<PaymentStatus>(search.status),
    clientId: search.client,
  };
  const filtered = hasRowFilters(filters);
  const anyFilter = filtered || period !== DEFAULT_PERIOD;

  // Recomputed per calendar day so the query key stays stable within a day.
  const todayKey = (() => {
    const d = zonedDay(new Date(), timeZone);
    return `${d.year}-${d.month}-${d.day}`;
  })();
  const range = useMemo(
    () => periodRange(period, new Date(), timeZone, { from: search.from, to: search.to }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, search.from, search.to, timeZone, todayKey],
  );
  const disputeRange = useMemo(() => {
    const d = zonedDay(new Date(), timeZone);
    return {
      from: zonedMidnight(d.year, d.month, d.day - DISPUTE_LOOKBACK_DAYS, timeZone),
      to: zonedMidnight(d.year, d.month, d.day + 1, timeZone),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone, todayKey]);

  const activity = usePaymentsActivity(range);
  const disputeWindow = usePaymentsActivity(disputeRange);
  const owedQuery = usePaymentsOwed();

  const rows = useMemo(
    () =>
      [...(activity.data?.rows ?? [])]
        .filter((r) => matchesFilters(r, filters))
        .sort((a, b) => b.at.localeCompare(a.at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.data, search.q, search.method, search.status, search.client],
  );
  const owed = useMemo(
    () =>
      (owedQuery.data ?? [])
        .filter((r) => owedMatches(r, filters))
        .sort((a, b) => b.daysOutstanding - a.daysOutstanding),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owedQuery.data, search.q, search.client],
  );
  const refundRows = useMemo(() => rows.filter(isRefundOrDispute), [rows]);
  const figures = paymentFigures({
    rows,
    owed,
    range,
    refundsInPeriod: activity.data?.refundsInPeriod ?? null,
    filtered,
  });

  const openDisputes = useMemo(() => {
    const seen = new Map<string, ActivityRow>();
    for (const r of [...(disputeWindow.data?.rows ?? []), ...(activity.data?.rows ?? [])]) {
      if (disputeIsOpen(r)) seen.set(r.id, r);
    }
    return [...seen.values()].sort((a, b) =>
      (a.dispute?.dueBy ?? "9999").localeCompare(b.dispute?.dueBy ?? "9999"),
    );
  }, [disputeWindow.data, activity.data]);

  const allKnown = useMemo(() => {
    const map = new Map<string, ActivityRow>();
    for (const r of disputeWindow.data?.rows ?? []) map.set(r.id, r);
    for (const r of activity.data?.rows ?? []) map.set(r.id, r);
    return map;
  }, [disputeWindow.data, activity.data]);
  const panelRow = search.payment ? (allKnown.get(search.payment) ?? null) : null;
  const panelLoading =
    Boolean(search.payment) && !panelRow && (activity.isLoading || disputeWindow.isLoading);

  const [refundRow, setRefundRow] = useState<ActivityRow | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [markPaid, setMarkPaid] = useState<OwedRow | null>(null);
  const [filterSheet, setFilterSheet] = useState(false);

  const setSearch = (patch: Partial<PaymentsSearch>, opts: { keepPage?: boolean } = {}) => {
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...(opts.keepPage ? {} : { page: undefined }), ...patch };
        return next as PaymentsSearch;
      },
      replace: true,
    });
  };
  const openPayment = (id: string) => {
    void navigate({ search: (prev) => ({ ...prev, payment: id }) as PaymentsSearch });
  };
  const closePayment = () => setSearch({ payment: undefined }, { keepPage: true });
  const clearFilters = () =>
    setSearch({
      q: undefined,
      period: undefined,
      from: undefined,
      to: undefined,
      method: undefined,
      status: undefined,
      client: undefined,
    });

  const currentRows = tab === "refunds" ? refundRows : rows;
  const paged = pageOf(currentRows, search.page ?? 1);
  const pagedOwed = pageOf(owed, search.page ?? 1);
  const now = new Date();

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(paymentsCsv(currentRows, timeZone, now), `payments-${stamp}.csv`);
  };

  const counts: Record<PaymentTab, number> = {
    all: rows.length,
    owed: owed.length,
    refunds: refundRows.length,
  };

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of activity.data?.rows ?? [])
      if (r.customer) map.set(r.customer.id, r.customer.name);
    for (const r of owedQuery.data ?? []) if (r.customer) map.set(r.customer.id, r.customer.name);
    for (const r of disputeWindow.data?.rows ?? [])
      if (r.customer) map.set(r.customer.id, r.customer.name);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activity.data, owedQuery.data, disputeWindow.data]);
  const clientLabel = search.client
    ? (clientOptions.find((c) => c.id === search.client)?.name ?? "One client")
    : null;

  const loading = tab === "owed" ? owedQuery.isLoading : activity.isLoading;
  const failed = tab === "owed" ? owedQuery.isError : activity.isError;

  const list =
    tab === "owed" ? (
      <OwedList
        rows={pagedOwed.items}
        total={owed.length}
        page={pagedOwed.page}
        pages={pagedOwed.pages}
        timeZone={timeZone}
        phone={phone}
        canRecord={canRecord}
        filtered={filtered}
        onClear={clearFilters}
        onMarkPaid={setMarkPaid}
        onPage={(p) => setSearch({ page: p }, { keepPage: true })}
      />
    ) : (
      <ActivityList
        rows={paged.items}
        total={currentRows.length}
        page={paged.page}
        pages={paged.pages}
        tab={tab}
        period={period}
        timeZone={timeZone}
        phone={phone}
        anyFilter={anyFilter}
        setupProblem={setup.problem}
        onClear={clearFilters}
        onOpen={openPayment}
        onPage={(p) => setSearch({ page: p }, { keepPage: true })}
      />
    );

  return (
    <>
      <PageHeader
        title="Payments"
        description={phone ? undefined : "Every payment from your clients, however they paid."}
        actions={
          phone ? (
            canRecord ? (
              <button
                type="button"
                aria-label="Record a payment"
                onClick={() => setRecordOpen(true)}
                className="inline-flex size-11 items-center justify-center rounded-full bg-[#2ee6a6] text-[#06281b] shadow-sm"
              >
                <Plus className="size-5" />
              </button>
            ) : null
          ) : (
            <>
              <Button variant="outline" onClick={exportCsv} disabled={currentRows.length === 0}>
                <Download className="size-4" /> Export
              </Button>
              {canRecord ? (
                <Button onClick={() => setRecordOpen(true)}>
                  <Plus className="size-4" /> Record a payment
                </Button>
              ) : null}
            </>
          )
        }
      />

      {phone ? (
        <div className="-mt-1">{setup.loading ? null : <PaymentsSetupLine setup={setup} />}</div>
      ) : setup.loading ? null : setup.problem ? (
        <PaymentsProblemCard setup={setup} />
      ) : (
        <PaymentsSetupStrip setup={setup} />
      )}

      {openDisputes.length > 0 ? (
        <DisputeBanner
          rows={openDisputes}
          timeZone={timeZone}
          phone={phone}
          onOpen={(id) => openPayment(id)}
        />
      ) : null}

      {phone ? (
        <PhoneSummary
          period={period}
          figures={figures}
          currency={currency}
          onPeriod={(p) => setSearch({ period: p === DEFAULT_PERIOD ? undefined : p })}
        />
      ) : (
        <Figures figures={figures} currency={currency} />
      )}

      <div className="space-y-3">
        <div
          className={cn(
            "flex gap-3",
            phone ? "items-center" : "flex-wrap items-center justify-between",
          )}
        >
          <div
            role="tablist"
            aria-label="Payments"
            className={cn(
              "flex gap-1",
              phone && "-mx-1 min-w-0 flex-1 overflow-x-auto px-1 [scrollbar-width:none]",
            )}
          >
            {PAYMENT_TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setSearch({ tab: t === "all" ? undefined : t })}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-bold whitespace-nowrap transition-colors",
                  tab === t
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {TAB_LABELS[t]}
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    tab === t ? "opacity-70" : "text-muted-foreground",
                    t === "owed" &&
                      tab !== t &&
                      counts.owed > 0 &&
                      "text-[#8a5300] dark:text-[#f3b878]",
                  )}
                >
                  {counts[t]}
                </span>
              </button>
            ))}
          </div>
          {phone ? (
            <Button
              variant="outline"
              size="icon"
              className="relative size-11 shrink-0 rounded-full"
              aria-label="Filter"
              onClick={() => setFilterSheet(true)}
            >
              <SlidersHorizontal className="size-4" />
              {filtered ? (
                <span className="absolute top-2 right-2 size-2 rounded-full bg-[#2ee6a6]" />
              ) : null}
            </Button>
          ) : (
            <DesktopFilters
              search={search}
              period={period}
              filters={filters}
              clientLabel={clientLabel}
              clientOptions={clientOptions}
              anyFilter={anyFilter}
              onChange={setSearch}
              onClear={clearFilters}
            />
          )}
        </div>
        {phone && clientLabel ? (
          <FilterChip label={clientLabel} onRemove={() => setSearch({ client: undefined })} />
        ) : null}

        {loading ? (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <TableGhost rows={6} />
          </div>
        ) : failed ? (
          <EmptyCard
            title="Couldn't load payments"
            body="Check your connection and try again."
            action={
              <Button
                variant="outline"
                onClick={() => void (tab === "owed" ? owedQuery.refetch() : activity.refetch())}
              >
                Try again
              </Button>
            }
          />
        ) : (
          list
        )}
      </div>

      <PaymentPanel
        row={panelRow}
        loading={panelLoading}
        timeZone={timeZone}
        onClose={closePayment}
        onRefund={(r) => setRefundRow(r)}
      />
      <RefundDrawer row={refundRow} timeZone={timeZone} onClose={() => setRefundRow(null)} />
      <RecordPaymentDrawer
        open={recordOpen}
        owed={owedQuery.data ?? []}
        timeZone={timeZone}
        onClose={() => setRecordOpen(false)}
      />
      <MarkPaidDialog row={markPaid} timeZone={timeZone} onClose={() => setMarkPaid(null)} />
      {phone ? (
        <FilterSheet
          open={filterSheet}
          onOpenChange={setFilterSheet}
          search={search}
          period={period}
          clientOptions={clientOptions}
          rows={activity.data?.rows ?? []}
          tab={tab}
          owed={owedQuery.data ?? []}
          onApply={(patch) => {
            setSearch(patch);
            setFilterSheet(false);
          }}
        />
      ) : null}
    </>
  );
}

// --- Banner and figures -------------------------------------------------------------------

function DisputeBanner({
  rows,
  timeZone,
  phone,
  onOpen,
}: {
  rows: ActivityRow[];
  timeZone: string;
  phone: boolean;
  onOpen: (id: string) => void;
}) {
  const first = rows[0]!;
  const amount = first.dispute?.amountMinor ?? first.amountMinor;
  const due = first.dispute?.dueBy;
  const dueLong = due
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
      })
        .format(new Date(due))
        .replace(",", "")
    : null;
  if (phone) {
    return (
      <button
        type="button"
        role="alert"
        onClick={() => onOpen(first.id)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-full bg-destructive/10 px-4 py-2 text-left text-[13px] text-destructive"
      >
        <span>
          <strong>
            {rows.length > 1
              ? `${rows.length} disputes`
              : `${formatMoney(amount, first.currency, { compact: true })} disputed`}
          </strong>
          {due ? ` · respond by ${shortDate(due, timeZone)}` : ""}
        </span>
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </button>
    );
  }
  return (
    <section
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        {rows.length > 1 ? (
          <>
            <strong>{rows.length} disputes need a response.</strong>
            {dueLong ? ` The first is due ${dueLong}.` : ""}
          </>
        ) : (
          <>
            <strong>
              {clientName(first)}'s bank is disputing {formatMoney(amount, first.currency)}.
            </strong>
            {dueLong ? ` Respond by ${dueLong} or the money goes back to them.` : ""}
          </>
        )}
      </p>
      <Button variant="destructive" size="sm" onClick={() => onOpen(first.id)}>
        Respond
      </Button>
    </section>
  );
}

type Figs = ReturnType<typeof paymentFigures>;

function Figures({ figures, currency }: { figures: Figs; currency: string }) {
  const words = useBookingWords();
  const money = (minor: number) => formatMoney(minor, currency);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const tiles: {
    label: string;
    value: string;
    sub: string;
    tone?: "net" | "owed";
  }[] = [
    {
      label: "Taken",
      value: money(figures.takenMinor),
      sub: plural(figures.takenCount, "payment", "payments"),
    },
    {
      label: "Refunded",
      value: money(figures.refundedMinor),
      sub: plural(figures.refundCount, "refund", "refunds"),
    },
    {
      label: "Stripe fees",
      value: money(figures.feesMinor),
      sub: figures.noCardPayments
        ? "No card payments"
        : figures.feesIncomplete
          ? "Some fees not in yet"
          : "On card payments",
    },
    { label: "Net", value: money(figures.netMinor), sub: "What you keep", tone: "net" },
    {
      label: "Owed",
      value: money(figures.owedMinor),
      sub: plural(figures.owedCount, `${words.lower} not paid`, `${words.plural} not paid`),
      tone: "owed",
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.label}
          aria-label={`${t.label}, ${t.value}, ${t.sub.toLowerCase()}`}
          className={cn(
            "rounded-2xl border bg-card px-4 py-3.5",
            t.tone === "net" && "border-foreground/20 bg-secondary/50",
          )}
        >
          <dt className="text-xs font-semibold text-muted-foreground">{t.label}</dt>
          <dd
            className={cn(
              "mt-1 text-[22px] leading-tight font-extrabold tabular-nums",
              t.tone === "owed" && figures.owedMinor > 0 && "text-[#8a5300] dark:text-[#f3b878]",
            )}
          >
            {t.value}
          </dd>
          <dd className="text-xs text-muted-foreground">{t.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

function PhoneSummary({
  period,
  figures,
  currency,
  onPeriod,
}: {
  period: Period;
  figures: Figs;
  currency: string;
  onPeriod: (p: Period) => void;
}) {
  const compact = (minor: number) => formatMoney(minor, currency, { compact: true });
  return (
    <section aria-label="Summary" className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <Select value={period} onValueChange={(v) => onPeriod(v as Period)}>
          <SelectTrigger className="h-9 w-auto gap-1 border-0 px-0 text-[13px] font-bold shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.filter((p) => p !== "custom").map((p) => (
              <SelectItem key={p} value={p}>
                {PERIOD_LABELS[p]}
              </SelectItem>
            ))}
            {period === "custom" ? <SelectItem value="custom">Custom</SelectItem> : null}
          </SelectContent>
        </Select>
        {figures.owedMinor > 0 ? (
          <span className="text-[13px] font-bold text-[#8a5300] dark:text-[#f3b878]">
            Owed {compact(figures.owedMinor)}
          </span>
        ) : null}
      </div>
      <p
        className="mt-1 text-[30px] leading-tight font-extrabold tabular-nums"
        aria-label={`Net, ${formatMoney(figures.netMinor, currency)}, what you keep`}
      >
        {formatMoney(figures.netMinor, currency)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Net · {compact(figures.takenMinor)} taken, {compact(figures.refundedMinor)} refunded,{" "}
        {formatMoney(figures.feesMinor, currency)} Stripe fees
      </p>
    </section>
  );
}

// --- Filters ------------------------------------------------------------------------------

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground pr-1 pl-3 text-[12.5px] font-bold text-background">
      {label}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex size-6 items-center justify-center rounded-full hover:bg-background/20"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function MultiFilter<T extends string>({
  label,
  options,
  labels,
  selected,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  const active = selected.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={active ? "default" : "outline"} size="sm" className="h-9 rounded-full">
          {active
            ? selected.length === 1
              ? labels[selected[0]!]
              : `${label}: ${selected.length}`
            : label}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={selected.includes(o)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) =>
              onChange(on ? [...selected, o] : selected.filter((x) => x !== o))
            }
          >
            {labels[o]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DesktopFilters({
  search,
  period,
  filters,
  clientLabel,
  clientOptions,
  anyFilter,
  onChange,
  onClear,
}: {
  search: PaymentsSearch;
  period: Period;
  filters: PaymentFilters;
  clientLabel: string | null;
  clientOptions: { id: string; name: string }[];
  anyFilter: boolean;
  onChange: (patch: Partial<PaymentsSearch>) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState(search.q ?? "");
  const [focus, setFocus] = useState(false);
  const q = text.trim().toLowerCase();
  const suggestions =
    q.length > 0 ? clientOptions.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const commit = (value: string) => onChange({ q: value.trim() || undefined });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {clientLabel ? (
        <FilterChip label={clientLabel} onRemove={() => onChange({ client: undefined })} />
      ) : null}
      <div className="relative w-[240px]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          placeholder="Search clients or receipts"
          aria-label="Search clients or receipts"
          className="h-9 rounded-full pl-9"
        />
        {focus && suggestions.length > 0 ? (
          <ul className="absolute top-10 right-0 left-0 z-20 overflow-hidden rounded-xl border bg-popover py-1 shadow-lg">
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setText("");
                    onChange({ client: c.id, q: undefined });
                    setFocus(false);
                  }}
                >
                  <span className="truncate font-semibold">{c.name}</span>
                  <span className="text-xs text-muted-foreground">Client</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Select
        value={period}
        onValueChange={(v) =>
          onChange({
            period: v === DEFAULT_PERIOD ? undefined : (v as Period),
            ...(v === "custom" ? {} : { from: undefined, to: undefined }),
          })
        }
      >
        <SelectTrigger
          aria-label="Period"
          className={cn(
            "h-9 w-auto gap-1.5 rounded-full text-[13px] font-semibold",
            period !== DEFAULT_PERIOD && "border-foreground bg-foreground text-background",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => (
            <SelectItem key={p} value={p}>
              {PERIOD_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {period === "custom" ? (
        <span className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="From"
            value={search.from ?? ""}
            onChange={(e) => onChange({ from: e.target.value || undefined })}
            className="h-9 w-[140px]"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            value={search.to ?? ""}
            onChange={(e) => onChange({ to: e.target.value || undefined })}
            className="h-9 w-[140px]"
          />
        </span>
      ) : null}
      <MultiFilter
        label="Method"
        options={PAYMENT_METHODS}
        labels={METHOD_LABELS}
        selected={[...(filters.methods ?? [])]}
        onChange={(next) => onChange({ method: next.length ? next.join(",") : undefined })}
      />
      <MultiFilter
        label="Status"
        options={PAYMENT_STATUSES}
        labels={STATUS_LABELS}
        selected={[...(filters.statuses ?? [])]}
        onChange={(next) => onChange({ status: next.length ? next.join(",") : undefined })}
      />
      {anyFilter ? (
        <button
          type="button"
          onClick={() => {
            setText("");
            onClear();
          }}
          className="h-9 px-1 text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function ToggleChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-[13.5px] font-semibold",
        on
          ? "border-foreground bg-foreground text-background"
          : "border-foreground/15 bg-secondary/50 text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const SHEET_PERIODS: Period[] = ["today", "this_week", "this_month", "last_month", "custom"];

function FilterSheet({
  open,
  onOpenChange,
  search,
  period,
  clientOptions,
  rows,
  owed,
  tab,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  search: PaymentsSearch;
  period: Period;
  clientOptions: { id: string; name: string }[];
  rows: ActivityRow[];
  owed: OwedRow[];
  tab: PaymentTab;
  onApply: (patch: Partial<PaymentsSearch>) => void;
}) {
  const [draftPeriod, setDraftPeriod] = useState<Period>(period);
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const [methods, setMethods] = useState<PaymentMethod[]>(splitList(search.method));
  const [statuses, setStatuses] = useState<PaymentStatus[]>(splitList(search.status));
  const [client, setClient] = useState<string | undefined>(search.client);
  const [text, setText] = useState(search.q ?? "");
  const [syncedFor, setSyncedFor] = useState(false);
  if (open && !syncedFor) {
    setSyncedFor(true);
    setDraftPeriod(period);
    setFrom(search.from ?? "");
    setTo(search.to ?? "");
    setMethods(splitList(search.method));
    setStatuses(splitList(search.status));
    setClient(search.client);
    setText(search.q ?? "");
  } else if (!open && syncedFor) {
    setSyncedFor(false);
  }

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const draft: PaymentFilters = { q: text, methods, statuses, clientId: client };
  // The count is for the period already loaded; a different period shows its count after.
  const count =
    tab === "owed"
      ? owed.filter((r) => owedMatches(r, draft)).length
      : rows
          .filter((r) => matchesFilters(r, draft))
          .filter((r) => (tab === "refunds" ? isRefundOrDispute(r) : true)).length;
  const q = text.trim().toLowerCase();
  const suggestions =
    q && !client ? clientOptions.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 rounded-t-3xl p-0">
        <SheetHeader className="flex-row items-center justify-between border-b px-5 pt-5 pb-3 pr-14 text-left">
          <SheetTitle className="text-lg font-extrabold">Filter</SheetTitle>
          <SheetDescription className="sr-only">Filter payments</SheetDescription>
          <button
            type="button"
            className="h-11 text-sm font-semibold text-muted-foreground"
            onClick={() => {
              setDraftPeriod(DEFAULT_PERIOD);
              setFrom("");
              setTo("");
              setMethods([]);
              setStatuses([]);
              setClient(undefined);
              setText("");
            }}
          >
            Clear all
          </button>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <fieldset>
            <legend className="mb-2 text-sm font-bold">When</legend>
            <div className="flex flex-wrap gap-2">
              {(SHEET_PERIODS.includes(period)
                ? SHEET_PERIODS
                : [...SHEET_PERIODS.slice(0, -1), period, "custom" as const]
              ).map((p) => (
                <ToggleChip key={p} on={draftPeriod === p} onClick={() => setDraftPeriod(p)}>
                  {PERIOD_LABELS[p]}
                </ToggleChip>
              ))}
            </div>
            {draftPeriod === "custom" ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  aria-label="From"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <Input
                  type="date"
                  aria-label="To"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            ) : null}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Method</legend>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <ToggleChip
                  key={m}
                  on={methods.includes(m)}
                  onClick={() => setMethods(toggle(methods, m))}
                >
                  {METHOD_LABELS[m]}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Status</legend>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_STATUSES.map((s) => (
                <ToggleChip
                  key={s}
                  on={statuses.includes(s)}
                  onClick={() => setStatuses(toggle(statuses, s))}
                >
                  {STATUS_LABELS[s]}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <label htmlFor="payments-filter-client" className="text-sm font-bold">
              Client
            </label>
            {client ? (
              <div>
                <FilterChip
                  label={clientOptions.find((c) => c.id === client)?.name ?? "One client"}
                  onRemove={() => setClient(undefined)}
                />
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="payments-filter-client"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Search clients or receipts"
                    className="h-11 pl-9"
                  />
                </div>
                {suggestions.length > 0 ? (
                  <ul className="divide-y rounded-xl border">
                    {suggestions.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center px-3 text-left text-sm font-semibold"
                          onClick={() => {
                            setClient(c.id);
                            setText("");
                          }}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="border-t px-5 py-3.5">
          <Button
            className="h-12 w-full text-[15px]"
            onClick={() =>
              onApply({
                period: draftPeriod === DEFAULT_PERIOD ? undefined : draftPeriod,
                from: draftPeriod === "custom" ? from || undefined : undefined,
                to: draftPeriod === "custom" ? to || undefined : undefined,
                method: methods.length ? methods.join(",") : undefined,
                status: statuses.length ? statuses.join(",") : undefined,
                client,
                q: text.trim() || undefined,
              })
            }
          >
            Show {count} {count === 1 ? "payment" : "payments"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Lists --------------------------------------------------------------------------------

function EmptyCard({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
      <p className="text-[15px] font-extrabold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

function Pager({
  page,
  pages,
  total,
  footer,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  footer: string;
  onPage: (p: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
      <span>
        {pages > 1 ? `Showing ${start} to ${end} of ${total} · ` : ""}
        {footer}
      </span>
      {pages > 1 ? (
        <span className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            Next
          </Button>
        </span>
      ) : null}
    </div>
  );
}

const PERIOD_EMPTY: Record<Period, string> = {
  today: "today",
  this_week: "this week",
  this_month: "this month",
  last_month: "last month",
  last_3_months: "in the last 3 months",
  this_year: "this year",
  custom: "in these dates",
};

function AmountCell({ row }: { row: ActivityRow }) {
  const money = (minor: number) => formatMoney(minor, row.currency);
  const sub =
    row.refundedMinor > 0
      ? `${money(row.refundedMinor)} refunded`
      : row.method === "card_online" && row.feeMinor != null && row.status !== "failed"
        ? `Fee ${money(row.feeMinor)}`
        : null;
  return (
    <div>
      <p
        className={cn(
          "text-[14.5px] font-extrabold tabular-nums",
          row.status === "failed" && "text-muted-foreground line-through",
          row.status === "refunded" && "text-muted-foreground",
        )}
      >
        {money(row.amountMinor)}
      </p>
      {sub ? <p className="text-xs text-muted-foreground tabular-nums">{sub}</p> : null}
    </div>
  );
}

function ActivityList({
  rows,
  total,
  page,
  pages,
  tab,
  period,
  timeZone,
  phone,
  anyFilter,
  setupProblem,
  onClear,
  onOpen,
  onPage,
}: {
  rows: ActivityRow[];
  total: number;
  page: number;
  pages: number;
  tab: PaymentTab;
  period: Period;
  timeZone: string;
  phone: boolean;
  anyFilter: boolean;
  setupProblem: string | null;
  onClear: () => void;
  onOpen: (id: string) => void;
  onPage: (p: number) => void;
}) {
  const words = useBookingWords();
  const now = new Date();
  if (total === 0) {
    if (anyFilter) {
      return (
        <EmptyCard
          title="No payments match"
          body="Try a different period or clear the filters."
          action={
            <Button variant="outline" onClick={onClear}>
              Clear filters
            </Button>
          }
        />
      );
    }
    if (tab === "refunds") {
      return (
        <EmptyCard
          title="No refunds or disputes"
          body="Refunds you give and disputes from a client's bank show here."
        />
      );
    }
    return (
      <EmptyCard
        title={`No payments ${PERIOD_EMPTY[period]}`}
        body={
          setupProblem === "none"
            ? "Clients pay on the day for now. Record cash and card machine payments here, or set up card payments in Settings › Get paid."
            : "Card payments, and anything you record by hand, show here as they come in."
        }
      />
    );
  }

  const footer =
    tab === "refunds"
      ? `${total} ${total === 1 ? "payment" : "payments"} with refunds or disputes ${
          period === "this_month" ? "this month" : "in this period"
        }`
      : "totals cover the whole period";

  if (phone) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-card">
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to="/payments"
                search={(prev) => ({ ...prev, payment: r.id })}
                aria-label={rowAriaLabel(r, timeZone, now)}
                onClick={(e) => {
                  e.preventDefault();
                  onOpen(r.id);
                }}
                className="flex min-h-[62px] items-center gap-3 px-4 py-3 active:bg-secondary/60"
              >
                <MethodTile method={r.method} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-bold">{clientName(r)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {METHOD_LABELS[r.method]} · {dayLabel(r.at, timeZone, now)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      "text-[14.5px] font-extrabold tabular-nums",
                      r.status === "failed" && "text-muted-foreground line-through",
                      r.status === "refunded" && "text-muted-foreground",
                    )}
                  >
                    {formatMoney(r.amountMinor, r.currency)}
                  </span>
                  {r.status !== "succeeded" ? <PaymentStatusPill status={r.status} /> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <Pager page={page} pages={pages} total={total} footer={footer} onPage={onPage} />
      </div>
    );
  }

  const grid = "grid grid-cols-[96px_1.6fr_150px_130px_1fr_20px] items-center gap-4";
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div
        className={cn(
          grid,
          "border-b bg-secondary/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground",
        )}
        aria-hidden
      >
        <span>Date</span>
        <span>Client and what for</span>
        <span>Method</span>
        <span>Amount</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="divide-y">
        {rows.map((r) => {
          const what = whatFor(r, timeZone, now);
          const line = statusLine(r, timeZone, now, words.lower);
          return (
            <li key={r.id}>
              <Link
                to="/payments"
                search={(prev) => ({ ...prev, payment: r.id })}
                aria-label={rowAriaLabel(r, timeZone, now)}
                onClick={(e) => {
                  e.preventDefault();
                  onOpen(r.id);
                }}
                className={cn(grid, "min-h-[62px] px-4 py-2.5 hover:bg-secondary/40")}
              >
                <div>
                  <p className="text-[13.5px] font-bold">{dayLabel(r.at, timeZone, now)}</p>
                  <p className="text-xs text-muted-foreground">{timeLabel(r.at, timeZone)}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-bold">{clientName(r)}</p>
                  {what ? <p className="truncate text-xs text-muted-foreground">{what}</p> : null}
                </div>
                <MethodLabel method={r.method} />
                <AmountCell row={r} />
                <div className="min-w-0">
                  <PaymentStatusPill status={r.status} />
                  {line ? (
                    <p
                      className={cn(
                        "mt-0.5 truncate text-xs",
                        r.status === "failed" || r.status === "disputed"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {line}
                    </p>
                  ) : null}
                </div>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <Pager page={page} pages={pages} total={total} footer={footer} onPage={onPage} />
    </div>
  );
}

function OwedActions({
  row,
  canRecord,
  onMarkPaid,
}: {
  row: OwedRow;
  canRecord: boolean;
  onMarkPaid: (r: OwedRow) => void;
}) {
  const remind = useSendPaymentReminder();
  if (!canRecord) return null;
  const name = row.customer?.name?.split(" ")[0] ?? "the client";
  // Only an awaiting transfer or a confirmed/completed booking can take a reminder.
  const canRemind = Boolean(row.customer);
  return (
    <div className="flex items-center justify-end gap-2">
      {canRemind ? (
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={remind.isPending}
          onClick={async () => {
            try {
              await remind.mutateAsync({ bookingId: row.bookingId });
              toast.success(`Reminder sent to ${name}`);
            } catch (err) {
              toastApiError(err);
            }
          }}
        >
          Remind
        </Button>
      ) : null}
      <Button size="sm" className="h-9" onClick={() => onMarkPaid(row)}>
        Mark paid
      </Button>
    </div>
  );
}

const owedFooter = (w: BookingWords) =>
  `${w.Plural} that have happened or are booked to pay by bank transfer, and haven't been paid yet.`;

function OwedList({
  rows,
  total,
  page,
  pages,
  timeZone,
  phone,
  canRecord,
  filtered,
  onClear,
  onMarkPaid,
  onPage,
}: {
  rows: OwedRow[];
  total: number;
  page: number;
  pages: number;
  timeZone: string;
  phone: boolean;
  canRecord: boolean;
  filtered: boolean;
  onClear: () => void;
  onMarkPaid: (r: OwedRow) => void;
  onPage: (p: number) => void;
}) {
  const words = useBookingWords();
  const now = new Date();
  if (total === 0) {
    return filtered ? (
      <EmptyCard
        title="Nothing owed for this search"
        body={`Clear the search to see every ${words.lower} still waiting for money.`}
        action={
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyCard
        title="Nothing owed"
        body={`Every ${words.lower} that's happened is paid, and no bank transfers are waiting.`}
      />
    );
  }
  const when = (r: OwedRow) =>
    `${dayLabel(r.start, r.timezone || timeZone, now)}${r.done ? " · done" : ""}`;
  const lineTone = (r: OwedRow) =>
    r.paymentMethod === "bank_transfer" && r.done
      ? "text-[#8a5300] dark:text-[#f3b878]"
      : "text-muted-foreground";

  if (phone) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-card">
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.bookingId} className="space-y-2.5 px-4 py-3">
              <div className="flex items-start gap-3">
                <MethodTile
                  method={expectedMethod(r) === "bank_transfer" ? "bank_transfer" : "cash"}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-bold">
                    {r.customer?.name ?? "No client"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.serviceName} · {when(r)}
                  </p>
                  <p className={cn("text-xs", lineTone(r))}>{expectingLine(r, r.currency)}</p>
                </div>
                <span className="shrink-0 text-[14.5px] font-extrabold tabular-nums">
                  {formatMoney(r.outstandingMinor, r.currency)}
                </span>
              </div>
              <OwedActions row={r} canRecord={canRecord} onMarkPaid={onMarkPaid} />
            </li>
          ))}
        </ul>
        <Pager page={page} pages={pages} total={total} footer={owedFooter(words)} onPage={onPage} />
      </div>
    );
  }

  const grid = "grid grid-cols-[1fr_1fr_1.1fr_100px_170px] items-center gap-4";
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div
        className={cn(
          grid,
          "border-b bg-secondary/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground",
        )}
        aria-hidden
      >
        <span>{words.one}</span>
        <span>Client</span>
        <span>Expecting</span>
        <span>Owed</span>
        <span />
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.bookingId} className={cn(grid, "min-h-[62px] px-4 py-2.5")}>
            <div className="min-w-0">
              <Link
                to="/bookings"
                search={{ booking: r.bookingId }}
                className="text-[13.5px] font-bold hover:underline"
              >
                {when(r)}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{r.serviceName}</p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-bold">{r.customer?.name ?? "No client"}</p>
              {r.customer?.phone ? (
                <p className="truncate text-xs text-muted-foreground">{r.customer.phone}</p>
              ) : null}
            </div>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold">
                <MethodTile
                  method={expectedMethod(r) === "bank_transfer" ? "bank_transfer" : "cash"}
                />
                {expectingLabel(r)}
              </span>
              <p className={cn("mt-0.5 truncate text-xs", lineTone(r))}>
                {expectingLine(r, r.currency)}
              </p>
            </div>
            <span className="text-[14.5px] font-extrabold tabular-nums">
              {formatMoney(r.outstandingMinor, r.currency)}
            </span>
            <OwedActions row={r} canRecord={canRecord} onMarkPaid={onMarkPaid} />
          </li>
        ))}
      </ul>
      <Pager page={page} pages={pages} total={total} footer={owedFooter(words)} onPage={onPage} />
    </div>
  );
}
