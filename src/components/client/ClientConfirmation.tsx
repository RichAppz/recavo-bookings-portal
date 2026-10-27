import { CalendarPlus, Check, Navigation } from "lucide-react";
import { toast } from "sonner";
import { BankTransferPanel } from "@/components/BankTransferPanel";
import {
  ClientCard,
  ClientColumn,
  InkButton,
  OutlineButton,
  PoweredBy,
  TextLink,
} from "@/components/client/ClientPage";
import type { BankTransferInstructions, Booking } from "@/lib/api/types";
import { directionsUrl, downloadIcs, googleCalendarUrl } from "@/lib/calendar-links";
import { price } from "@/lib/client-journey";
import { formatInTz, formatTimeInTz } from "@/lib/format";
import { bookingSettlement } from "@/lib/booking-payment";
import { cn } from "@/lib/utils";

export type ConfirmationExtra = {
  serviceId: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
};

export function ClientConfirmation({
  booking,
  layout,
  businessName,
  serviceName,
  staffName,
  locationName,
  address,
  parkingNote,
  email,
  phoneGiven,
  bankTransfer,
  deadline,
  extras,
  onAddExtra,
  hasAccount,
  onManage,
  onCreateAccount,
  onBookAnother,
}: {
  booking: Booking;
  layout: "phone" | "desktop";
  businessName: string;
  serviceName: string;
  staffName: string | null;
  locationName: string | null;
  address: string | null;
  parkingNote: string | null;
  email: string | null;
  phoneGiven: boolean;
  bankTransfer: BankTransferInstructions | null;
  /** ISO instant until which the client can move or cancel freely; null when none applies. */
  deadline: string | null;
  /** Add-ons the business offers after this session, for the "Add to your session" card. */
  extras: ConfirmationExtra[];
  onAddExtra: (serviceId: string) => void;
  hasAccount: boolean;
  onManage: () => void;
  onCreateAccount: () => void;
  onBookAnother: () => void;
}) {
  const desktop = layout === "desktop";
  const settlement = bookingSettlement(booking);
  const awaiting = booking.status === "awaiting_payment";
  const paidLine =
    settlement.state === "credit"
      ? "1 credit used"
      : settlement.state === "free"
        ? "Free"
        : settlement.state === "paid"
          ? `Paid ${price(booking.priceMinor, booking.currency)}`
          : settlement.state === "deposit_paid" || settlement.state === "part_paid"
            ? `Paid ${price(settlement.paidMinor, booking.currency)} · ${price(settlement.outstandingMinor, booking.currency)} on the day`
            : bankTransfer
              ? `${price(bankTransfer.amountMinor, bankTransfer.currency)} by bank transfer`
              : booking.priceMinor > 0
                ? "Pay on the day"
                : "Free";

  const title = bankTransfer
    ? "Reserved — now make your transfer"
    : awaiting
      ? "Almost there"
      : "You're booked";

  const emailLine = email ? `We've emailed ${email}` : "We've emailed you the details";
  const textLine = phoneGiven ? " and we'll text you a reminder the day before." : ".";

  const event = {
    title: `${serviceName} at ${businessName}`,
    start: booking.start,
    end: booking.end,
    location: [locationName, address].filter(Boolean).join(", ") || null,
    details: `Booking reference ${booking.reference}`,
  };

  const addToCalendar = () => {
    const ok = downloadIcs(event, `${booking.reference}.ics`);
    if (!ok) window.open(googleCalendarUrl(event), "_blank", "noopener");
    else
      toast.success("Calendar file saved", {
        description: "Open it to add the session to your calendar.",
      });
  };

  const deadlineLabel = deadline
    ? formatInTz(deadline, booking.timezone, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const deadlinePassed = deadline ? new Date(deadline).getTime() <= Date.now() : false;
  const monthShort = formatInTz(booking.start, booking.timezone, { month: "short" }).toUpperCase();
  const dayNum = formatInTz(booking.start, booking.timezone, { day: "numeric" });
  const manage = hasAccount ? onManage : onCreateAccount;

  const actionClass =
    "flex h-14 items-center justify-center gap-2 px-2 text-[15px] font-semibold transition hover:bg-muted";

  const bookingCard = (
    <ClientCard>
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[calc(var(--radius)-4px)] bg-muted">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
            {monthShort}
          </span>
          <span className="text-[20px] font-bold leading-none">{dayNum}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[18px] font-semibold leading-tight">
            {formatInTz(booking.start, booking.timezone, { weekday: "long" })},{" "}
            {formatTimeInTz(booking.start, booking.timezone)} to{" "}
            {formatTimeInTz(booking.end, booking.timezone)}
          </p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">
            {serviceName}
            {staffName ? ` with ${staffName}` : ""} · {paidLine}
          </p>
        </div>
      </div>
      {locationName || address ? (
        <div className="border-t border-border px-4 py-3.5">
          {locationName ? <p className="text-[15px] font-semibold">{locationName}</p> : null}
          <p className="text-[14px] text-muted-foreground">
            {[address, parkingNote].filter(Boolean).join(" · ")}
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          "grid divide-x divide-border border-t border-border",
          desktop ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <button type="button" onClick={addToCalendar} className={actionClass}>
          <CalendarPlus className="h-4 w-4 desk:hidden" />
          Add to calendar
        </button>
        {address ? (
          <a href={directionsUrl(address)} target="_blank" rel="noreferrer" className={actionClass}>
            <Navigation className="h-4 w-4 desk:hidden" />
            Directions
          </a>
        ) : (
          <a
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noreferrer"
            className={actionClass}
          >
            Google Calendar
          </a>
        )}
        {desktop ? (
          <button type="button" onClick={manage} className={actionClass}>
            Move or cancel
          </button>
        ) : null}
      </div>
    </ClientCard>
  );

  const extra = extras[0] ?? null;
  const extrasCard = extra ? (
    <ClientCard className="flex flex-col">
      <div className="flex-1 px-4 pt-4">
        <p className="text-[13px] font-semibold text-muted-foreground">Add to your session</p>
        <p className="mt-1 text-[17px] font-semibold">{extra.name}</p>
        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
          {extra.durationMinutes} min straight after your session. Nothing is charged now.
        </p>
      </div>
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-[16px] font-semibold">{price(extra.priceMinor, extra.currency)}</span>
        <button
          type="button"
          onClick={() => onAddExtra(extra.serviceId)}
          className="h-10 shrink-0 rounded-full border border-foreground/70 px-5 text-[14px] font-semibold transition hover:bg-muted"
        >
          Add
        </button>
      </div>
    </ClientCard>
  ) : null;

  const hero = (
    <div className="text-center">
      <span
        className={cn(
          "mx-auto flex items-center justify-center rounded-full bg-primary text-primary-foreground",
          desktop ? "h-[60px] w-[60px]" : "h-[72px] w-[72px]",
        )}
      >
        <Check className="h-7 w-7" strokeWidth={3} />
      </span>
      <h1
        className="mt-5 text-[30px] font-bold leading-tight tracking-tight sm:text-[40px]"
        style={{ fontFamily: "var(--client-font-display)", fontWeight: 650 }}
      >
        {title}
      </h1>
      <p className="mx-auto mt-2 max-w-lg text-[16px] text-muted-foreground">
        {bankTransfer
          ? "Your time is saved. Send the transfer below and the booking is confirmed once the money arrives — we've emailed these details too."
          : awaiting
            ? "Your time is reserved while the payment finishes going through. We'll email you as soon as it's confirmed."
            : `${emailLine}${textLine}`}
      </p>
    </div>
  );

  if (desktop) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-6 pt-10">
        {hero}
        {bankTransfer ? (
          <div className="mt-6">
            <BankTransferPanel details={bankTransfer} />
          </div>
        ) : null}
        <div
          className={cn(
            "mt-7 grid items-stretch gap-4",
            extrasCard ? "grid-cols-1 desk:grid-cols-[minmax(0,1fr)_250px]" : "grid-cols-1",
          )}
        >
          {bookingCard}
          {extrasCard}
        </div>
        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          {deadlineLabel && !bankTransfer
            ? deadlinePassed
              ? "This session starts soon, so it can no longer be moved or cancelled for free"
              : `Free to move or cancel until ${deadlineLabel}`
            : `Reference ${booking.reference}`}
          {" · "}
          <TextLink onClick={onBookAnother} className="text-[13px] text-foreground">
            Book another session
          </TextLink>
        </p>
        {hasAccount ? null : (
          <p className="mt-2 text-center text-[13px] text-muted-foreground">
            <TextLink onClick={onCreateAccount} className="text-[13px] text-foreground">
              Manage my bookings
            </TextLink>{" "}
            · we'll email you a code so you can move or cancel this and book faster next time.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <ClientColumn className="pt-10 sm:pt-16">
        {hero}

        {bankTransfer ? (
          <div className="mt-6">
            <BankTransferPanel details={bankTransfer} />
          </div>
        ) : null}

        <div className="mt-6">{bookingCard}</div>
        {extrasCard ? <div className="mt-4">{extrasCard}</div> : null}

        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Reference{" "}
          <span className="font-mono font-semibold text-foreground">{booking.reference}</span>
        </p>

        <div className="mt-8 space-y-3">
          {hasAccount ? (
            <OutlineButton full onClick={onManage}>
              Manage my bookings
            </OutlineButton>
          ) : (
            <>
              <InkButton full onClick={onCreateAccount}>
                Manage my bookings
              </InkButton>
              <p className="text-center text-[13px] text-muted-foreground">
                We'll email you a code so you can move or cancel this, see your receipts and book
                faster next time.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={onBookAnother}
            className="w-full py-2 text-center text-[15px] font-semibold underline underline-offset-4"
          >
            Book another session
          </button>
        </div>

        {deadlineLabel && !bankTransfer ? (
          <p className="mt-6 text-center text-[14px] text-muted-foreground">
            {deadlinePassed
              ? "This session starts soon, so it can no longer be moved or cancelled for free."
              : `Move or cancel any time until ${deadlineLabel}`}
          </p>
        ) : null}

        <PoweredBy />
      </ClientColumn>
    </div>
  );
}
