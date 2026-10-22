import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Mail, MessageSquare, Smartphone } from "lucide-react";
import { formatInTz } from "@/lib/format";
import {
  messageHeadline,
  messageReasonLabel,
  messageStatusLabel,
  type MessageHistoryEntry,
} from "@/lib/message-history";
import { cn } from "@/lib/utils";

/**
 * One message in the booking history tab: what went, how, and — when it failed or fell
 * back from text to email — a short reason staff can act on. Never shows provider text.
 *
 * When the message carried an invoice (`invoice`), the whole row opens it: the link is
 * stretched over the row with a pseudo-element so a phone thumb lands anywhere.
 */
export function BookingMessageHistoryRow({
  entry,
  timezone,
  invoice = null,
  onOpenInvoice,
}: {
  entry: MessageHistoryEntry;
  timezone: string;
  /** The invoice this email carried, when it could be told; makes the row tappable. */
  invoice?: { id: string; number: string | null } | null;
  /** Called when the invoice link is followed — the drawer uses it to close itself. */
  onOpenInvoice?: () => void;
}) {
  const reason = messageReasonLabel(entry);
  const tone =
    entry.status === "failed"
      ? "bg-destructive/10 text-destructive"
      : entry.status === "fallback"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  const Icon =
    entry.status === "failed"
      ? AlertTriangle
      : entry.channel === "sms"
        ? Smartphone
        : entry.channel === "email"
          ? Mail
          : MessageSquare;

  return (
    <li
      className={cn(
        "flex gap-3 border-b py-3 last:border-0",
        invoice &&
          "relative -mx-2 rounded-lg px-2 transition-colors hover:bg-secondary/60 has-[a:focus-visible]:bg-secondary/60 active:bg-secondary",
      )}
      data-testid="booking-message-row"
    >
      <div
        className={cn(
          "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full",
          entry.status === "failed" ? "bg-destructive/10" : "bg-muted",
        )}
        aria-hidden
      >
        <Icon
          className={cn(
            "size-3",
            entry.status === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{messageHeadline(entry)}</p>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
              tone,
            )}
          >
            {messageStatusLabel(entry)}
          </span>
        </div>
        {reason ? (
          <p
            className={cn(
              "mt-1 text-xs",
              entry.status === "failed" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {reason}
          </p>
        ) : null}
        {invoice ? (
          <Link
            to="/invoices/$invoiceId"
            params={{ invoiceId: invoice.id }}
            onClick={onOpenInvoice}
            aria-label={`Open invoice ${invoice.number ?? ""}`.trim()}
            data-testid="booking-message-invoice-link"
            className="mt-1 inline-block text-xs font-medium text-primary outline-none after:absolute after:inset-0 after:content-['']"
          >
            {invoice.number ? `Open invoice ${invoice.number}` : "Open invoice"}
          </Link>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          System
          {entry.occurredAt
            ? ` · ${formatInTz(entry.occurredAt, timezone, { dateStyle: "medium", timeStyle: "short" })}`
            : ""}
        </p>
      </div>
      {invoice ? (
        <ChevronRight
          className="mt-1 size-4 shrink-0 self-start text-muted-foreground"
          aria-hidden
        />
      ) : null}
    </li>
  );
}
