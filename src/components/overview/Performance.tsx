import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Eye, EyeOff, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Dashboard } from "@/lib/api/types";
import { averageJobValueMinor, usesOccupancy } from "@/lib/dashboard-stats";
import {
  MAIN_PERIODS,
  PERIOD_LABELS,
  PERIODS,
  attendanceSplit,
  attendedRate,
  hasHistory,
  moneySplit,
  nounFor,
  percentDelta,
  percentLabel,
  placesRate,
  pointsDelta,
  type Delta,
  type OverviewCard,
  type Period,
  type PeriodWindow,
} from "@/lib/overview";
import { cn } from "@/lib/utils";
import { useConsumablesOn } from "@/components/consumables/use-consumables-on";
import {
  CardError,
  CardTitle,
  FactTile,
  MINT_BG,
  OvCard,
  SPLIT_COLOURS,
  SplitBar,
  SplitRow,
  TRACK,
  TilesGhost,
  shareLabel,
  useMoney,
} from "./shared";

/* ---------------- Header ---------------- */

export function PerformanceHeader({
  win,
  period,
  onPeriod,
  hideAmounts,
  onHideAmounts,
  onCustomise,
  locationOnly,
  variant,
  canSeeMoney,
}: {
  win: PeriodWindow;
  period: Period;
  onPeriod: (p: Period) => void;
  hideAmounts: boolean;
  onHideAmounts: (hidden: boolean) => void;
  onCustomise: () => void;
  locationOnly: boolean;
  variant: "desktop" | "phone";
  canSeeMoney: boolean;
}) {
  const extra = PERIODS.filter((p) => !MAIN_PERIODS.includes(p));
  if (variant === "phone") {
    return (
      <div className="flex items-center justify-between gap-2 px-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 cursor-pointer items-center gap-1 text-base font-extrabold"
            >
              {win.heading} <ChevronDown className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={period} onValueChange={(v) => onPeriod(v as Period)}>
              {PERIODS.map((p) => (
                <DropdownMenuRadioItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1">
          {locationOnly ? (
            <span className="text-xs text-muted-foreground">This location only</span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label="Page options">
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSeeMoney ? (
                <DropdownMenuItem onSelect={() => onHideAmounts(!hideAmounts)}>
                  {hideAmounts ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  {hideAmounts ? "Show amounts" : "Hide amounts"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={onCustomise}>
                <SlidersHorizontal className="size-4" /> Customise
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }
  const inMore = !MAIN_PERIODS.includes(period);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-baseline gap-2 text-xl font-extrabold tracking-[-0.02em]">
        {win.title}
        {locationOnly ? (
          <span className="text-sm font-medium tracking-normal text-muted-foreground">
            This location only
          </span>
        ) : null}
      </h2>
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="Period"
          className={cn("flex h-[38px] items-center rounded-[10px] p-[3px]", TRACK)}
        >
          {MAIN_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => onPeriod(p)}
              className={cn(
                "h-8 cursor-pointer rounded-lg px-3 text-[13px] font-bold text-muted-foreground transition-colors",
                period === p && "bg-card text-foreground shadow-sm",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                role="tab"
                aria-selected={inMore}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-1 rounded-lg px-3 text-[13px] font-bold text-muted-foreground",
                  inMore && "bg-card text-foreground shadow-sm",
                )}
              >
                {inMore ? PERIOD_LABELS[period] : "More"}
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {extra.map((p) => (
                <DropdownMenuItem key={p} onSelect={() => onPeriod(p)}>
                  {PERIOD_LABELS[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {canSeeMoney ? (
          <Button
            variant="outline"
            size="icon"
            aria-pressed={hideAmounts}
            aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
            title={hideAmounts ? "Show amounts" : "Hide amounts"}
            onClick={() => onHideAmounts(!hideAmounts)}
            className="size-[38px]"
          >
            {hideAmounts ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        ) : null}
        <Button variant="outline" className="h-[38px]" onClick={onCustomise}>
          <SlidersHorizontal className="size-4" /> Customise
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Headline tiles ---------------- */

const DELTA_TONE: Record<Delta["tone"], string> = {
  up: "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(46,230,166,0.14)] dark:text-[#9fe3bf]",
  down: "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
  flat: "bg-[#f1efea] text-[#4b525c] dark:bg-[#2a303a] dark:text-[#a8afba]",
};

function DeltaPill({ delta }: { delta: Delta }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11.5px] font-extrabold",
        DELTA_TONE[delta.tone],
      )}
    >
      <span aria-hidden>{delta.label}</span>
      <span className="sr-only">{delta.srLabel}</span>
    </span>
  );
}

function Trend({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);
  return (
    <div aria-hidden className="mt-3 flex h-[26px] items-end gap-[3px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-[2px]", i === values.length - 1 ? MINT_BG : TRACK)}
          style={{ height: `${max > 0 ? Math.max(8, (v / max) * 100) : 8}%` }}
        />
      ))}
    </div>
  );
}

type Tile = {
  key: string;
  label: string;
  value: string;
  delta: Delta | null;
  sub: string | null;
  trend: number[] | null;
};

function HeadlineTile({
  tile,
  variant,
  className,
}: {
  tile: Tile;
  variant: "desktop" | "phone";
  className?: string;
}) {
  return (
    <Link
      to="/reports"
      className={cn(
        "block min-w-0 rounded-2xl border border-border bg-card px-[18px] py-4 transition-colors hover:bg-secondary/40",
        className,
      )}
    >
      <p className="truncate text-[12.5px] font-semibold text-muted-foreground md:text-[13px]">
        {tile.label}
      </p>
      <p className="mt-1 truncate text-[22px] font-extrabold tracking-[-0.02em] tabular-nums md:text-[30px]">
        {tile.value}
      </p>
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
        {tile.delta ? <DeltaPill delta={tile.delta} /> : null}
        {tile.sub && variant === "desktop" ? (
          <span className="truncate text-[12.5px] text-muted-foreground">{tile.sub}</span>
        ) : null}
      </div>
      {tile.sub && variant === "phone" ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{tile.sub}</p>
      ) : null}
      {variant === "desktop" && tile.trend ? <Trend values={tile.trend} /> : null}
    </Link>
  );
}

export function HeadlineNumbers({
  win,
  current,
  previous,
  trend,
  industry,
  bookingNoun,
  loading,
  error,
  onRetry,
  newBusiness,
  variant,
}: {
  win: PeriodWindow;
  current: Dashboard | undefined;
  previous: Dashboard | undefined;
  trend: Dashboard[] | null;
  industry: string | null | undefined;
  bookingNoun: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  newBusiness: boolean;
  variant: "desktop" | "phone";
}) {
  const money = useMoney();
  const consumablesOn = useConsumablesOn();
  const detailer = !usesOccupancy(industry);
  if (loading) return <TilesGhost count={money.allowed ? 4 : 3} />;
  if (error || !current) {
    return (
      <OvCard>
        <CardError onRetry={onRetry} />
      </OvCard>
    );
  }
  const compare = hasHistory(previous) && win.compareLong ? win.compareLong : null;
  const sessions = (d: Dashboard) => Math.max(0, d.bookings.count - d.attendance.cancelled);
  const a = current.attendance;
  const tiles: Tile[] = [];
  if (money.allowed) {
    tiles.push({
      key: "money",
      label: "Money taken",
      value: money.format(current.revenue.netMinor),
      delta:
        compare && previous
          ? percentDelta(current.revenue.netMinor, previous.revenue.netMinor, compare)
          : null,
      sub: [
        win.compareShort && compare ? win.compareShort : null,
        `${money.format(current.revenue.refundedMinor)} refunded`,
      ]
        .filter(Boolean)
        .join(" · "),
      trend: trend?.map((d) => d.revenue.netMinor) ?? null,
    });
    if (consumablesOn && current.materials) {
      const takeHome = (d: Dashboard) => d.revenue.netMinor - (d.materials?.costMinor ?? 0);
      const { costMinor, uncostedJobs } = current.materials;
      tiles.push({
        key: "take-home",
        label: "Take home",
        value: money.format(takeHome(current)),
        delta:
          compare && previous?.materials
            ? percentDelta(takeHome(current), takeHome(previous), compare)
            : null,
        sub: [
          `after ${money.format(costMinor ?? 0)} materials`,
          uncostedJobs > 0
            ? `${uncostedJobs} ${nounFor(bookingNoun, uncostedJobs)} without costs`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        trend: trend?.map(takeHome) ?? null,
      });
    }
  }
  tiles.push({
    key: "sessions",
    label: `${bookingNoun.trim() || "Booking"}s`,
    value: String(sessions(current)),
    delta:
      compare && previous ? percentDelta(sessions(current), sessions(previous), compare) : null,
    sub: money.allowed ? `worth ${money.format(current.bookings.valueMinor)}` : null,
    trend: trend?.map(sessions) ?? null,
  });
  tiles.push({
    key: "attended",
    label: detailer ? "Completed" : "Attended",
    value: percentLabel(attendedRate(a)),
    delta:
      compare && previous
        ? pointsDelta(attendedRate(a), attendedRate(previous.attendance), compare)
        : null,
    sub: `${a.noShow} no-show · ${a.cancelled} cancelled`,
    trend: trend?.map((d) => attendedRate(d.attendance) ?? 0) ?? null,
  });
  if (detailer) {
    if (money.allowed) {
      const avg = averageJobValueMinor(current.bookings);
      const prevAvg = previous ? averageJobValueMinor(previous.bookings) : null;
      tiles.push({
        key: "average",
        label: "Average job value",
        value: avg === null ? "—" : money.format(avg),
        delta:
          compare && avg !== null && prevAvg !== null ? percentDelta(avg, prevAvg, compare) : null,
        sub:
          current.bookings.count === 0
            ? `No ${nounFor(bookingNoun, 2)} ${win.inPhrase}`
            : `Across ${current.bookings.count} ${nounFor(bookingNoun, current.bookings.count)}`,
        trend: trend?.map((d) => averageJobValueMinor(d.bookings) ?? 0) ?? null,
      });
    }
  } else {
    tiles.push({
      key: "places",
      label: "Places filled",
      value: percentLabel(placesRate(current.occupancy)),
      delta:
        compare && previous
          ? pointsDelta(placesRate(current.occupancy), placesRate(previous.occupancy), compare)
          : null,
      sub: `${current.occupancy.seats} of ${current.occupancy.capacity} places`,
      trend: trend?.map((d) => placesRate(d.occupancy) ?? 0) ?? null,
    });
  }
  if (newBusiness) {
    for (const t of tiles) {
      t.value = "—";
      t.delta = null;
      t.sub = "Numbers appear after your first booking";
      t.trend = null;
    }
  }
  // Five tiles: the two money tiles share the top row until there is room for all five.
  const five = tiles.length === 5;
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        five
          ? "lg:grid-cols-6 xl:grid-cols-5"
          : tiles.length === 4
            ? "lg:grid-cols-4"
            : "lg:grid-cols-3",
      )}
    >
      {tiles.map((t, i) => (
        <HeadlineTile
          key={t.key}
          tile={t}
          variant={variant}
          className={
            five
              ? cn(
                  i < 2 ? "lg:col-span-3" : "lg:col-span-2",
                  i === 4 && "col-span-2",
                  "xl:col-span-1",
                )
              : undefined
          }
        />
      ))}
    </div>
  );
}

/* ---------------- Money in ---------------- */

function SplitCard({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string | null;
  children: ReactNode;
}) {
  return (
    <OvCard label={title} className="p-[18px]">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <CardTitle>{title}</CardTitle>
        {aside ? <p className="text-[13px] text-muted-foreground">{aside}</p> : null}
      </div>
      {children}
    </OvCard>
  );
}

function CardGhost() {
  return <div aria-hidden className="h-[260px] animate-pulse rounded-[18px] bg-secondary" />;
}

export function MoneyInCard({
  win,
  current,
  loading,
  error,
  onRetry,
  stillToCollect,
  packagesOn,
  onlinePaymentsOff,
  bookingNoun,
}: {
  win: PeriodWindow;
  current: Dashboard | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  stillToCollect: number | null;
  packagesOn: boolean;
  onlinePaymentsOff: boolean;
  bookingNoun: string;
}) {
  const money = useMoney();
  if (!money.allowed) return null;
  if (loading) return <CardGhost />;
  if (error || !current) {
    return (
      <SplitCard title="Money in">
        <CardError onRetry={onRetry} className="px-0" />
      </SplitCard>
    );
  }
  const rows = moneySplit(current.revenue);
  const aside = [
    `${money.format(current.revenue.netMinor)} taken`,
    stillToCollect !== null && stillToCollect > 0
      ? `${money.format(stillToCollect)} still to collect`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <SplitCard title="Money in" aside={aside}>
      {rows.length === 0 ? (
        <div className="py-3 text-sm text-muted-foreground">
          No payments yet {win.inPhrase}.
          {onlinePaymentsOff ? (
            <>
              {" "}
              <Link
                to="/payments"
                className="font-bold text-foreground underline-offset-2 hover:underline"
              >
                Get paid online
              </Link>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <SplitBar
            label="Money in by payment method"
            segments={rows.map((r) => ({
              key: r.method,
              share: r.share,
              className: SPLIT_COLOURS[r.colour],
            }))}
          />
          <ul className="mt-3">
            {rows.map((r) => (
              <SplitRow
                key={r.method}
                swatch={SPLIT_COLOURS[r.colour]}
                label={r.label}
                note={`${r.count} ${r.count === 1 ? "payment" : "payments"}`}
                value={money.format(r.grossMinor)}
                share={shareLabel(r.share)}
                sub={
                  r.refundedMinor > 0
                    ? `${money.format(r.refundedMinor)} refunded · ${money.format(r.netMinor)} kept`
                    : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
      <div className={cn("mt-3 grid gap-2", packagesOn ? "grid-cols-3" : "grid-cols-2")}>
        <FactTile
          label={`${bookingNoun.trim() || "Booking"} value`}
          value={money.format(current.bookings.valueMinor)}
        />
        <FactTile
          label="Still to collect"
          value={stillToCollect === null ? "—" : money.format(stillToCollect)}
        />
        {packagesOn ? (
          <FactTile label="Package sales" value={money.format(current.packages.salesMinor)} />
        ) : null}
      </div>
    </SplitCard>
  );
}

/* ---------------- Attendance ---------------- */

const ATTENDANCE_SWATCH = {
  attended: "bg-[#349d62]",
  to_come: "bg-[#c9c4ba] dark:bg-[#4a5160]",
  no_show: "bg-[#e99239]",
  cancelled: "bg-[#e5484d]",
} as const;

export function AttendanceCard({
  win,
  current,
  loading,
  error,
  onRetry,
  industry,
  bookingNoun,
  packagesOn,
  busiestDay,
}: {
  win: PeriodWindow;
  current: Dashboard | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  industry: string | null | undefined;
  bookingNoun: string;
  packagesOn: boolean;
  busiestDay: string | null;
}) {
  const money = useMoney();
  const detailer = !usesOccupancy(industry);
  const title = detailer ? "Job outcomes" : "Attendance";
  if (loading) return <CardGhost />;
  if (error || !current) {
    return (
      <SplitCard title={title}>
        <CardError onRetry={onRetry} className="px-0" />
      </SplitCard>
    );
  }
  const split = attendanceSplit({
    booked: current.bookings.count,
    attended: current.attendance.attended,
    noShow: current.attendance.noShow,
    cancelled: current.attendance.cancelled,
  });
  const labels = {
    attended: detailer ? "Completed" : "Attended",
    to_come: "Still to come",
    no_show: "No-show",
    cancelled: "Cancelled",
  } as const;
  const credits = current.credits;
  const showCredits =
    packagesOn &&
    (credits.issued > 0 || credits.redeemed > 0 || credits.outstanding > 0 || credits.expired > 0);
  const avg = averageJobValueMinor(current.bookings);
  const facts: { label: string; value: string; sub?: string }[] = [];
  if (detailer) {
    if (money.allowed) {
      facts.push({ label: "Average job value", value: avg === null ? "—" : money.format(avg) });
    }
  } else {
    facts.push({
      label: "Places filled",
      value: `${current.occupancy.seats} of ${current.occupancy.capacity}`,
    });
  }
  if (showCredits) {
    facts.push({
      label: "Package credits used",
      value: `${credits.redeemed} of ${credits.issued}`,
      sub: `${credits.outstanding} still to use · ${credits.expired} expired`,
    });
  }
  facts.push({ label: "Busiest day", value: busiestDay ?? "—" });

  return (
    <SplitCard
      title={title}
      aside={`${current.bookings.count} ${nounFor(bookingNoun, current.bookings.count)} booked`}
    >
      {split.total === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          No {nounFor(bookingNoun, 2)} booked {win.inPhrase}.
        </p>
      ) : (
        <>
          <SplitBar
            label={title}
            segments={split.rows.map((r) => ({
              key: r.key,
              share: r.share,
              className: ATTENDANCE_SWATCH[r.key],
            }))}
          />
          <ul className="mt-3">
            {split.rows.map((r) => (
              <SplitRow
                key={r.key}
                swatch={ATTENDANCE_SWATCH[r.key]}
                label={labels[r.key]}
                value={String(r.count)}
                share={shareLabel(r.share)}
              />
            ))}
          </ul>
        </>
      )}
      <div
        className={cn(
          "mt-3 grid gap-2",
          facts.length === 3 ? "grid-cols-3" : facts.length === 2 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {facts.map((f) => (
          <FactTile key={f.label} label={f.label} value={f.value} sub={f.sub} />
        ))}
      </div>
    </SplitCard>
  );
}

export function Footnote({
  current,
  bookingNoun,
}: {
  current: Dashboard | undefined;
  bookingNoun: string;
}) {
  if (!current) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Money counted by {current.basis.dateBasis.replace("_", " ")}, {nounFor(bookingNoun, 2)} by the
      day they were booked or marked · {current.basis.timezone}
    </p>
  );
}

export type PerformanceCard = Extract<OverviewCard, "headline" | "money" | "attendance">;
