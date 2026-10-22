import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Check, Clock, Loader2, MapPin, Tag } from "lucide-react";
import {
  BookingCheckout,
  type BookingContact,
  type CheckoutLook,
  type CheckoutSubmitHandle,
} from "@/components/BookingCheckout";
import {
  BarSummary,
  BottomBar,
  ClientCard,
  ClientColumn,
  PageTitle,
  PrimaryButton,
  StepHeader,
  SummaryRow,
  TextLink,
} from "@/components/client/ClientPage";
import type { PublicBookingPayment } from "@/lib/api/hooks";
import { formatCountdown, price } from "@/lib/client-journey";
import { formatInTz, formatTimeInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PayMethod = "card" | "credit" | "bank_transfer" | "in_person";

export type PayOption = {
  key: PayMethod;
  title: string;
  subtitle: string;
  disabled?: boolean;
};

export type ReviewSummary = {
  serviceName: string;
  extras: { name: string; priceMinor: number }[];
  /** The client's name as it will appear on the booking. */
  bookingFor: string | null;
  staffName: string | null;
  locationName: string | null;
  address: string | null;
  /** "Northside Studio, LS6" for the desktop card. */
  where: string | null;
  start: string;
  end: string;
  timezone: string;
  priceMinor: number;
  currency: string;
  /** Present when a code or offer took money off; the list price to strike through. */
  listPriceMinor: number | null;
  /** The deposit asked for now, when the business takes one. */
  depositMinor: number | null;
};

export type PolicyInfo = {
  /** ISO instant after which moving or cancelling costs the session; null when there is no window. */
  deadline: string | null;
  businessName: string;
  /** Opens the studio's cancellation policy text. */
  onOpen: (() => void) | null;
};

export type PromoState = {
  /** The code currently applied to the price, if any. */
  code: string;
  /** "SUMMER10 · £5 off" once a code has been checked and taken off. */
  label: string | null;
  error: string | null;
  /** Checking the code, or re-holding the time at the new price. */
  pending: boolean;
  onApply: (code: string) => void;
};

export function ClientReview({
  summary,
  layout,
  msLeft,
  bookingAs,
  onNotYou,
  options,
  payMethod,
  onPayMethod,
  creditNote,
  payment,
  paymentPending,
  contact,
  look,
  onPaid,
  policy,
  agreed,
  onAgreed,
  promo,
  onBack,
  onEdit,
  onConfirm,
  confirming,
  settling,
  cardReady,
  onCardReady,
  submitRef,
}: {
  summary: ReviewSummary;
  layout: "phone" | "desktop";
  /** Countdown on the held time; null when nothing is held yet (credit bookings). */
  msLeft: number | null;
  bookingAs: string | null;
  onNotYou: () => void;
  options: PayOption[];
  payMethod: PayMethod;
  onPayMethod: (method: PayMethod) => void;
  /** "You have 6 left on your 3-month package" */
  creditNote: string | null;
  payment: PublicBookingPayment | null;
  paymentPending: boolean;
  contact: BookingContact;
  look: CheckoutLook;
  onPaid: () => Promise<void>;
  policy: PolicyInfo;
  agreed: boolean;
  onAgreed: (value: boolean) => void;
  promo: PromoState;
  onBack: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  confirming: boolean;
  settling: boolean;
  cardReady: boolean;
  onCardReady: (ready: boolean) => void;
  submitRef: MutableRefObject<CheckoutSubmitHandle>;
}) {
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const desktop = layout === "desktop";
  const paying = payMethod === "card";
  const isCredit = payMethod === "credit";
  const expired = msLeft !== null && msLeft <= 0;

  const dueNow = isCredit
    ? 0
    : summary.depositMinor !== null
      ? summary.depositMinor
      : summary.priceMinor;
  const balance = summary.depositMinor !== null ? summary.priceMinor - summary.depositMinor : 0;

  const deadlineLabel = policy.deadline
    ? formatInTz(policy.deadline, summary.timezone, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const deadlinePassed = policy.deadline
    ? new Date(policy.deadline).getTime() <= Date.now()
    : false;
  const afterText = isCredit
    ? "After that, the session credit is used."
    : summary.priceMinor > 0
      ? "After that, the session is charged in full."
      : "";

  const amount = price(dueNow, summary.currency);
  const primaryLabel = settling
    ? "Confirming…"
    : confirming || cardSubmitting
      ? paying
        ? "Taking payment…"
        : "Confirming…"
      : paying
        ? desktop
          ? `Pay ${amount} and book`
          : `Pay ${amount}`
        : payMethod === "bank_transfer"
          ? "Confirm and get bank details"
          : "Confirm booking";

  const primaryDisabled =
    settling ||
    confirming ||
    cardSubmitting ||
    expired ||
    // A credit booking shows its cancellation terms as a line, with no box to tick.
    (!agreed && !isCredit) ||
    promo.pending ||
    (paying && (!payment || !cardReady));

  const primaryAction = () => {
    if (paying) {
      void submitRef.current?.submit();
      return;
    }
    onConfirm();
  };

  const onSubmittingRef = useRef(setCardSubmitting);

  const totalLabel = isCredit
    ? "To pay today"
    : payMethod === "in_person"
      ? "To pay on the day"
      : payMethod === "bank_transfer"
        ? "To pay by transfer"
        : "To pay now";
  const totalValue = isCredit ? `${price(0, summary.currency)} · 1 credit` : amount;

  const monthShort = formatInTz(summary.start, summary.timezone, { month: "short" }).toUpperCase();
  const dayNum = formatInTz(summary.start, summary.timezone, { day: "numeric" });
  const timeRange = `${formatTimeInTz(summary.start, summary.timezone)} to ${formatTimeInTz(summary.end, summary.timezone)}`;
  const weekday = formatInTz(summary.start, summary.timezone, {
    weekday: isCredit ? "long" : "short",
  });

  const lineItems = (
    <>
      <Row
        label={summary.serviceName}
        value={price(summary.listPriceMinor ?? summary.priceMinor, summary.currency)}
      />
      {summary.extras.map((e) => (
        <Row key={e.name} label={e.name} value={price(e.priceMinor, summary.currency)} />
      ))}
      {promo.label ? (
        <Row
          label={promo.label}
          value={`−${price((summary.listPriceMinor ?? summary.priceMinor) - summary.priceMinor, summary.currency)}`}
        />
      ) : null}
      {summary.depositMinor !== null && !isCredit ? (
        <Row label="Balance at the session" value={price(balance, summary.currency)} />
      ) : null}
    </>
  );

  const dateBlock = (
    <div className="flex h-[64px] w-[64px] shrink-0 flex-col items-center justify-center rounded-[calc(var(--radius)-4px)] bg-muted">
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
        {monthShort}
      </span>
      <span className="text-[24px] font-bold leading-none">{dayNum}</span>
    </div>
  );

  const editLink = settling ? null : <TextLink onClick={onEdit}>Edit</TextLink>;

  const desktopCard = (
    <ClientCard className="shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-4">
          {dateBlock}
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold leading-tight">{summary.serviceName}</p>
            <p className="mt-0.5 text-[14px] text-muted-foreground">
              {weekday}, {timeRange}
            </p>
            {summary.extras.length > 0 ? (
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                + {summary.extras.map((e) => e.name).join(", ")}
              </p>
            ) : null}
          </div>
          {editLink}
        </div>
        <div className="mt-4 border-t border-border pt-3">
          {summary.bookingFor ? (
            <SummaryRow label="Booking for" value={summary.bookingFor} />
          ) : null}
          <SummaryRow label="With" value={summary.staffName ?? "Any trainer"} />
          {summary.where ? <SummaryRow label="Where" value={summary.where} /> : null}
        </div>
      </div>
      {isCredit ? null : (
        <div className="border-t border-border px-5 py-4">
          <PromoField promo={promo} />
        </div>
      )}
      <div className="border-t border-border px-5 py-4">
        {lineItems}
        <div className="mt-2 flex items-baseline justify-between pt-1">
          <span className="text-[15px] font-semibold">{totalLabel}</span>
          <span className="text-[22px] font-bold">{totalValue}</span>
        </div>
      </div>
    </ClientCard>
  );

  const phoneCard = (
    <ClientCard>
      <div className="flex items-center gap-4 px-4 py-4">
        {dateBlock}
        <div className="min-w-0 flex-1">
          {isCredit ? (
            <>
              <p className="text-[18px] font-semibold leading-tight">
                {weekday}, {timeRange}
              </p>
              <p className="mt-0.5 truncate text-[14px] text-muted-foreground">
                {summary.serviceName}
                {summary.staffName ? ` with ${summary.staffName}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-[18px] font-semibold leading-tight">{summary.serviceName}</p>
              <p className="mt-0.5 truncate text-[14px] text-muted-foreground">
                {weekday} {timeRange} · {summary.staffName ?? "Any trainer"}
              </p>
            </>
          )}
          {summary.extras.length > 0 ? (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              + {summary.extras.map((e) => e.name).join(", ")}
            </p>
          ) : null}
        </div>
        {editLink}
      </div>
      {summary.locationName || summary.address ? (
        <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-[15px]">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {[summary.locationName, summary.address].filter(Boolean).join(", ")}
          </span>
        </div>
      ) : null}
    </ClientCard>
  );

  const paymentOptions = (
    <>
      {options.length > 1 ? (
        <p className="mt-6 text-[14px] font-semibold text-muted-foreground">
          How would you like to pay?
        </p>
      ) : null}
      <div className={cn("mt-2 grid gap-3", desktop && "desk:grid-cols-3")}>
        {options.map((opt) => {
          const active = opt.key === payMethod;
          if (opt.key === "credit") {
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onPayMethod(opt.key)}
                disabled={opt.disabled}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[var(--radius)] border bg-card px-4 py-4 text-left transition",
                  desktop && "desk:col-span-3",
                  active ? "border-2 border-primary" : "border-border hover:bg-muted",
                  opt.disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold">{opt.title}</span>
                  <span className="block text-[14px] text-muted-foreground">
                    {creditNote ?? opt.subtitle}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {active ? <Check className="h-4 w-4" /> : null}
                </span>
              </button>
            );
          }
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onPayMethod(opt.key)}
              disabled={opt.disabled}
              aria-pressed={active}
              className={cn(
                "flex w-full items-start gap-3 rounded-[var(--radius)] border bg-card px-4 py-4 text-left transition",
                desktop && "min-h-[96px] flex-col gap-2",
                desktop && options.length === 1 && "min-h-0 flex-row desk:col-span-3",
                active ? "border-2 border-primary" : "border-border hover:bg-muted",
                opt.disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  active ? "border-primary" : "border-input",
                )}
              >
                {active ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn("block font-semibold", desktop ? "text-[15px]" : "text-[17px]")}
                >
                  {opt.title}
                </span>
                <span
                  className={cn(
                    "block text-muted-foreground",
                    desktop ? "text-[13px]" : "text-[14px]",
                  )}
                >
                  {opt.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {paying ? (
        <div className="mt-4 rounded-[var(--radius)] border border-border bg-card p-4">
          {payment ? (
            <BookingCheckout
              payment={payment}
              contact={contact}
              onPaid={onPaid}
              look={look}
              submitRef={submitRef}
              hideButton
              onSubmittingChange={(v) => onSubmittingRef.current(v)}
              onReadyChange={onCardReady}
            />
          ) : (
            <div className="flex items-center gap-3 py-2 text-[14px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {paymentPending
                ? "Setting up secure payment…"
                : "Payment is unavailable right now. Please try again in a moment."}
            </div>
          )}
          <p className="mt-3 text-center text-[12px] text-muted-foreground">
            Payments are processed securely by Stripe
          </p>
        </div>
      ) : null}

      {payMethod === "bank_transfer" ? (
        <p className="mt-4 rounded-[var(--radius)] bg-muted px-4 py-3 text-[14px] text-muted-foreground">
          Confirming saves your time and shows you the account details, amount and reference to pay.
          We email them too, and your booking is confirmed once the money lands.
        </p>
      ) : null}
      {payMethod === "in_person" && summary.priceMinor > 0 ? (
        <p className="mt-4 rounded-[var(--radius)] bg-muted px-4 py-3 text-[14px] text-muted-foreground">
          {summary.depositMinor !== null
            ? `A ${price(summary.depositMinor, summary.currency)} deposit is due at the session, with the ${price(balance, summary.currency)} balance payable to ${policy.businessName}.`
            : `${price(summary.priceMinor, summary.currency)} is payable to ${policy.businessName} at the session.`}
        </p>
      ) : null}
    </>
  );

  const settlingNotice = (
    <div className="mt-6 flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-4 py-4">
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
      <div>
        <p className="text-[16px] font-semibold">Payment received</p>
        <p className="text-[14px] text-muted-foreground">
          Confirming your booking. This usually takes a second or two.
        </p>
      </div>
    </div>
  );

  const policyLine = isCredit ? (
    <p className="mt-5 flex items-start gap-2 text-[14px] text-muted-foreground">
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {deadlineLabel
          ? deadlinePassed
            ? `This session starts soon, so once booked it can't be cancelled for free. ${afterText}`
            : `Free to cancel until ${deadlineLabel}. ${afterText}`
          : "You can move or cancel this from your account."}
      </span>
    </p>
  ) : (
    <label className="mt-5 flex cursor-pointer items-start gap-3 text-[14px] text-muted-foreground">
      <input
        type="checkbox"
        checked={agreed}
        onChange={(e) => onAgreed(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-input accent-[var(--client-accent)]"
      />
      <span>
        I agree to {policy.businessName}'s{" "}
        {policy.onOpen ? (
          <button
            type="button"
            onClick={policy.onOpen}
            className="font-semibold text-foreground underline underline-offset-2"
          >
            cancellation policy
          </button>
        ) : (
          <span className="font-semibold text-foreground">cancellation policy</span>
        )}
        .{" "}
        {deadlineLabel
          ? deadlinePassed
            ? `This session starts soon, so once booked it can't be cancelled for free. ${afterText}`
            : `Free to cancel until ${deadlineLabel}. ${afterText}`
          : null}
      </span>
    </label>
  );

  const bookingAsCard = bookingAs ? (
    <div className="mt-4 flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3">
      <div>
        <p className="text-[13px] text-muted-foreground">Booking as</p>
        <p className="text-[17px] font-semibold">{bookingAs}</p>
      </div>
      <TextLink onClick={onNotYou}>Not you?</TextLink>
    </div>
  ) : null;

  if (desktop) {
    return (
      <ClientColumn wide className="pt-6">
        <div className="grid grid-cols-1 items-start gap-10 desk:grid-cols-[minmax(0,1fr)_320px] desk:gap-12">
          <div className="min-w-0">
            <PageTitle>{isCredit ? "Confirm your booking" : "Review and pay"}</PageTitle>
            {bookingAsCard}
            {settling ? settlingNotice : paymentOptions}
            {policyLine}
            <div className="mt-8 flex items-center justify-between">
              <TextLink onClick={onBack}>Back</TextLink>
              <PrimaryButton
                onClick={primaryAction}
                disabled={primaryDisabled}
                className="min-w-[200px]"
              >
                {primaryLabel}
              </PrimaryButton>
            </div>
          </div>
          <aside className="desk:sticky desk:top-6">{desktopCard}</aside>
        </div>
      </ClientColumn>
    );
  }

  return (
    <div>
      <ClientColumn>
        <StepHeader
          step={3}
          total={3}
          label="Review"
          onBack={onBack}
          trailing={
            msLeft !== null ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums",
                  msLeft < 60_000
                    ? "bg-destructive-soft text-destructive"
                    : "bg-primary-soft text-primary",
                )}
              >
                Held {formatCountdown(msLeft)}
              </span>
            ) : null
          }
        />

        <PageTitle>{isCredit ? "Confirm your booking" : "Review and pay"}</PageTitle>
        <div className="mt-5">{phoneCard}</div>
        {bookingAsCard}
        {settling ? settlingNotice : paymentOptions}

        {isCredit ? null : (
          <div className="mt-5">
            <PromoField promo={promo} collapsible />
          </div>
        )}

        <div className="mt-5 border-t border-border pt-3">
          {lineItems}
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-[15px] font-semibold">{totalLabel}</span>
            <span className="text-[22px] font-bold">{totalValue}</span>
          </div>
        </div>

        {policyLine}
      </ClientColumn>

      <BottomBar>
        {isCredit ? (
          <BarSummary caption="To pay today" value={totalValue} />
        ) : summary.depositMinor !== null ? (
          <BarSummary
            caption={`Then ${price(balance, summary.currency)} at the session`}
            value={`${amount} deposit`}
          />
        ) : (
          <span className="hidden sm:block" />
        )}
        <PrimaryButton
          onClick={primaryAction}
          disabled={primaryDisabled}
          full={!isCredit && summary.depositMinor === null}
          className={cn(!isCredit && summary.depositMinor === null && "sm:w-auto sm:min-w-[260px]")}
        >
          {primaryLabel}
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

/** "Promo code" field with Apply; `collapsible` starts as the phone's "Add a promo code" link. */
function PromoField({ promo, collapsible = false }: { promo: PromoState; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible || Boolean(promo.code));
  const [draft, setDraft] = useState(promo.code);
  useEffect(() => setDraft(promo.code), [promo.code]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-[15px] font-semibold underline underline-offset-4"
      >
        <Tag className="h-4 w-4" />
        Add a promo code
      </button>
    );
  }

  const changed = draft.trim().toUpperCase() !== promo.code;
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (changed) promo.onApply(draft.trim());
            }
          }}
          autoComplete="off"
          placeholder="Promo code"
          aria-label="Promo code"
          aria-invalid={promo.error ? true : undefined}
          className={cn(
            "h-[44px] min-w-0 flex-1 rounded-[calc(var(--radius)-4px)] border bg-card px-3 font-mono text-[14px] uppercase text-foreground outline-none transition placeholder:font-sans placeholder:normal-case placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30",
            promo.error ? "border-destructive" : "border-input",
          )}
        />
        <button
          type="button"
          onClick={() => promo.onApply(draft.trim())}
          disabled={promo.pending || (!changed && !promo.error)}
          className="h-[44px] shrink-0 rounded-[calc(var(--radius)-4px)] border border-foreground/70 px-4 text-[14px] font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {promo.pending ? "Checking…" : promo.label && !changed ? "Applied" : "Apply"}
        </button>
      </div>
      {promo.error ? (
        <p className="mt-1.5 text-[13px] text-destructive">{promo.error}</p>
      ) : promo.label ? (
        <p className="mt-1.5 flex items-center gap-1 text-[13px] text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-primary" />
          {promo.label}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-[14px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
