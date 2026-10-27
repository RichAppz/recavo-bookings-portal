import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/client-profile";

/** Six avatar tints, picked per client with `avatarTintIndex` (shared with the Clients list). */
export const AVATAR_TINTS = [
  "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.16)] dark:text-[#9fe3bf]",
  "bg-[#e8edfd] text-[#3651b8] dark:bg-[rgba(99,135,255,0.16)] dark:text-[#b4c4ff]",
  "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.16)] dark:text-[#f3b878]",
  "bg-[#f3e8fd] text-[#6b3fa0] dark:bg-[rgba(168,120,255,0.16)] dark:text-[#d6c0ff]",
  "bg-[#fdeaea] text-[#8c1d22] dark:bg-[rgba(229,72,77,0.16)] dark:text-[#f5b3b5]",
  "bg-[#eef0f3] text-[#3c4757] dark:bg-[rgba(148,163,184,0.16)] dark:text-[#c4cbd6]",
];

export const TONE_PILL: Record<Tone, string> = {
  green: "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.14)] dark:text-[#9fe3bf]",
  blue: "bg-[#e8edfd] text-[#3651b8] dark:bg-[rgba(99,135,255,0.16)] dark:text-[#b4c4ff]",
  amber: "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
  red: "bg-[#fdeaea] text-[#8c1d22] dark:bg-[rgba(229,72,77,0.18)] dark:text-[#f5b3b5]",
  grey: "bg-secondary text-secondary-foreground",
};

export const TONE_TEXT: Record<Tone, string> = {
  green: "text-[#1f6b41] dark:text-[#9fe3bf]",
  blue: "text-[#3651b8] dark:text-[#b4c4ff]",
  amber: "text-[#8a5300] dark:text-[#f3b878]",
  red: "text-[#8c1d22] dark:text-[#f5b3b5]",
  grey: "text-muted-foreground",
};

export function TonePill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-extrabold whitespace-nowrap",
        TONE_PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Card head link: 13/700 muted ink, ends "›". */
export function CardLink({
  onClick,
  children,
  label,
}: {
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 cursor-pointer text-[13px] font-bold text-foreground/70 hover:text-foreground"
    >
      {children} ›
    </button>
  );
}

/** 16px radius, 1px line, panel fill; head padding 14/16/10 with a 15.5/800 title. */
export function ProfileCard({
  title,
  note,
  aside,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  note?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-24 rounded-2xl border bg-card", className)}>
      {title ? (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
          <div className="min-w-0">
            <h2 className="text-[15.5px] leading-snug font-extrabold">{title}</h2>
            {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
          </div>
          {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A list row inside a ProfileCard: 11px 16px padding, a line on top. */
export const rowClass = "border-t px-4 py-[11px]";

export function DateTile({ weekday, date }: { weekday: string; date: string }) {
  return (
    <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary/70 leading-none">
      <span className="text-[11px] font-bold text-muted-foreground uppercase">{weekday}</span>
      <span className="mt-0.5 text-[17px] font-extrabold">{date}</span>
    </span>
  );
}

export function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground">
      {children}
    </span>
  );
}

export function CountBadge({ tone, children }: { tone: "amber" | "grey"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold",
        tone === "amber" ? "bg-[#e99239] text-white" : "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </span>
  );
}
