import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useConnectLoginLink, usePaymentReceipt } from "@/lib/api/hooks";
import { useAcceptDispute, useSendDisputeEvidence } from "@/lib/api/payments-activity";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { formatMoney } from "@/lib/format";
import {
  METHOD_LABELS,
  clientName,
  dayLabel,
  disputeIsOpen,
  disputeReasonLabel,
  refundReasonLabel,
  refundableMinor,
  shortDate,
  timeLabel,
  type ActivityRow,
} from "@/lib/payments-page";
import { useIsPhone } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { FactLine, PaymentStatusPill, signedMoney } from "./PaymentBits";

function longStamp(iso: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
  return `${date}, ${timeLabel(iso, timeZone)}`;
}

function shortStamp(iso: string, timeZone: string): string {
  return `${shortDate(iso, timeZone)}, ${timeLabel(iso, timeZone)}`;
}

function cardWords(row: ActivityRow): string {
  const brand = row.card?.brand;
  const last4 = row.card?.last4;
  const pretty = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card";
  return last4 ? `${pretty} ending ${last4}` : `${pretty} online`;
}

type TimelineEntry = {
  key: string;
  tone: "green" | "red" | "grey" | "blue";
  title: string;
  lines: string[];
  amount?: string;
  amountTone?: "red";
};

function timeline(row: ActivityRow, timeZone: string): TimelineEntry[] {
  const money = (minor: number) => formatMoney(minor, row.currency);
  const out: TimelineEntry[] = [];
  const stamp = shortStamp(row.at, timeZone);
  if (row.status === "failed") {
    out.push({
      key: "failed",
      tone: "red",
      title: "Payment failed",
      lines: [[row.failureReason?.trim(), stamp].filter(Boolean).join(" · ")],
      amount: money(row.amountMinor),
    });
  } else if (row.status === "requires_action" || row.status === "processing") {
    out.push({
      key: "waiting",
      tone: "blue",
      title: row.status === "processing" ? "Processing" : "Waiting for the client",
      lines: [`${cardWords(row)} · ${stamp}`],
      amount: money(row.amountMinor),
    });
  } else if (row.status === "cancelled") {
    out.push({ key: "cancelled", tone: "grey", title: "Cancelled", lines: [stamp] });
  } else {
    let how: string;
    if (row.method === "card_online") how = `${cardWords(row)} · ${stamp}`;
    else if (row.method === "bank_transfer") {
      const by = row.recordedBy?.name ? ` by ${row.recordedBy.name}` : "";
      const ref = row.booking?.reference ? `, ref ${row.booking.reference}` : "";
      how = `Bank transfer · marked received${by}${ref}`;
    } else {
      const by = row.recordedBy?.name ? ` · recorded by ${row.recordedBy.name}` : "";
      how = `${METHOD_LABELS[row.method]}${by} · ${stamp}`;
    }
    out.push({
      key: "paid",
      tone: "green",
      title: row.method === "card_online" ? "Paid by card" : "Payment recorded",
      lines: [how, ...(row.note ? [row.note] : [])],
      amount: money(row.amountMinor),
    });
  }
  for (const r of [...row.refunds].sort((a, b) => a.at.localeCompare(b.at))) {
    const by = r.by?.name ? ` by ${r.by.name}` : "";
    const reason = refundReasonLabel(r.reasonCode);
    const manual = r.method !== "card_online";
    out.push({
      key: `refund-${r.id}`,
      tone: r.state === "failed" ? "red" : "grey",
      title:
        r.state === "failed"
          ? "Refund failed"
          : r.state === "pending"
            ? "Refund on its way"
            : manual
              ? `Refund recorded · ${METHOD_LABELS[r.method]}`
              : "Refunded",
      lines: [
        [`${shortDate(r.at, timeZone)}${by}`, reason].filter(Boolean).join(" · "),
        ...(r.note ? [r.note] : []),
      ],
      amount: signedMoney(r.amountMinor, row.currency, true),
      amountTone: r.state === "failed" ? undefined : "red",
    });
  }
  const d = row.dispute;
  if (d || row.status === "disputed") {
    out.push({
      key: "dispute",
      tone: "red",
      title: "Disputed by the client's bank",
      lines: [
        [disputeReasonLabel(d?.reason), d?.openedAt ? shortDate(d.openedAt, timeZone) : null]
          .filter(Boolean)
          .join(" · "),
      ],
      ...(d?.amountMinor ? { amount: signedMoney(d.amountMinor, row.currency, true) } : {}),
      amountTone: "red",
    });
    if (d?.evidenceSentAt) {
      out.push({
        key: "evidence",
        tone: "grey",
        title: "Booking details sent to Stripe",
        lines: [shortDate(d.evidenceSentAt, timeZone)],
      });
    }
    if (d?.acceptedAt) {
      out.push({
        key: "accepted",
        tone: "grey",
        title: "Dispute accepted",
        lines: [shortDate(d.acceptedAt, timeZone)],
      });
    }
    if (d?.status === "won" || d?.status === "lost") {
      out.push({
        key: "outcome",
        tone: d.status === "won" ? "green" : "red",
        title: d.status === "won" ? "Dispute won" : "Dispute lost",
        lines: d.closedAt ? [shortDate(d.closedAt, timeZone)] : [],
      });
    }
  }
  return out;
}

