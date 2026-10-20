import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import {
  DEFAULT_PREFS,
  legacyHiddenCards,
  maskedMoney,
  parseOverviewPrefs,
  prefsStorageKey,
  type AttentionTone,
  type OverviewPrefs,
  type SplitColour,
  type TodayPillKey,
} from "@/lib/overview";
import { cn } from "@/lib/utils";

/* ---------------- Money ---------------- */

type MoneyContextValue = { currency: string; hidden: boolean; allowed: boolean };

const MoneyContext = createContext<MoneyContextValue>({
  currency: "GBP",
  hidden: false,
  allowed: true,
});

/**
 * Every £ on the Overview goes through `useMoney()`, so Hide amounts masks all of
 * them and staff without money permission never see one.
 */
export function MoneyProvider({
  currency,
  hidden,
  allowed,
  children,
}: MoneyContextValue & { children: ReactNode }) {
  return (
    <MoneyContext.Provider value={{ currency, hidden, allowed }}>{children}</MoneyContext.Provider>
  );
}

export function useMoney() {
  const ctx = useContext(MoneyContext);
  const format = useCallback(
    (minor: number) =>
      ctx.hidden
        ? maskedMoney(formatMoney(0, ctx.currency))
        : formatMoney(minor, ctx.currency, { compact: true }),
    [ctx.currency, ctx.hidden],
  );
  return { format, hidden: ctx.hidden, allowed: ctx.allowed, currency: ctx.currency };
}

/* ---------------- Time ---------------- */

/** The current time, re-read every minute on the minute (now line, countdown). */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    const timeout = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}

/* ---------------- Saved settings ---------------- */

function readPrefs(businessId: string, userId: string): OverviewPrefs {
  try {
    const raw = localStorage.getItem(prefsStorageKey(businessId, userId));
    if (raw) return parseOverviewPrefs(JSON.parse(raw));
    const legacy = localStorage.getItem(`recavo.overview.hidden.${businessId}`);
    return { ...DEFAULT_PREFS, hidden: legacy ? legacyHiddenCards(JSON.parse(legacy)) : [] };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Period, Hide amounts, card order/visibility and quick actions, per person and per
 * business on this device. Read after mount (the server renders the defaults).
 */
export function useOverviewPrefs(businessId: string, userId: string | undefined) {
  const [prefs, setPrefs] = useState<OverviewPrefs>(DEFAULT_PREFS);
  const ready = Boolean(businessId && userId);

  useEffect(() => {
    if (businessId && userId) setPrefs(readPrefs(businessId, userId));
  }, [businessId, userId]);

  const update = useCallback(
    (patch: Partial<OverviewPrefs>) => {
      setPrefs((prev) => {
        const next = parseOverviewPrefs({ ...prev, ...patch });
        if (ready && userId) {
          try {
            localStorage.setItem(prefsStorageKey(businessId, userId), JSON.stringify(next));
          } catch {
            // Storage unavailable: the choice lasts for this visit.
          }
        }
        return next;
      });
    },
    [businessId, userId, ready],
  );

  return { prefs, update };
}

/* ---------------- Visual bits ---------------- */

export function OvCard({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn("min-w-0 rounded-[18px] border border-border bg-card", className)}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-base font-extrabold tracking-[-0.01em]">
      {children}
    </h2>
  );
}

export function CardError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div className={cn("px-[18px] py-6 text-sm text-muted-foreground", className)} role="alert">
      Couldn't load this.{" "}
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer font-bold text-foreground underline-offset-2 hover:underline"
      >
        Try again
      </button>
    </div>
  );
}

export function RowsGhost({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-3 px-[18px] py-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-9 w-12 animate-pulse rounded-md bg-secondary" />
          <div className="h-9 flex-1 animate-pulse rounded-md bg-secondary" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-secondary" />
        </div>
      ))}
    </div>
  );
}

export function TilesGhost({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[132px] animate-pulse rounded-2xl bg-secondary" />
      ))}
    </div>
  );
}

