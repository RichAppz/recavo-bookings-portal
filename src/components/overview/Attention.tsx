import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Hourglass,
  ListChecks,
  MessageSquareText,
  Package,
  Sparkles,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  attentionSummary,
  attentionTotal,
  type AttentionItem,
  type AttentionKind,
} from "@/lib/overview";
import { cn } from "@/lib/utils";
import { ATTENTION_TILE, CardError, CardTitle, MINT_TEXT, OvCard, RowsGhost } from "./shared";

const MAX_ROWS = 5;

const ICONS: Record<AttentionKind, ReactNode> = {
  payments: <span className="text-sm font-extrabold">£</span>,
  attendance: <Check className="size-4" strokeWidth={3} />,
  package_requests: <Package className="size-4" />,
  add_ons: <Sparkles className="size-4" />,
  waitlist: <Hourglass className="size-4" />,
  sms_low: <MessageSquareText className="size-4" />,
  setup: <ListChecks className="size-4" />,
};

export type WorthALook = { key: string; label: string; to: "/packages" | "/messages" | "/team" };

function CountPill({ total }: { total: number }) {
  return (
    <span
      aria-label={`${total} to do`}
      className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#e99239] px-1.5 text-xs font-extrabold text-white tabular-nums"
    >
      {total}
    </span>
  );
}

function Rows({
  items,
  onSelect,
}: {
  items: AttentionItem[];
  onSelect: (item: AttentionItem) => void;
}) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.kind}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="flex min-h-11 w-full cursor-pointer items-center gap-3 border-t border-border px-[18px] py-[11px] text-left transition-colors hover:bg-secondary/60"
          >
            <span
              aria-hidden
              className={cn(
                "flex size-[34px] shrink-0 items-center justify-center rounded-[10px]",
                ATTENTION_TILE[item.tone],
              )}
            >
              {ICONS[item.kind]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{item.title}</span>
              <span className="block truncate text-[12.5px] text-muted-foreground">
                {item.detail}
              </span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function WorthLinks({ links }: { links: WorthALook[] }) {
  if (links.length === 0) return null;
  return (
    <div className="border-t border-border px-[18px] py-3">
      <p className="text-xs font-semibold text-muted-foreground">Also worth a look</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {links.map((l) => (
          <li key={l.key}>
            <Link
              to={l.to}
              className="inline-flex min-h-8 items-center text-[13px] font-semibold underline-offset-2 hover:underline"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CaughtUp() {
  return (
    <div className="flex items-center gap-3 border-t border-border px-[18px] py-5">
      <span
        aria-hidden
        className={cn(
          "flex size-[34px] items-center justify-center rounded-full bg-[#e3f5ec] dark:bg-[rgba(46,230,166,0.14)]",
          MINT_TEXT,
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
      <p className="text-sm font-bold">You're all caught up</p>
    </div>
  );
}

export function AttentionCard({
  items,
  loading,
  error,
  onRetry,
  onSelect,
  worth,
}: {
  items: AttentionItem[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onSelect: (item: AttentionItem) => void;
  worth: WorthALook[];
}) {
  const [expanded, setExpanded] = useState(false);
  const total = attentionTotal(items);
  const shown = expanded ? items : items.slice(0, MAX_ROWS);
  const more = items.length - shown.length;
  return (
    <OvCard label="Needs your attention" className="overflow-hidden">
      <div className="flex items-center gap-2 px-[18px] pt-4 pb-3">
        <CardTitle>Needs your attention</CardTitle>
        {total > 0 ? <CountPill total={total} /> : null}
      </div>
      {loading && items.length === 0 ? (
        <RowsGhost rows={3} />
      ) : error && items.length === 0 ? (
        <CardError onRetry={onRetry} />
      ) : items.length === 0 ? (
        <CaughtUp />
      ) : (
        <>
          <Rows items={shown} onSelect={onSelect} />
          {more > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex h-11 w-full cursor-pointer items-center justify-center border-t border-border text-sm font-bold hover:bg-secondary/60"
            >
              Show {more} more
            </button>
          ) : null}
        </>
      )}
      <WorthLinks links={worth} />
    </OvCard>
  );
}

/** Phone: one amber row that opens the whole list full screen; hidden when there is nothing. */
export function AttentionStrip({
  items,
  onSelect,
  worth,
}: {
  items: AttentionItem[];
  onSelect: (item: AttentionItem) => void;
  worth: WorthALook[];
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const total = attentionTotal(items);
  // One thing to do: show it and go straight there, rather than a list of one.
  const only = items.length === 1 ? items[0]! : null;
  return (
    <>
      <button
        type="button"
        onClick={() => (only ? onSelect(only) : setOpen(true))}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl border border-[#f3d6b5] bg-[#fdf4ea] px-3.5 py-3 text-left transition-colors active:bg-[#fbead6] dark:border-[rgba(233,146,57,0.32)] dark:bg-[rgba(233,146,57,0.10)] dark:active:bg-[rgba(233,146,57,0.16)]"
      >
        {only ? (
          <span
            aria-hidden
            className={cn(
              "flex size-[38px] shrink-0 items-center justify-center rounded-[11px]",
              ATTENTION_TILE[only.tone],
            )}
          >
            {ICONS[only.kind]}
          </span>
        ) : (
          <span
            aria-hidden
            className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[#e99239] text-[15px] font-extrabold text-white tabular-nums"
          >
            {total}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold">
            {only ? only.title : `${total} things need you`}
          </span>
          <span className="block truncate text-[12.5px] text-muted-foreground">
            {only ? only.detail : attentionSummary(items)}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="top-sheet-peek flex max-h-none flex-col gap-0 rounded-t-3xl p-0"
        >
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
          <SheetHeader className="shrink-0 px-[18px] pt-5 pb-3 pr-16 text-left">
            <SheetTitle className="flex items-center gap-2">
              Needs your attention <CountPill total={total} />
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Rows
              items={items}
              onSelect={(item) => {
                setOpen(false);
                onSelect(item);
              }}
            />
            <WorthLinks links={worth} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
