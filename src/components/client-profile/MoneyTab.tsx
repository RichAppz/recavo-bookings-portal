import { useEffect, useState, type ReactNode } from "react";
import { Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { ClientOfferLinksCard } from "@/components/ClientOfferLinksCard";
import { InvoicesTable } from "@/components/InvoicesTable";
import { TableGhost } from "@/components/ghost";
import {
  CardLink,
  ProfileCard,
  rowClass,
  TONE_TEXT,
  TonePill,
} from "@/components/client-profile/parts";
import { EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAdjustEntitlement,
  useEntitlementLedger,
  usePackageLinks,
  useSendPaymentReminder,
} from "@/lib/api/hooks";
import { useInvoices } from "@/lib/api/invoices";
import type { EntitlementView } from "@/lib/api/types";
import {
  ADJUST_REASON_LABELS,
  adjustReasonCode,
  entitlementIsExpired,
  ledgerEntryView,
  longDate,
  shortDate,
  signedUnits,
  type AdjustReason,
  type CreditsSummary,
  type MoneyRow,
} from "@/lib/client-profile";
import { cn } from "@/lib/utils";

function Tile({
  label,
  value,
  sub,
  subTone,
  action,
}: {
  label: string;
  value: string;
  sub: string;
  subTone?: "green" | "red" | "amber";
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3.5">
      <p className="text-[12.5px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[22px] font-extrabold">{value}</p>
      <p className={cn("text-xs", subTone ? TONE_TEXT[subTone] : "text-muted-foreground")}>{sub}</p>
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}

export function MoneyTiles({
  spent,
  refunded,
  owed,
  owedBookingIds,
  oldestOwedAt,
  credits,
  timezone,
  readOnly,
}: {
  spent: string;
  refunded: string | null;
  owed: string | null;
  owedBookingIds: readonly string[];
  oldestOwedAt: string | null;
  credits: CreditsSummary;
  timezone: string;
  readOnly?: boolean;
}) {
  const remind = useSendPaymentReminder();
  const [sending, setSending] = useState(false);
  const sendLinks = async () => {
    setSending(true);
    let sent = 0;
    try {
      for (const bookingId of owedBookingIds) {
        await remind.mutateAsync({ bookingId });
        sent += 1;
      }
      toast.success(sent === 1 ? "Payment link sent" : `Payment links sent for ${sent} bookings`);
    } catch (err) {
      toast.error(sent > 0 ? `Sent ${sent}, then one failed` : "Couldn't send the payment link", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSending(false);
    }
  };
  const n = owedBookingIds.length;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile
        label="Spent"
        value={spent}
        sub={refunded ? `Net of ${refunded} refunded` : "Nothing refunded"}
      />
      <Tile
        label="Owes"
        value={owed ?? "£0"}
        sub={
          owed
            ? `${n} booking${n === 1 ? "" : "s"}${oldestOwedAt ? ` · oldest ${shortDate(oldestOwedAt, timezone)}` : ""}`
            : "Nothing outstanding"
        }
        subTone={owed ? "red" : "green"}
        action={
          owed && !readOnly ? (
            <Button size="sm" variant="outline" disabled={sending} onClick={() => void sendLinks()}>
              <Send className="size-4" /> {sending ? "Sending…" : "Send payment link"}
            </Button>
          ) : null
        }
      />
      <Tile
        label="Credits"
        value={credits.left > 0 ? `${credits.left} left` : "None"}
        sub={
          credits.activePackages > 0
            ? `${credits.activePackages} package${credits.activePackages === 1 ? "" : "s"}${credits.soonestExpiry ? ` · expires ${longDate(credits.soonestExpiry, timezone)}` : ""}`
            : "No package"
        }
        subTone={credits.expiringSoon ? "amber" : undefined}
      />
    </div>
  );
}

export function PaymentsCard({
  rows,
  loading,
  timezone,
  money,
  onOpenBooking,
  isPhone,
}: {
  rows: readonly MoneyRow[];
  loading: boolean;
  timezone: string;
  money: (minor: number, currency: string) => string;
  onOpenBooking: (id: string) => void;
  isPhone: boolean;
}) {
  const [shown, setShown] = useState(10);
  const amount = (r: MoneyRow) =>
    r.amountMinor === null
      ? `${r.credits ?? 1} credit${(r.credits ?? 1) > 1 ? "s" : ""}`
      : r.amountMinor < 0
        ? `−${money(-r.amountMinor, r.currency)}`
        : money(r.amountMinor, r.currency);
  const visible = rows.slice(0, shown);
  const open = (r: MoneyRow) => (r.bookingId ? () => onOpenBooking(r.bookingId!) : undefined);

  return (
    <ProfileCard title="Payments" note="Card, cash, bank transfer and credits">
      {loading && rows.length === 0 ? (
        <TableGhost rows={4} />
      ) : rows.length === 0 ? (
        <p className={cn(rowClass, "py-6 text-center text-sm text-muted-foreground")}>
          No payments yet
        </p>
      ) : isPhone ? (
        <ul>
          {visible.map((r) => (
            <li key={r.id} className="border-t">
              <button
                type="button"
                onClick={open(r)}
                disabled={!r.bookingId}
                className="flex w-full items-start gap-3 px-4 py-3 text-left disabled:cursor-default"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.forLabel}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {shortDate(r.at, timezone)} · {r.method}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular-nums">{amount(r)}</span>
                  <TonePill tone={r.status.tone}>{r.status.label}</TonePill>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              {["Date", "For", "Method", "Amount", "Status", "Receipt"].map((h) => (
                <th
                  key={h}
                  className={cn(
                    "px-4 py-2 text-left font-semibold",
                    h === "Amount" && "text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const onClick = open(r);
              return (
                <tr
                  key={r.id}
                  onClick={onClick}
                  className={cn("border-t", onClick && "cursor-pointer hover:bg-secondary/40")}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap">{longDate(r.at, timezone)}</td>
                  <td className="px-4 py-2.5">{r.forLabel}</td>
                  <td className="px-4 py-2.5">
                    {r.method}
                    {r.providerRef ? (
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {r.providerRef}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{amount(r)}</td>
                  <td className="px-4 py-2.5">
                    <TonePill tone={r.status.tone}>{r.status.label}</TonePill>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.receiptUrl ? (
                      <a
                        href={r.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-foreground underline-offset-2 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > shown ? (
        <div className="border-t px-4 py-2.5 text-center">
          <Button variant="ghost" size="sm" onClick={() => setShown((s) => s + 10)}>
            Show more
          </Button>
        </div>
      ) : null}
    </ProfileCard>
  );
}

function EntitlementCard({
  view,
  packageName,
  timezone,
  nowMs,
  canAdjust,
  onAdjust,
}: {
  view: EntitlementView;
  packageName: string;
  timezone: string;
  nowMs: number;
  canAdjust: boolean;
  onAdjust: () => void;
}) {
  const ledger = useEntitlementLedger(view.entitlement.id);
  const [all, setAll] = useState(false);
  const expired = entitlementIsExpired(view.entitlement, nowMs);
  const entries = [...(ledger.data?.entries ?? [])].sort((a, b) =>
    b.occurredAt === a.occurredAt ? b.seq - a.seq : b.occurredAt.localeCompare(a.occurredAt),
  );
  const shown = all ? entries : entries.slice(0, 5);
  const available = view.balance.available;
  return (
    <li className={rowClass}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{packageName}</p>
        {expired ? (
          <TonePill tone="grey">
            {available > 0 ? `${available} unused, can't be booked` : "Used up"}
          </TonePill>
        ) : available > 0 ? (
          <TonePill tone="blue">{available} available</TonePill>
        ) : (
          <TonePill tone="grey">Used up</TonePill>
        )}
        {canAdjust ? (
          <Button variant="outline" size="sm" className="h-[30px]" onClick={onAdjust}>
            Adjust credits
          </Button>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {expired ? "Expired" : "Expires"} {longDate(view.entitlement.expiresAt, timezone)} · issued{" "}
        {view.entitlement.unitsIssued}
      </p>
      <ul className="mt-2 grid gap-1 rounded-xl bg-secondary/40 px-3 py-2">
        {ledger.isLoading ? (
          <li className="h-4 animate-pulse rounded bg-secondary" />
        ) : shown.length === 0 ? (
          <li className="text-xs text-muted-foreground">No ledger activity yet.</li>
        ) : (
          shown.map((e) => {
            const v = ledgerEntryView(e);
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  {v.label} · {shortDate(e.occurredAt, timezone)}
                </span>
                <span className="font-semibold tabular-nums">{signedUnits(v.signed)}</span>
              </li>
            );
          })
        )}
      </ul>
      {entries.length > 5 ? (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-1 cursor-pointer text-xs font-semibold text-foreground/70 hover:text-foreground"
        >
          {all ? "Show less" : `Show all ${entries.length}`}
        </button>
      ) : null}
    </li>
  );
}

export function AdjustCreditsDialog({
  view,
  packageName,
  nowMs,
  onOpenChange,
}: {
  view: EntitlementView | null;
  packageName: string;
  nowMs: number;
  onOpenChange: (open: boolean) => void;
}) {
  const adjust = useAdjustEntitlement();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState<AdjustReason | "">("");
  const [other, setOther] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const expired = view ? entitlementIsExpired(view.entitlement, nowMs) : false;
  const available = view?.balance.available ?? 0;

  const viewId = view?.entitlement.id;
  useEffect(() => {
    if (!viewId) return;
    setDirection(expired ? "remove" : "add");
    setAmount("1");
    setReason("");
    setOther("");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);

  const save = async () => {
    if (!view) return;
    const n = Number(amount);
    const next: Record<string, string> = {};
    if (!Number.isInteger(n) || n < 1) next.amount = "Enter a whole number, 1 or more.";
    else if (direction === "remove" && n > available) {
      next.amount = `Only ${available} available to remove.`;
    }
    if (direction === "add" && expired) next.direction = "This package has expired.";
    if (!reason) next.reason = "Pick a reason.";
    if (reason === "other" && !other.trim()) next.other = "Say what the reason is.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await adjust.mutateAsync({
      entitlementId: view.entitlement.id,
      signedUnits: direction === "add" ? n : -n,
      reasonCode: adjustReasonCode(direction, reason as AdjustReason),
      note: reason === "other" ? other.trim() : ADJUST_REASON_LABELS[reason as AdjustReason],
    });
    toast.success(`${n} credit${n === 1 ? "" : "s"} ${direction === "add" ? "added" : "removed"}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={view !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust credits</DialogTitle>
          <DialogDescription>
            {packageName} · {available} available. Saved to the ledger with your reason.
          </DialogDescription>
        </DialogHeader>
        <form
          id="adjust-credits"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-2">
            <p className="text-sm font-semibold" id="adjust-direction">
              Add or remove
            </p>
            <div
              role="radiogroup"
              aria-labelledby="adjust-direction"
              className="grid grid-cols-2 gap-2"
            >
              {(["add", "remove"] as const).map((d) => {
                const disabled = d === "add" && expired;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={direction === d}
                    disabled={disabled}
                    title={
                      disabled
                        ? "This package has expired. Add credits to a current package instead."
                        : undefined
                    }
                    onClick={() => setDirection(d)}
                    className={cn(
                      "h-10 cursor-pointer rounded-[10px] border text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                      direction === d
                        ? "border-ring bg-primary-soft text-foreground"
                        : "bg-background text-muted-foreground",
                    )}
                  >
                    {d === "add" ? "Add" : "Remove"}
                  </button>
                );
              })}
            </div>
            {errors.direction ? (
              <p className="text-xs text-destructive">{errors.direction}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adjust-amount">Credits</Label>
            <Input
              id="adjust-amount"
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="max-w-32"
            />
            {errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as AdjustReason)}>
              <SelectTrigger id="adjust-reason">
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ADJUST_REASON_LABELS) as AdjustReason[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ADJUST_REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.reason ? <p className="text-xs text-destructive">{errors.reason}</p> : null}
            {reason === "other" ? (
              <>
                <Input
                  value={other}
                  maxLength={200}
                  onChange={(e) => setOther(e.target.value)}
                  placeholder="What happened?"
                  aria-label="Reason"
                />
                {errors.other ? <p className="text-xs text-destructive">{errors.other}</p> : null}
              </>
            ) : null}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-credits" disabled={adjust.isPending}>
            {adjust.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PackagesCard({
  clientId,
  firstName,
  slug,
  credits,
  loading,
  error,
  packageName,
  timezone,
  nowMs,
  canAdjust,
  readOnly,
  onSellPackage,
}: {
  clientId: string;
  firstName: string;
  slug: string | null;
  credits: readonly EntitlementView[];
  loading: boolean;
  error: boolean;
  packageName: (packageId: string) => string;
  timezone: string;
  nowMs: number;
  canAdjust: boolean;
  readOnly: boolean;
  onSellPackage?: () => void;
}) {
  const [adjusting, setAdjusting] = useState<EntitlementView | null>(null);
  const [offersOpen, setOffersOpen] = useState(false);
  const links = usePackageLinks();
  const on = (links.data ?? []).filter((l) => l.customerIds.includes(clientId)).length;

  return (
    <ProfileCard
      title="Packages and credits"
      aside={
        onSellPackage && !readOnly ? (
          <Button size="sm" variant="outline" className="h-[30px]" onClick={onSellPackage}>
            <Plus className="size-4" /> Sell package
          </Button>
        ) : null
      }
    >
      {loading ? (
        <TableGhost rows={3} />
      ) : error ? (
        <p className={cn(rowClass, "text-sm text-muted-foreground")}>
          Couldn't load credits. Please try again shortly.
        </p>
      ) : credits.length === 0 ? (
        <p className={cn(rowClass, "text-sm text-muted-foreground")}>
          No packages. Sell a package to add credits to this account.
        </p>
      ) : (
        <ul>
          {credits.map((v) => (
            <EntitlementCard
              key={v.entitlement.id}
              view={v}
              packageName={packageName(v.entitlement.packageId)}
              timezone={timezone}
              nowMs={nowMs}
              canAdjust={canAdjust && !readOnly}
              onAdjust={() => setAdjusting(v)}
            />
          ))}
        </ul>
      )}
      {slug && !readOnly ? (
        <div className={cn(rowClass, "flex items-center justify-between gap-3")}>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Offer links</p>
            <p className="text-xs text-muted-foreground">
              Shown under Offers when {firstName} signs in
            </p>
          </div>
          <CardLink onClick={() => setOffersOpen((o) => !o)} label="Show offer links">
            {offersOpen ? "Hide" : `${on} on`}
          </CardLink>
        </div>
      ) : null}
      {offersOpen && slug ? (
        <div className="border-t p-3">
          <ClientOfferLinksCard clientId={clientId} slug={slug} disabled={readOnly} />
        </div>
      ) : null}
      <AdjustCreditsDialog
        view={adjusting}
        packageName={adjusting ? packageName(adjusting.entitlement.packageId) : ""}
        nowMs={nowMs}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null);
        }}
      />
    </ProfileCard>
  );
}

export function InvoicesCard({
  customerId,
  canManage,
  readOnly,
  entitled,
  onNewInvoice,
}: {
  customerId: string;
  canManage: boolean;
  readOnly: boolean;
  entitled: boolean | undefined;
  onNewInvoice: () => void;
}) {
  const invoices = useInvoices({ customerId, limit: 200 });
  return (
    <ProfileCard
      title="Invoices"
      note="Newest first"
      aside={
        canManage && !readOnly ? (
          <Button
            size="sm"
            className="h-[30px]"
            disabled={entitled === undefined}
            title={
              entitled === false
                ? "Invoicing isn’t on your plan yet — add the bolt-on to raise invoices."
                : undefined
            }
            onClick={onNewInvoice}
          >
            <Plus className="size-4" /> New invoice
          </Button>
        ) : null
      }
      bodyClassName="overflow-hidden rounded-b-2xl border-t"
    >
      <InvoicesTable
        invoices={invoices.data}
        loading={invoices.isLoading}
        error={invoices.isError}
        showCustomer={false}
        empty={
          <EmptyState
            title="No invoices yet"
            description={
              canManage ? "Raise one from a booking, or start a blank invoice." : undefined
            }
          />
        }
      />
    </ProfileCard>
  );
}