const DOT: Record<TimelineEntry["tone"], string> = {
  green: "bg-[#2fae6b]",
  red: "bg-destructive",
  grey: "bg-muted-foreground/50",
  blue: "bg-[#3651b8]",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function PaymentPanel({
  row,
  timeZone,
  loading,
  onClose,
  onRefund,
}: {
  row: ActivityRow | null;
  timeZone: string;
  /** The URL names a payment the list hasn't loaded (yet). */
  loading?: boolean;
  onClose: () => void;
  onRefund: (row: ActivityRow) => void;
}) {
  const phone = useIsPhone();
  const open = Boolean(row) || Boolean(loading);
  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent
        side="right"
        phonePresentation="side"
        className={cn("flex w-full flex-col gap-0 p-0", phone ? "max-w-none" : "sm:max-w-[480px]")}
      >
        {row ? (
          <PanelBody row={row} timeZone={timeZone} onRefund={onRefund} />
        ) : (
          <>
            <SheetTitle className="sr-only">Payment</SheetTitle>
            <SheetDescription className="p-6 text-sm text-muted-foreground">
              {loading ? "Loading payment…" : "This payment isn't in the chosen period."}
            </SheetDescription>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  row,
  timeZone,
  onRefund,
}: {
  row: ActivityRow;
  timeZone: string;
  onRefund: (row: ActivityRow) => void;
}) {
  const tenant = useTenant();
  const money = (minor: number) => formatMoney(minor, row.currency);
  const disputed = row.status === "disputed" || Boolean(row.dispute);
  const openDispute = disputeIsOpen(row);
  const canRefund = tenant.can(PERMISSIONS.PAYMENT_REFUND);
  const left = refundableMinor(row);
  const fee = row.method === "card_online" ? row.feeMinor : null;
  const lostMinor =
    row.dispute?.status === "lost" ? (row.dispute.amountMinor ?? row.amountMinor) : 0;
  const keep = row.amountMinor - row.refundedMinor - (fee ?? 0) - lostMinor;

  return (
    <>
      <header className="border-b py-5 pr-14 pl-5">
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">
            Payment · {longStamp(row.at, timeZone)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <SheetTitle
              className={cn(
                "text-[30px] leading-tight font-extrabold tabular-nums",
                row.status === "failed" && "line-through",
                row.status === "refunded" && "text-muted-foreground",
              )}
            >
              {money(row.amountMinor)}
            </SheetTitle>
            <PaymentStatusPill status={row.status} />
          </div>
          <SheetDescription className="sr-only">
            {clientName(row)} · {METHOD_LABELS[row.method]}
          </SheetDescription>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {disputed ? <DisputeBody row={row} timeZone={timeZone} /> : null}

        <ClientCard row={row} timeZone={timeZone} />

        <Section title="What happened">
          <ol className="space-y-3">
            {timeline(row, timeZone).map((e) => (
              <li key={e.key} className="flex gap-3">
                <span
                  className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[e.tone])}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{e.title}</p>
                  {e.lines.filter(Boolean).map((l, i) => (
                    <p key={i} className="text-[13px] break-words text-muted-foreground">
                      {l}
                    </p>
                  ))}
                </div>
                {e.amount ? (
                  <span
                    className={cn(
                      "shrink-0 text-sm font-bold tabular-nums",
                      e.amountTone === "red" && "text-destructive",
                    )}
                  >
                    {e.amount}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>

        {row.status !== "failed" && row.status !== "cancelled" ? (
          <Section title="Money">
            <dl>
              <FactLine label="Paid">{money(row.amountMinor)}</FactLine>
              {row.refundedMinor > 0 ? (
                <FactLine label="Refunded">
                  <span className="text-destructive">
                    {signedMoney(row.refundedMinor, row.currency, true)}
                  </span>
                </FactLine>
              ) : null}
              {row.method === "card_online" ? (
                <FactLine label="Stripe fee">
                  {fee == null ? (
                    <span className="text-muted-foreground">Not known yet</span>
                  ) : (
                    signedMoney(fee, row.currency, true)
                  )}
                </FactLine>
              ) : null}
              <FactLine label="You keep" strong>
                {money(Math.max(0, keep))}
              </FactLine>
            </dl>
          </Section>
        ) : null}

        <ReceiptSection row={row} />
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5">
        {openDispute ? (
          <DisputeActions row={row} />
        ) : (
          <>
            {canRefund && left > 0 ? (
              <Button variant="outline" className="h-11 sm:h-10" onClick={() => onRefund(row)}>
                Refund
              </Button>
            ) : null}
            <OpenTarget row={row} primary />
          </>
        )}
      </footer>
    </>
  );
}

function OpenTarget({ row, primary }: { row: ActivityRow; primary?: boolean }) {
  const cls = primary ? "h-11 sm:h-10" : undefined;
  if (row.booking) {
    return (
      <Button asChild variant={primary ? "default" : "outline"} className={cls}>
        <Link to="/bookings" search={{ booking: row.booking.id }}>
          Open booking
        </Link>
      </Button>
    );
  }
  if (row.package) {
    return (
      <Button asChild variant={primary ? "default" : "outline"} className={cls}>
        <Link to="/packages">Open package</Link>
      </Button>
    );
  }
  return null;
}

function ClientCard({ row, timeZone }: { row: ActivityRow; timeZone: string }) {
  const name = clientName(row);
  let what: string | null = null;
  if (row.booking) {
    const tz = row.booking.timezone || timeZone;
    what = `${row.booking.serviceName} · ${dayLabel(row.booking.start, tz, new Date())}`;
  } else if (row.package) {
    what = `Package: ${row.package.name} · bought ${shortDate(row.at, timeZone)}`;
  }
  const inner = (
    <>
      <PersonAvatar name={name} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold">{name}</p>
        {what ? <p className="truncate text-[13px] text-muted-foreground">{what}</p> : null}
      </div>
    </>
  );
  const target = row.booking ? (
    <Link
      to="/bookings"
      search={{ booking: row.booking.id }}
      className="inline-flex h-11 shrink-0 items-center gap-0.5 text-sm font-semibold hover:underline"
    >
      Open <ChevronRight className="size-4" />
    </Link>
  ) : row.customer ? (
    <Link
      to="/clients/$clientId"
      params={{ clientId: row.customer.id }}
      className="inline-flex h-11 shrink-0 items-center gap-0.5 text-sm font-semibold hover:underline"
    >
      Open <ChevronRight className="size-4" />
    </Link>
  ) : null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border p-3">
      {inner}
      {target}
    </div>
  );
}

function ReceiptSection({ row }: { row: ActivityRow }) {
  const card = row.source === "card" && row.paymentId;
  const receipt = usePaymentReceipt(card ? (row.paymentId ?? undefined) : undefined);
  if (row.status === "failed" || row.status === "cancelled") return null;
  const number = receipt.data?.receiptNumber ?? row.receiptNumber;
  const url = receipt.data?.receiptUrl ?? row.receiptUrl;
  if (!number && !url && !receipt.data?.legalName) return null;
  return (
    <Section title="Receipt">
      <dl>
        {number ? <FactLine label="Receipt no.">{number}</FactLine> : null}
        {receipt.data?.legalName ? (
          <FactLine label="Seller">{receipt.data.legalName}</FactLine>
        ) : null}
        {receipt.data?.vatNumber ? <FactLine label="VAT">{receipt.data.vatNumber}</FactLine> : null}
      </dl>
      {url ? (
        <Button asChild variant="outline" size="sm" className="h-10">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" /> Open receipt
          </a>
        </Button>
      ) : null}
    </Section>
  );
}

function DisputeBody({ row, timeZone }: { row: ActivityRow; timeZone: string }) {
  const d = row.dispute;
  const name = clientName(row);
  const amount = d?.amountMinor ?? row.amountMinor;
  const fee = d?.feeMinor ?? null;
  const money = (minor: number) => formatMoney(minor, row.currency);
  const compact = (minor: number) => formatMoney(minor, row.currency, { compact: true });

  if (!disputeIsOpen(row)) {
    const when = d?.closedAt ? shortDate(d.closedAt, timeZone) : null;
    if (d?.status === "won") {
      return (
        <div className="rounded-2xl border border-[#2fae6b]/30 bg-[#e3f5ec] p-4 text-sm text-[#1f6b41] dark:bg-[rgba(110,231,176,0.12)] dark:text-[#9fe3bf]">
          <strong>Won{when ? ` on ${when}` : ""}.</strong> The {compact(amount)} is back in your
          balance.
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <strong>
          {d?.acceptedAt ? "Accepted" : "Lost"}
          {when ? ` on ${when}` : ""}.
        </strong>{" "}
        {name} keeps the {compact(amount)}.
      </div>
    );
  }

  const due = d?.dueBy ? new Date(d.dueBy) : null;
  const daysLeft = due ? Math.max(0, Math.ceil((due.getTime() - Date.now()) / 86_400_000)) : null;
  const dueText = due
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
      })
        .format(due)
        .replace(",", "")
    : null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-bold text-destructive">
          <AlertTriangle className="size-4" aria-hidden />
          {name}'s bank is disputing this payment.
        </p>
        <p className="mt-1.5 text-foreground/90">
          Reason given: <strong>"{disputeReasonLabel(d?.reason)}"</strong>. Stripe has taken{" "}
          {money(amount)}
          {fee ? ` plus a ${money(fee)} dispute fee` : ""} from your balance while it's looked at.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">Respond by</p>
          <p className="text-base font-extrabold text-destructive">{dueText ?? "Check Stripe"}</p>
          {daysLeft != null ? (
            <p className="text-xs text-muted-foreground">
              {daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">At risk</p>
          <p className="text-base font-extrabold tabular-nums">{money(amount + (fee ?? 0))}</p>
          <p className="text-xs text-muted-foreground">
            {fee ? `Payment + ${compact(fee)} fee` : "The payment"}
          </p>
        </div>
      </div>
      <Section title="What to do">
        <ol className="space-y-3">
          {[
            [
              "Gather your proof",
              `Booking confirmation, the before and after photos, and any messages with ${name}.`,
            ],
            [
              `Respond in Stripe${dueText ? ` by ${dueText}` : ""}`,
              "We've added the booking details for you. Add the photos and a short note.",
            ],
            [
              "The bank decides",
              `Usually within 60 to 75 days. If you win, the ${compact(amount)} comes back.`,
            ],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="text-[13px] text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function DisputeActions({ row }: { row: ActivityRow }) {
  const tenant = useTenant();
  const accept = useAcceptDispute();
  const evidence = useSendDisputeEvidence();
  const loginLink = useConnectLoginLink();
  const [confirm, setConfirm] = useState(false);
  const paymentId = row.paymentId ?? row.id;
  const amount = formatMoney(row.dispute?.amountMinor ?? row.amountMinor, row.currency, {
    compact: true,
  });
  const name = clientName(row);
  if (!tenant.can(PERMISSIONS.PAYMENT_REFUND)) {
    return <OpenTarget row={row} primary />;
  }

  const respond = async () => {
    // Open the tab now so the browser treats it as part of the click.
    const tab = window.open("", "_blank");
    try {
      await evidence.mutateAsync(paymentId);
    } catch {
      toast.error("We couldn't add the booking details. Add them in Stripe.");
    }
    try {
      const url = await loginLink.mutateAsync();
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      tab?.close();
    }
  };

  return (
    <>
      <OpenTarget row={row} />
      <Button variant="outline" className="h-11 sm:h-10" onClick={() => setConfirm(true)}>
        Accept the dispute
      </Button>
      {tenant.can(PERMISSIONS.CONNECT_MANAGE) ? (
        <Button
          className="h-11 sm:h-10"
          disabled={evidence.isPending || loginLink.isPending}
          onClick={() => void respond()}
        >
          <ExternalLink className="size-4" /> Respond in Stripe
        </Button>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Accept and let {name} keep the {amount}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The dispute closes and the money stays with {name}. Stripe keeps the dispute fee. This
              can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep disputing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={accept.isPending}
              onClick={async (e) => {
                e.preventDefault();
                await accept.mutateAsync(paymentId);
                toast.success("Dispute accepted");
                setConfirm(false);
              }}
            >
              Accept the dispute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