export const TRACK = "bg-[#f1efea] dark:bg-[#2a303a]";
export const MINT_BG = "bg-[#2bb985] dark:bg-[#2ee6a6]";
export const MINT_TEXT = "text-[#1f8a62] dark:text-[#2ee6a6]";

const PILL_TONES: Record<TodayPillKey, string> = {
  attended: "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(46,230,166,0.14)] dark:text-[#9fe3bf]",
  upcoming: "bg-[#f1efea] text-[#4b525c] dark:bg-[#2a303a] dark:text-[#a8afba]",
  cancelled: "bg-[#f1efea] text-[#4b525c] dark:bg-[#2a303a] dark:text-[#a8afba]",
  unpaid: "bg-[#fdeaea] text-[#8c1d22] dark:bg-[rgba(229,72,77,0.18)] dark:text-[#f5b3b5]",
  mark_attendance:
    "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
  no_show: "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
};

export const pillClass = (key: TodayPillKey) =>
  cn(
    "inline-flex h-6 shrink-0 items-center rounded-full px-[9px] text-xs font-bold whitespace-nowrap",
    PILL_TONES[key],
  );

export const ATTENTION_TILE: Record<AttentionTone, string> = {
  red: "bg-[#fdeaea] text-[#c0262d] dark:bg-[rgba(229,72,77,0.18)] dark:text-[#f5b3b5]",
  amber: "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
  blue: "bg-[#e8edfd] text-[#3651b8] dark:bg-[rgba(99,135,255,0.18)] dark:text-[#b4c4ff]",
  grey: "bg-[#f1efea] text-[#4b525c] dark:bg-[#2a303a] dark:text-[#a8afba]",
};

export const SPLIT_COLOURS: Record<SplitColour, string> = {
  mint: MINT_BG,
  blue: "bg-[#4f7fd6] dark:bg-[#7aa7ff]",
  amber: "bg-[#e99239]",
  purple: "bg-[#8b6fd6]",
  grey: "bg-[#9aa1ad]",
};

/** Percentage of a share, whole numbers ("62%"); "<1%" for a sliver. */
export function shareLabel(share: number): string {
  if (share > 0 && share < 0.005) return "<1%";
  return `${Math.round(share * 100)}%`;
}

export function SplitBar({
  segments,
  label,
}: {
  segments: { key: string; share: number; className: string }[];
  label: string;
}) {
  return (
    <div aria-hidden title={label} className="flex h-3 w-full gap-0.5 overflow-hidden rounded-md">
      {segments.length === 0 ? (
        <div className={cn("h-full w-full rounded-md", TRACK)} />
      ) : (
        segments.map((s) => (
          <div
            key={s.key}
            className={cn("h-full first:rounded-l-md last:rounded-r-md", s.className)}
            style={{ width: `${Math.max(s.share * 100, 1)}%` }}
          />
        ))
      )}
    </div>
  );
}

export function SplitRow({
  swatch,
  label,
  note,
  value,
  share,
  sub,
}: {
  swatch: string;
  label: string;
  note?: string;
  value: string;
  share: string;
  sub?: ReactNode;
}) {
  return (
    <li className="border-t border-border py-2.5 first:border-t-0">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", swatch)} />
        <span className="min-w-0 truncate text-sm font-semibold">
          {label}
          {note ? (
            <span className="text-[12.5px] font-normal text-muted-foreground"> · {note}</span>
          ) : null}
        </span>
        <span className="ml-auto shrink-0 text-sm font-bold tabular-nums">{value}</span>
        <span className="w-11 shrink-0 text-right text-[12.5px] text-muted-foreground tabular-nums">
          {share}
        </span>
      </div>
      {sub ? <p className="mt-0.5 pl-5 text-xs text-muted-foreground">{sub}</p> : null}
    </li>
  );
}

export function FactTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-secondary px-3 py-2.5">
      <p className="truncate text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-extrabold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
