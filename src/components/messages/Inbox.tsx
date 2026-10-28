import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Check, Mail, Search, X } from "lucide-react";
import type { InboxCounts, InboxRow, InboxTab } from "@/lib/api/messages";
import { inboxPreview, inboxRowLabel, inboxTime, rowName } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { ClientAvatar, NeedsReplyTag } from "./parts";

const TABS: { value: InboxTab; label: string; count: (c: InboxCounts) => number | null }[] = [
  { value: "all", label: "All", count: () => null },
  { value: "unread", label: "Unread", count: (c) => c.unread },
  { value: "needs_reply", label: "Needs reply", count: (c) => c.needsReply },
];

export function InboxSearch({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">Search clients or messages</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search clients or messages"
        className="h-10 w-full rounded-[10px] border border-input bg-field pr-9 pl-9 text-base outline-none md:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </label>
  );
}

export function InboxTabs({
  tab,
  onTab,
  counts,
  controls,
}: {
  tab: InboxTab;
  onTab: (t: InboxTab) => void;
  counts: InboxCounts | null;
  controls: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="tablist" aria-label="Conversations" className="flex gap-1.5">
      {TABS.map((t, i) => {
        const selected = t.value === tab;
        const n = counts ? t.count(counts) : null;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`inbox-tab-${t.value}`}
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTab(t.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
              onTab(TABS[next]!.value);
              refs.current[next]?.focus();
            }}
            className={cn(
              "inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition-colors",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground/75 hover:text-foreground",
            )}
          >
            {t.label}
            {n ? (
              <span
                className={cn(
                  "min-w-[18px] rounded-full px-1.5 text-[11px] leading-[18px] font-extrabold",
                  selected ? "bg-primary-foreground/20" : "bg-background",
                )}
              >
                {n}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function InboxList({
  rows,
  tab,
  selectedId,
  onSelect,
  now,
  tz,
  hasNextPage,
  fetchingNext,
  onLoadMore,
  empty,
  phone,
  onMarkDone,
  onMarkUnread,
  id,
}: {
  rows: InboxRow[];
  tab: InboxTab;
  selectedId: string | null;
  onSelect: (row: InboxRow) => void;
  now: Date;
  tz: string;
  hasNextPage: boolean;
  fetchingNext: boolean;
  onLoadMore: () => void;
  empty: ReactNode;
  phone: boolean;
  onMarkDone: (row: InboxRow) => void;
  onMarkUnread: (row: InboxRow) => void;
  id: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !fetchingNext) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, fetchingNext, onLoadMore]);

  return (
    <div id={id} role="tabpanel" aria-labelledby={`inbox-tab-${tab}`}>
      {rows.length === 0 ? (
        empty
      ) : (
        <ul>
          {rows.map((row) => {
            const item = (
              <InboxRowButton
                row={row}
                tab={tab}
                selected={row.conversationId === selectedId}
                onSelect={() => onSelect(row)}
                now={now}
                tz={tz}
              />
            );
            return (
              <li key={row.conversationId} className="border-b last:border-b-0">
                {phone ? (
                  <SwipeRow
                    actions={[
                      {
                        label: "Mark as done",
                        icon: <Check className="size-4" />,
                        className: "bg-[#1f6b41] text-white",
                        onClick: () => onMarkDone(row),
                      },
                      {
                        label: "Mark as unread",
                        icon: <Mail className="size-4" />,
                        className: "bg-primary text-primary-foreground",
                        onClick: () => onMarkUnread(row),
                      },
                    ]}
                  >
                    {item}
                  </SwipeRow>
                ) : (
                  item
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hasNextPage ? (
        <div ref={sentinel} className="py-3 text-center text-xs text-muted-foreground">
          {fetchingNext ? "Loading more…" : ""}
        </div>
      ) : null}
    </div>
  );
}

function InboxRowButton({
  row,
  tab,
  selected,
  onSelect,
  now,
  tz,
}: {
  row: InboxRow;
  tab: InboxTab;
  selected: boolean;
  onSelect: () => void;
  now: Date;
  tz: string;
}) {
  const name = rowName(row);
  const time = inboxTime(row.lastMessage?.at ?? row.lastActivityAt, now, tz);
  const preview = inboxPreview(row);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={inboxRowLabel({
        name,
        unread: row.unread,
        needsReply: row.needsReply,
        time,
        preview,
      })}
      className={cn(
        "relative flex w-full cursor-pointer items-start gap-3 bg-panel px-3.5 py-3 text-left transition-colors",
        selected ? "bg-accent" : "hover:bg-secondary/70",
      )}
    >
      {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-mint" /> : null}
      <ClientAvatar id={row.customer.id} name={name} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-[14.5px]",
              row.unread ? "font-extrabold" : "font-semibold",
            )}
          >
            {name}
          </span>
          <span
            className={cn(
              "shrink-0 text-[12px]",
              row.unread ? "font-bold text-[#1f6b41] dark:text-[#9fe3bf]" : "text-muted-foreground",
            )}
          >
            {time}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              row.unread ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {preview || (row.blocked ? "Blocked" : "No messages yet")}
          </span>
          {row.unread ? (
            <span aria-hidden className="size-[9px] shrink-0 rounded-full bg-mint" />
          ) : null}
        </span>
        {row.needsReply && tab === "all" ? <NeedsReplyTag className="mt-1.5" /> : null}
      </span>
    </button>
  );
}

type SwipeAction = {
  label: string;
  icon: ReactNode;
  className: string;
  onClick: () => void;
};

const ACTION_WIDTH = 84;

/** Swipe left to reveal row actions (phone). Buttons stay reachable without swiping via focus. */
function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: ReactNode }) {
  const width = ACTION_WIDTH * actions.length;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(
    null,
  );

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]!;
    start.current = { x: t.clientX, y: t.clientY, base: offset, horizontal: null };
    setDragging(true);
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0]!;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (s.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      s.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!s.horizontal) return;
    setOffset(Math.max(-width, Math.min(0, s.base + dx)));
  };
  const onTouchEnd = () => {
    setDragging(false);
    start.current = null;
    setOffset((o) => (o < -width / 2 ? -width : 0));
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex" style={{ width }}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={offset === 0 ? -1 : 0}
            aria-hidden={offset === 0}
            onClick={() => {
              setOffset(0);
              a.onClick();
            }}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11.5px] font-bold",
              a.className,
            )}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={(e) => {
          if (offset !== 0) {
            e.preventDefault();
            e.stopPropagation();
            setOffset(0);
          }
        }}
        className={cn("relative", dragging ? "" : "transition-transform duration-200")}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}

export function InboxEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center text-[13.5px] text-muted-foreground">
      <p>{children}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
