import { useRef, useState, type MutableRefObject } from "react";
import { Check, Clock, Loader2, MapPin } from "lucide-react";
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
} from "@/components/client/ClientPage";
import type { PublicBookingPayment } from "@/lib/api/hooks";
import { formatCountdown } from "@/lib/client-journey";
import { formatInTz, formatMoney, formatTimeInTz } from "@/lib/format";
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
  staffName: string | null;
  locationName: string | null;
  address: string | null;
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

export function ClientReview({
  summary,
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
  promoLabel,
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
  /** "SUMMER10 · £5 off" once a code is applied. */
  promoLabel: string | null;
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

  const primaryLabel = settling
    ? "Confirming…"
    : confirming || cardSubmitting
      ? paying
        ? "Taking payment…"
        : "Confirming…"
      : paying
        ? `Pay ${formatMoney(dueNow, summary.currency)}`
        : payMethod === "bank_transfer"
          ? "Confirm and get bank details"
          : "Confirm booking";

  const primaryDisabled =
    settling ||
    confirming ||
    cardSubmitting ||
    expired ||
    !agreed ||
    (paying && (!payment || !cardReady));

  const primaryAction = () => {
    if (paying) {
      void submitRef.current?.submit();
      return;
    }
    onConfirm();
  };

  const onSubmittingRef = useRef(setCardSubmitting);

  const monthShort = formatInTz(summary.start, summary.timezone, { month: "short" }).toUpperCase();
  const dayNum = formatInTz(summary.start, summary.timezone, { day: "numeric" });
  const timeRange = `${formatTimeInTz(summary.start, summary.timezone)} to ${formatTimeInTz(summary.end, summary.timezone)}`;
  const weekday = formatInTz(summary.start, summary.timezone, {
    weekday: isCredit ? "long" : "short",
  });

  const summaryCard = (
    <ClientCard>
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center rounded-[calc(var(--radius)-4px)] bg-primary-soft">
          <span className="text-[11px] font-semibold tracking-wide text-primary">{monthShort}</span>
          <span className="text-[24px] font-bold leading-none">{dayNum}</span>
        </div>
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
                {weekday} {timeRange} · {summary.staffName ?? "Anyone"}
              </p>
            </>
          )}
          {summary.extras.length > 0 ? (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              + {summary.extras.map((e) => e.name).join(", ")}
            </p>
          ) : null}
        </div>
        {settling ? null : (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 text-[15px] font-semibold underline underline-offset-4"
          >
            Edit
          </button>
        )}
      </div>
      {summary.locationName || summary.address ? (
        <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-[15px]">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {[summary.locationName, summary.address].filter(Boolean).join(", ")}
          </span>
        </div>
      ) : null}
      {/* Totals live on the card on desktop, where it sits beside the form. */}
      <div className="hidden border-t border-border px-4 py-3 lg:block">
        <Row
          label={summary.serviceName}
          value={formatMoney(summary.listPriceMinor ?? summary.priceMinor, summary.currency)}
        />
        {summary.extras.map((e) => (
          <Row key={e.name} label={e.name} value={formatMoney(e.priceMinor, summary.currency)} />
        ))}
        {promoLabel ? (
          <Row
            label={promoLabel}
            value={`−${formatMoney((summary.listPriceMinor ?? summary.priceMinor) - summary.priceMinor, summary.currency)}`}
          />
        ) : null}
        {summary.depositMinor !== null && !isCredit ? (
          <Row label="Balance at the session" value={formatMoney(balance, summary.currency)} />
        ) : null}
        <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
          <span className="text-[15px] font-semibold">
            {isCredit ? "To pay today" : "To pay now"}
          </span>
          <span className="text-[22px] font-bold">
            {isCredit
              ? `${formatMoney(0, summary.currency)} · 1 credit`
              : formatMoney(dueNow, summary.currency)}
          </span>
        </div>
      </div>
    </ClientCard>
  );

  return (
    <div>
      <ClientColumn wide>
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
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
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            <PageTitle>{isCredit ? "Confirm your booking" : "Review and pay"}</PageTitle>

            <div className="mt-5 lg:hidden">{summaryCard}</div>

            {bookingAs ? (
              <div className="mt-4 flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3">
                <div>
                  <p className="text-[13px] text-muted-foreground">Booking as</p>
                  <p className="text-[17px] font-semibold">{bookingAs}</p>
                </div>
                <button
                  type="button"
                  onClick={onNotYou}
                  className="text-[15px] font-semibold underline underline-offset-4"
                >
                  Not you?
                </button>
              </div>
            ) : null}

            {settling ? (
              <div className="mt-6 flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-4 py-4">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                <div>
                  <p className="text-[16px] font-semibold">Payment received</p>
                  <p className="text-[14px] text-muted-foreground">
                    Confirming your booking. This usually takes a second or two.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {options.length > 1 ? (
                  <p className="mt-6 text-[15px] font-semibold text-muted-foreground">
                    How would you like to pay?
                  </p>
                ) : null}
                <div className="mt-2 grid gap-3 lg:grid-cols-3">
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
                            "flex w-full items-center gap-3 rounded-[var(--radius)] border bg-card px-4 py-4 text-left transition lg:col-span-3",
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
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input",
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
                          "flex w-full items-start gap-3 rounded-[var(--radius)] border bg-card px-4 py-4 text-left transition lg:flex-col lg:gap-2",
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
                          <span className="block text-[17px] font-semibold lg:text-[15px]">
                            {opt.title}
                          </span>
                          <span className="block text-[14px] text-muted-foreground lg:text-[13px]">
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
                    Confirming saves your time and shows you the account details, amount and
                    reference to pay. We email them too, and your booking is confirmed once the
                    money lands.
                  </p>
                ) : null}
                {payMethod === "in_person" && summary.priceMinor > 0 ? (
                  <p className="mt-4 rounded-[var(--radius)] bg-muted px-4 py-3 text-[14px] text-muted-foreground">
                    {summary.depositMinor !== null
                      ? `A ${formatMoney(summary.depositMinor, summary.currency)} deposit is due at the session, with the ${formatMoney(balance, summary.currency)} balance payable to ${policy.businessName}.`
                      : `${formatMoney(summary.priceMinor, summary.currency)} is payable to ${policy.businessName} at the session.`}
                  </p>
                ) : null}
              </>
            )}

            {/* Phone total line; the desktop card carries the totals. */}
            <div className="mt-5 flex items-center justify-between lg:hidden">
              {promoLabel ? (
                <p className="text-[14px] text-muted-foreground">
                  <Check className="mr-1 inline h-4 w-4 text-primary" />
                  {promoLabel}
                </p>
              ) : (
                <span />
              )}
              <p className="text-[15px] text-muted-foreground">
                Total{" "}
                {summary.listPriceMinor !== null &&
                summary.listPriceMinor !== summary.priceMinor ? (
                  <span className="mr-1 line-through">
                    {formatMoney(summary.listPriceMinor, summary.currency)}
                  </span>
                ) : null}
                <span className="text-[20px] font-bold text-foreground">
                  {formatMoney(summary.priceMinor, summary.currency)}
                </span>
              </p>
            </div>

            {isCredit ? (
              <p className="mt-4 flex items-start gap-2 text-[14px] text-muted-foreground">
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
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-[14px] text-muted-foreground">
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
            )}
          </div>

          <div className="hidden lg:block lg:sticky lg:top-6">{summaryCard}</div>
        </div>
      </ClientColumn>

      <BottomBar>
        {isCredit ? (
          <BarSummary
            caption="To pay today"
            value={`${formatMoney(0, summary.currency)} · 1 credit`}
          />
        ) : summary.depositMinor !== null ? (
          <BarSummary
            caption={`Then ${formatMoney(balance, summary.currency)} at the session`}
            value={`${formatMoney(dueNow, summary.currency)} deposit`}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-[14px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
