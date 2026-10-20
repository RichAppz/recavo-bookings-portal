import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarPlus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCustomer,
  useLocationsList,
  useSendPaymentReminder,
  useStaffList,
} from "@/lib/api/hooks";
import { ApiError, toastApiError } from "@/lib/api";
import { customerDisplayName, type Booking } from "@/lib/api/types";
import { formatInTz } from "@/lib/format";
import { countdownLabel, moneyDue, paymentPhrase } from "@/lib/overview";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import { cn } from "@/lib/utils";
import { useMoney } from "./shared";

const HERO =
  "rounded-[20px] bg-[#10172a] text-white dark:border dark:border-[#1f2a3d] dark:bg-[#0b1220]";
const MINT_BUTTON =
  "h-10 rounded-[11px] bg-[#2bb985] font-bold text-[#10172a] hover:bg-[#2bb985]/90 dark:bg-[#2ee6a6] dark:hover:bg-[#2ee6a6]/90";
const OUTLINE_BUTTON =
  "h-10 rounded-[11px] border border-white/20 bg-transparent font-bold text-white hover:bg-white/10 hover:text-white";

function Label({ children }: { children: string }) {
  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 text-xs font-bold tracking-[0.08em] text-[#9fe3bf] uppercase"
    >
      <span aria-hidden className="size-[7px] rounded-full bg-[#2bb985] dark:bg-[#2ee6a6]" />
      {children}
    </p>
  );
}

export function UpNextGhost() {
  return <div aria-hidden className={cn(HERO, "h-[132px] animate-pulse opacity-80")} />;
}

export function UpNextEmpty({
  onShare,
  onAdd,
  firstBooking,
  bookingNoun,
}: {
  onShare: () => void;
  onAdd: () => void;
  firstBooking: boolean;
  bookingNoun: string;
}) {
  return (
    <section
      aria-label={firstBooking ? "Get your first booking" : "Up next"}
      className={cn(HERO, "px-6 py-[22px]")}
    >
      <Label>{firstBooking ? "Get started" : "Up next"}</Label>
      <p className="mt-2 text-[21px] leading-tight font-extrabold tracking-[-0.02em] md:text-[26px]">
        {firstBooking ? "Get your first booking" : "Nothing else booked today"}
      </p>
      <p className="mt-1.5 text-[13.5px] text-[#aab2c0] md:text-[14.5px]">
        {firstBooking
          ? "Share your booking page so clients can book themselves, or add one yourself."
          : "Share your booking page and the diary fills itself."}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
        <Button className={MINT_BUTTON} onClick={onShare}>
          <Share2 className="size-4" /> Share booking page
        </Button>
        {firstBooking ? (
          <Button className={OUTLINE_BUTTON} variant="outline" onClick={onAdd}>
            <CalendarPlus className="size-4" /> Add {bookingNoun.toLowerCase()}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function UpNextCard({
  booking,
  now,
  timeZone,
  onOpen,
}: {
  booking: Booking;
  now: Date;
  timeZone: string;
  onOpen: () => void;
}) {
  const money = useMoney();
  const customer = useCustomer(booking.leadCustomerId);
  const staff = useStaffList();
  const locations = useLocationsList();
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
  const reminder = useSendPaymentReminder();
  const trainer = staff.data?.find((s) => s.id === booking.staffId);
  const location = locations.data?.find((l) => l.id === booking.locationId);
  const zone = booking.timezone || timeZone;
  const group = booking.serviceSnapshot.bookingMode === "group";
  const who = group
    ? `${booking.seatCount} of ${booking.serviceSnapshot.capacityMax} booked`
    : customer.data
      ? customerDisplayName(customer.data)
      : "…";
  const due = money.allowed && moneyDue(booking);
  const payment = money.allowed ? paymentPhrase(booking, money.format) : null;
  const line = [
    who,
    soleStaff ? null : trainer ? `with ${trainer.displayName}` : null,
    soleLocation ? null : (location?.name ?? null),
    payment,
  ].filter(Boolean);
  const time = booking.allDay
    ? "All day"
    : formatInTz(booking.start, zone, { hour: "2-digit", minute: "2-digit" });

  const sendLink = async () => {
    try {
      await reminder.mutateAsync({ bookingId: booking.id });
      toast.success("Payment link sent", {
        description: `${customer.data ? customerDisplayName(customer.data) : "The client"} was asked to pay.`,
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 422) && err.detail) {
        toast.error("Payment link not sent", { description: err.detail });
        return;
      }
      toastApiError(err);
    }
  };

  return (
    <section
      aria-label="Up next"
      className={cn(HERO, "flex flex-col gap-4 px-6 py-[22px] md:flex-row md:items-center")}
    >
      <div className="min-w-0 flex-1">
        <Label>{`Up next · ${countdownLabel(booking, now, zone)}`}</Label>
        <button
          type="button"
          onClick={onOpen}
          className="mt-2 block max-w-full cursor-pointer truncate text-left text-[21px] leading-tight font-extrabold tracking-[-0.02em] md:text-[26px]"
        >
          {time} {booking.serviceSnapshot.name}
        </button>
        <p className="mt-1.5 truncate text-[13.5px] text-[#aab2c0] md:text-[14.5px]">
          {line.join(" · ")}
        </p>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 md:flex">
        <Button asChild variant="outline" className={OUTLINE_BUTTON}>
          <Link to="/messages">Message</Link>
        </Button>
        {due ? (
          <Button
            className={MINT_BUTTON}
            disabled={reminder.isPending}
            onClick={() => void sendLink()}
          >
            Send payment link
          </Button>
        ) : (
          <Button className={MINT_BUTTON} onClick={onOpen}>
            Open
          </Button>
        )}
      </div>
    </section>
  );
}
