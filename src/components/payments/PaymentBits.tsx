import { Banknote, CreditCard, Landmark, MoreHorizontal, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import {
  METHOD_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  type PaymentMethod,
  type PaymentStatus,
  type StatusTone,
} from "@/lib/payments-page";
import { cn } from "@/lib/utils";

const METHOD_TILE: Record<PaymentMethod, string> = {
  card_online: "bg-[#e8edfd] text-[#3651b8] dark:bg-[rgba(99,135,255,0.16)] dark:text-[#b4c4ff]",
  card_manual: "bg-[#f3e8fd] text-[#6b3fa0] dark:bg-[rgba(168,120,255,0.16)] dark:text-[#d6c0ff]",
  cash: "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.16)] dark:text-[#9fe3bf]",
  bank_transfer: "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.16)] dark:text-[#f3b878]",
  other: "bg-secondary text-secondary-foreground",
};

const METHOD_ICON: Record<PaymentMethod, typeof CreditCard> = {
  card_online: CreditCard,
  card_manual: Smartphone,
  cash: Banknote,
  bank_transfer: Landmark,
  other: MoreHorizontal,
};

/** The tinted method square: 24px in lists, 36px on phone rows. */
export function MethodTile({ method, size = "sm" }: { method: PaymentMethod; size?: "sm" | "lg" }) {
  const Icon = METHOD_ICON[method];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        size === "lg" ? "size-9" : "size-6",
        METHOD_TILE[method],
      )}
    >
      <Icon className={size === "lg" ? "size-[18px]" : "size-3.5"} />
    </span>
  );
}

export function MethodLabel({ method }: { method: PaymentMethod }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold">
      <MethodTile method={method} />
      {METHOD_LABELS[method]}
    </span>
  );
}

const PILL: Record<StatusTone, string> = {
  green: "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.14)] dark:text-[#9fe3bf]",
  blue: "bg-[#e8edfd] text-[#3651b8] dark:bg-[rgba(99,135,255,0.16)] dark:text-[#b4c4ff]",
  red: "bg-[#fdeaea] text-[#8c1d22] dark:bg-[rgba(229,72,77,0.18)] dark:text-[#f5b3b5]",
  grey: "bg-secondary text-secondary-foreground",
};

export function PaymentStatusPill({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-extrabold whitespace-nowrap",
        PILL[STATUS_TONES[status]],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Money with a real minus sign for amounts going out: "−£40.00". */
export function signedMoney(minor: number, currency: string, out = false): string {
  const text = formatMoney(Math.abs(minor), currency);
  return out || minor < 0 ? `\u2212${text}` : text;
}

/** A label/value line in the panel's Money and Receipt blocks. */
export function FactLine({
  label,
  children,
  strong,
}: {
  label: ReactNode;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5 text-sm",
        strong && "border-t pt-2.5 text-[15px] font-extrabold",
      )}
    >
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
