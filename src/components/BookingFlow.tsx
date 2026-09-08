import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock, CreditCard, Landmark, MapPin, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Wordmark } from "@/components/Wordmark";
import { CardsGhost } from "@/components/ghost";
import { ApiError } from "@/lib/api";
import { BookingCheckout, type BookingContact } from "@/components/BookingCheckout";
import {
  useBuyPublicPackage,
  useConfirmPublicBooking,
  useCreatePublicBookingHold,
  usePublicAvailability,
  usePublicLocations,
  usePublicPackages,
  usePortalBusinesses,
  usePortalLink,
  usePortalMe,
  usePublicServices,
  useStartPublicBookingPayment,
  type PublicBookingPayment,
  type PublicBusinessProfile,
  type PublicPackage,
  type PublicPackagePayment,
} from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-store";
import type { AvailabilitySlot, BankTransferInstructions, Booking } from "@/lib/api/types";
import { BankTransferPanel } from "@/components/BankTransferPanel";
import { bookingSettlement } from "@/lib/booking-payment";
import { formatInTz, formatMoney, isoDate, spansDays } from "@/lib/format";
import { groupByCategory, hasCategories } from "@/lib/service-categories";
import { packageSummary, validityLabel } from "@/lib/packages";
import { toast } from "sonner";

/**
 * Both journeys share the same four steps. Picking a session reveals the location and
 * time under it rather than paging through them, so choosing is one step; buying a
 * package needs no slot at all and joins at Details.
 */
const STEPS = ["Choose", "Details", "Review", "Done"];
const STEP_CHOOSE = 0;
const STEP_DETAILS = 1;
const STEP_REVIEW = 2;
const STEP_DONE = 3;
const HOLD_WARNING_SECONDS = 60;

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function bookingStartDate(initial?: string): string {
  const today = isoDate(new Date());
  return initial && initial >= today ? initial : today;
}

function dateChoices(selected: string): string[] {
  const today = isoDate(new Date());
  const days = Array.from({ length: 14 }, (_, i) => isoDate(addDays(new Date(), i)));
  if (selected >= today && !days.includes(selected)) return [...days, selected].sort();
  return days;
}

/** Live mm:ss countdown to an ISO instant; fires `onExpire` once when it lapses. */
function useCountdown(targetIso: string | null, onExpire: () => void) {
  const [msLeft, setMsLeft] = useState<number | null>(
    targetIso ? new Date(targetIso).getTime() - Date.now() : null,
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    if (!targetIso) {
      setMsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(targetIso).getTime() - Date.now();
      setMsLeft(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso]);

  return msLeft;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Hold = {
  booking: Booking;
  holdToken: string;
  onlinePaymentRequired?: boolean;
  bankTransferAvailable?: boolean;
  /** What checkout collects right now — the deposit when one is set (RECA-523). */
  amountDueNowMinor?: number;
};

/** "Pay £50 now, £100 later" rows for the summary when a booking carries a deposit. */
function depositRows(
  booking: Pick<Booking, "priceMinor" | "currency" | "status" | "paymentMethod"> & {
    depositMinor?: number | null;
    paidMinor?: number;
  },
): { dueNow: string; balance: string } | undefined {
  const s = bookingSettlement(booking);
  if (s.depositMinor == null) return undefined;
  return {
    dueNow: formatMoney(s.depositMinor, booking.currency),
    balance: formatMoney(s.priceMinor - s.depositMinor, booking.currency),
  };
}

/** How the customer settles a priced booking at checkout. */
type PayMethod = "card" | "bank_transfer" | "in_person";

type StoredJourney = { hold: Hold; contact: BookingContact };

/**
 * Bank authentication navigates away from this page and back, losing React state.
 * The hold and contact details are stashed so the return can pick the journey back up;
 * scoped per business and cleared as soon as the booking is confirmed or the hold drops.
 */
const holdStorageKey = (businessId: string) => `recavo.booking.hold.${businessId}`;

function readStoredJourney(businessId: string): StoredJourney | null {
  try {
    const raw = sessionStorage.getItem(holdStorageKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredJourney>;
    return parsed.hold ? { hold: parsed.hold, contact: parsed.contact ?? EMPTY_CONTACT } : null;
  } catch {
    return null;
  }
}

function writeStoredJourney(businessId: string, journey: StoredJourney | null): void {
  try {
    if (journey) sessionStorage.setItem(holdStorageKey(businessId), JSON.stringify(journey));
    else sessionStorage.removeItem(holdStorageKey(businessId));
  } catch {
    // Private browsing can refuse storage; only the redirect-return path suffers.
  }
}

const EMPTY_CONTACT: BookingContact = { name: null, email: null, phone: null };

/**
 * A package purchase survives bank authentication the same way a booking does, and for a
 * sharper reason: there is no hold to lose, but re-entering the flow would mint a second
 * PaymentIntent and charge the customer twice. Keeping the intent means the same one is
 * reused on return.
 */
type StoredPurchase = {
  packageId: string;
  payment: PublicPackagePayment;
  contact: BookingContact;
};

const purchaseStorageKey = (businessId: string) => `recavo.package.purchase.${businessId}`;

function readStoredPurchase(businessId: string): StoredPurchase | null {
  try {
    const raw = sessionStorage.getItem(purchaseStorageKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPurchase>;
    return parsed.packageId && parsed.payment
      ? {
          packageId: parsed.packageId,
          payment: parsed.payment,
          contact: parsed.contact ?? EMPTY_CONTACT,
        }
      : null;
  } catch {
    return null;
  }
}

function writeStoredPurchase(businessId: string, purchase: StoredPurchase | null): void {
  try {
    if (purchase) sessionStorage.setItem(purchaseStorageKey(businessId), JSON.stringify(purchase));
    else sessionStorage.removeItem(purchaseStorageKey(businessId));
  } catch {
    // Private browsing can refuse storage; only the redirect-return path suffers.
  }
}

/**
 * Stripe wants E.164. Numbers are typed in national form far more often than not, so
 * a bare leading 0 is expanded using the dialling code of the number's own country —
 * guessing wrong would prefill someone else's number, so anything ambiguous is dropped.
 */
function toE164(raw: string, diallingCode = "44"): string | null {
  const trimmed = raw.replace(/[\s()-]/g, "");
  if (!trimmed) return null;
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  if (/^0\d{9,10}$/.test(trimmed)) return `+${diallingCode}${trimmed.slice(1)}`;
  return null;
}

/** Enough to catch a mistyped address, not full RFC validation — the server decides. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** True when Stripe has just sent the customer back after authenticating a card. */
function returnedFromAuthentication(): boolean {
  return new URLSearchParams(window.location.search).has("payment_intent_client_secret");
}

/** Which studio's in-progress card return is sitting in session storage. */
export function businessIdPendingCardReturn(businessIds: readonly string[]): string | null {
  if (typeof window === "undefined" || !returnedFromAuthentication()) return null;
  return (
    businessIds.find((id) => Boolean(readStoredJourney(id)) || Boolean(readStoredPurchase(id))) ??
    null
  );
}

function splitDisplayName(name: string | null | undefined): { first: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Stripe reports the outcome of the authentication it just took the customer through. */
function authenticationSucceeded(): boolean {
  return new URLSearchParams(window.location.search).get("redirect_status") === "succeeded";
}

export interface BookingFlowProps {
  readonly businessId: string;
  /**
   * The studio, once resolved. Null while it loads, in which case the page
   * falls back to the location name rather than flashing a bare wordmark.
   */
  readonly studio?: PublicBusinessProfile | null;
  /**
   * Strips Stripe's redirect parameters after a booking completes, without
   * leaving the page. Each route owns its own search shape, so it does this
   * itself rather than having the flow guess.
   */
  readonly onClearRedirectParams: () => void;
  /**
   * `page` is the public studio link. `embedded` is the signed-in account
   * drawer — same steps, no public chrome, and it closes instead of leaving
   * the dashboard.
   */
  readonly layout?: "page" | "embedded";
  /** Fired when a signed-in booking finishes inside the account drawer. */
  readonly onComplete?: () => void;
  /** Calendar (and similar) can open already on a day, session or slot. */
  readonly initialDate?: string;
  readonly initialServiceId?: string;
  readonly initialLocationId?: string;
  readonly initialSlot?: AvailabilitySlot | null;
}

export function BookingFlow({
  businessId,
  studio,
  onClearRedirectParams,
  layout = "page",
  onComplete,
  initialDate,
  initialServiceId,
  initialLocationId,
  initialSlot = null,
}: BookingFlowProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const auth = useAuth();
  const signedIn = auth.status === "authenticated";
  const [step, setStep] = useState(initialSlot ? STEP_DETAILS : STEP_CHOOSE);
  /** Which of the two journeys the customer is on, chosen on the first step. */
  const [mode, setMode] = useState<"service" | "package">("service");
  const [packageId, setPackageId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId ?? null);
  const [locationId, setLocationId] = useState<string | null>(
    initialLocationId ?? initialSlot?.locationId ?? null,
  );
  const [date, setDate] = useState(bookingStartDate(initialDate));
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(initialSlot);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [hold, setHold] = useState<Hold | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const me = usePortalMe(signedIn ? businessId : undefined);

  const services = usePublicServices(businessId);
  const locations = usePublicLocations(businessId);
  const packages = usePublicPackages(businessId);

  const service = services.data?.find((s) => s.id === serviceId) ?? null;
  // With one location there is nothing to choose, so it is picked for the customer and
  // the "Where" block never appears. Derived rather than assigned on click, so it still
  // holds when the locations arrive after the service was picked.
  const soleLocationId = locations.data?.length === 1 ? locations.data[0].id : null;
  const activeLocationId = locationId ?? soleLocationId;
  const location = locations.data?.find((l) => l.id === activeLocationId) ?? null;
  const chosenPackage = packages.data?.find((p) => p.id === packageId) ?? null;

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const availability = usePublicAvailability(businessId, {
    serviceId: serviceId ?? undefined,
    locationId: activeLocationId ?? undefined,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
    enabled: step === STEP_CHOOSE && Boolean(serviceId && activeLocationId),
  });

  const slots = useMemo(
    () => (availability.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );

  const reselect = (message: string) => {
    toast.error(message);
    setHold(null);
    setSelectedSlot(null);
    setStep(STEP_CHOOSE);
    void availability.refetch();
  };

  const holdMutation = useCreatePublicBookingHold(businessId);
  const confirmMutation = useConfirmPublicBooking(businessId);
  const paymentMutation = useStartPublicBookingPayment(businessId);
  const buyPackage = useBuyPublicPackage(businessId);
  const [packagePayment, setPackagePayment] = useState<PublicPackagePayment | null>(null);
  const [packageBought, setPackageBought] = useState(false);
  const [payment, setPayment] = useState<PublicBookingPayment | null>(null);
  const [settling, setSettling] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  // Account details + reference returned by a bank-transfer confirm (RECA-522);
  // drives the "make your transfer" confirmation screen.
  const [bankInstructions, setBankInstructions] = useState<BankTransferInstructions | null>(null);
  // Returning from bank authentication remounts with empty fields, so the details the
  // customer typed come back from storage instead.
  const [restoredContact, setRestoredContact] = useState<BookingContact | null>(null);

  const contact = useMemo<BookingContact>(() => {
    if (restoredContact) return restoredContact;
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    return {
      name: fullName || null,
      email: email.trim() || null,
      phone: toE164(phone),
    };
  }, [restoredContact, firstName, lastName, email, phone]);

  const msLeft = useCountdown(hold?.booking.holdExpiresAt ?? null, () =>
    reselect("Your held time has expired — please choose a new time."),
  );

  const clearStoredHold = () => writeStoredJourney(businessId, null);

  /**
   * The confirmation was a dead end — reloading the page was the only way to book
   * again. Contact details are deliberately kept: the same address resolves to the
   * same customer server-side, so retyping them would achieve nothing.
   */
  const bookAnother = () => {
    clearStoredHold();
    writeStoredPurchase(businessId, null);
    if (restoredContact) {
      // Card authentication remounted the page with empty inputs, so put back what
      // the customer already typed rather than making them do it twice.
      const [first = "", ...rest] = (restoredContact.name ?? "").split(" ");
      setFirstName((v) => v || first);
      setLastName((v) => v || rest.join(" "));
      setEmail((v) => v || restoredContact.email || "");
      setPhone((v) => v || restoredContact.phone || "");
      setRestoredContact(null);
    }
    setMode("service");
    setPackageId(null);
    setServiceId(null);
    setLocationId(null);
    setSelectedSlot(null);
    setNotes("");
    setFieldErrors({});
    setHold(null);
    setConfirmedBooking(null);
    setPayment(null);
    setPayMethod("card");
    setBankInstructions(null);
    setPackagePayment(null);
    setPackageBought(false);
    setSettling(false);
    setStep(STEP_CHOOSE);
    // The slot just taken is still sitting in the cached day.
    void queryClient.invalidateQueries({
      queryKey: queryKeys.publicAvailabilityAll(businessId),
    });
    // Stripe's redirect params linger in the URL, and a refresh with them still
    // there would look like another return from the bank.
    onClearRedirectParams();
  };

  const submitDetails = () => {
    if (!selectedSlot) return;
    setFieldErrors({});
    holdMutation.mutate(
      {
        slotToken: selectedSlot.slotToken,
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notesCustomer: notes.trim() || null,
        marketingConsent,
      },
      {
        onSuccess: ({
          booking,
          holdToken,
          onlinePaymentRequired,
          bankTransferAvailable,
          amountDueNowMinor,
        }) => {
          setHold({
            booking,
            holdToken,
            onlinePaymentRequired,
            bankTransferAvailable,
            amountDueNowMinor,
          });
          // Card stays the lead option when it's required; otherwise pay-by-bank
          // (when offered) beats "sort it out on the day" as the default.
          setPayMethod(
            onlinePaymentRequired ? "card" : bankTransferAvailable ? "bank_transfer" : "in_person",
          );
          setStep(STEP_REVIEW);
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.code === "BOOKING_CONFLICT" || err.isConflict) {
              reselect("That time was just taken — please choose another.");
              return;
            }
            if (err.fieldErrors.length > 0) {
              const next: Record<string, string> = {};
              for (const fe of err.fieldErrors) {
                if (fe.field) next[fe.field] = fe.message || fe.code || "Invalid";
              }
              setFieldErrors(next);
              toast.error(err.title || "Please check your details");
              return;
            }
          }
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
        },
      },
    );
  };

  /**
   * Package equivalent of taking a hold: the details step turns the buyer into a lead
   * customer and opens a PaymentIntent, so Review has a card form to render.
   */
  const submitPackageDetails = async () => {
    if (!chosenPackage) return;
    setFieldErrors({});
    try {
      setPackagePayment(
        await buyPackage.mutateAsync({
          packageId: chosenPackage.id,
          firstName: firstName.trim(),
          lastName: lastName.trim() || null,
          email: email.trim(),
          phone: phone.trim() || null,
          marketingConsent,
        }),
      );
      setStep(STEP_REVIEW);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.title : "We couldn't start the payment. Please try again.",
      );
    }
  };

  /**
   * Re-runs the email adoption after buying something while signed in.
   *
   * The purchase creates the customer record, so the account was not linked to
   * this studio when the page loaded and the lookup has "no" cached against it.
   * Dropping the cached answer makes it ask again, which attaches what was just
   * bought and lets the account link appear on the confirmation screen.
   */
  const refreshPortalLink = () => {
    if (!signedIn) return;
    queryClient.removeQueries({ queryKey: queryKeys.portalLink() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalBusinesses() });
  };

  /**
   * Signed-in customers already have an account home. Leaving them on this
   * public confirmation — or letting Back return them to the studio portal they
   * booked from — dumps them on a bookings list instead of their dashboard.
   */
  const goToDashboardIfSignedIn = (message: string, description?: string) => {
    refreshPortalLink();
    if (!signedIn) return false;
    toast.success(message, description ? { description } : undefined);
    if (layout === "embedded") {
      onComplete?.();
      return true;
    }
    void navigate({ to: "/account", replace: true });
    return true;
  };

  const submitConfirm = () => {
    if (!hold) return;
    const viaBank = payMethod === "bank_transfer" && hold.bankTransferAvailable === true;
    confirmMutation.mutate(
      {
        bookingId: hold.booking.id,
        holdToken: hold.holdToken,
        ...(viaBank ? { paymentMethod: "bank_transfer" as const } : {}),
      },
      {
        onSuccess: ({ booking, bankTransfer }) => {
          setConfirmedBooking(booking);
          if (bankTransfer) {
            // The customer must see the account details + reference now — never
            // bounce them to their dashboard before the transfer screen.
            setBankInstructions(bankTransfer);
            clearStoredHold();
            refreshPortalLink();
            setStep(STEP_DONE);
            return;
          }
          if (
            goToDashboardIfSignedIn(
              booking.status === "awaiting_payment" ? "Session reserved" : "You're booked in",
              booking.status === "awaiting_payment"
                ? "Payment is still due — you can pay from your dashboard."
                : undefined,
            )
          ) {
            return;
          }
          setStep(STEP_DONE);
        },
        onError: (err) => {
          if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
            reselect("That time is no longer available — please choose another.");
            return;
          }
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
        },
      },
    );
  };

  /**
   * A paid booking is confirmed by Stripe's webhook, not by this page, so after the
   * card clears we ask the confirm endpoint until it stops reporting the booking as
   * unpaid. It returns the booking once confirmed, so the same call serves as the poll.
   */
  const awaitConfirmation = async (current: Hold) => {
    setSettling(true);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const { booking } = await confirmMutation.mutateAsync({
          bookingId: current.booking.id,
          holdToken: current.holdToken,
        });
        setConfirmedBooking(booking);
        setSettling(false);
        clearStoredHold();
        if (
          goToDashboardIfSignedIn(
            booking.status === "awaiting_payment" ? "Session reserved" : "You're booked in",
            booking.status === "awaiting_payment"
              ? "Payment is still due — you can pay from your dashboard."
              : undefined,
          )
        ) {
          return;
        }
        setStep(STEP_DONE);
        return;
      } catch (err) {
        const pending = err instanceof ApiError && err.status === 422;
        if (!pending) {
          setSettling(false);
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    setSettling(false);
    toast.error(
      "Your payment went through, but we're still confirming the booking. We'll email you shortly.",
    );
  };

  const startPayment = async (current: Hold) => {
    try {
      setPayment(
        await paymentMutation.mutateAsync({
          bookingId: current.booking.id,
          holdToken: current.holdToken,
        }),
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.title : "We couldn't start the payment. Please try again.",
      );
    }
  };

  useEffect(() => {
    writeStoredJourney(businessId, hold ? { hold, contact } : null);
  }, [businessId, hold, contact]);

  // Card authentication takes the customer to their bank and back to a fresh page,
  // so the journey is rebuilt from storage rather than from React state.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !returnedFromAuthentication()) return;
    resumed.current = true;

    const purchase = readStoredPurchase(businessId);
    if (purchase) {
      setMode("package");
      setPackageId(purchase.packageId);
      setPackagePayment(purchase.payment);
      setRestoredContact(purchase.contact);
      if (authenticationSucceeded()) {
        // Credits are issued by the webhook; the card clearing is all this page needs.
        setPackageBought(true);
        writeStoredPurchase(businessId, null);
        if (goToDashboardIfSignedIn("Package bought")) return;
        setStep(STEP_DONE);
      } else {
        // Back to the card form with the original intent, so a retry cannot double-charge.
        setStep(STEP_REVIEW);
      }
      return;
    }

    const stored = readStoredJourney(businessId);
    if (!stored) return;
    setHold(stored.hold);
    setRestoredContact(stored.contact);
    setStep(STEP_REVIEW);
    void awaitConfirmation(stored.hold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Auth can still be loading on the return from the bank, so the handoff above
  // may have seen a signed-out frame. Once the session is back, take them home.
  useEffect(() => {
    if (layout === "embedded") return;
    if (step !== STEP_DONE || !signedIn) return;
    // A pay-by-bank customer stays to read the account details and reference.
    if (bankInstructions) return;
    void navigate({ to: "/account", replace: true });
  }, [step, signedIn, navigate, layout, bankInstructions]);

  useEffect(() => {
    if (restoredContact) return;
    if (signedIn && me.isLoading) return;
    const fromUser = splitDisplayName(auth.user?.name);
    setFirstName((v) => v || me.data?.firstName?.trim() || fromUser.first);
    setLastName((v) => v || me.data?.lastName?.trim() || fromUser.last);
    setEmail((v) => v || me.data?.emailDisplay?.trim() || auth.user?.email || "");
    setPhone((v) => v || me.data?.phoneDisplay?.trim() || auth.user?.phone || "");
  }, [signedIn, me.isLoading, me.data, auth.user, restoredContact]);

  useEffect(() => {
    writeStoredPurchase(
      businessId,
      packagePayment && packageId && !packageBought
        ? { packageId, payment: packagePayment, contact }
        : null,
    );
  }, [businessId, packageId, packagePayment, packageBought, contact]);

  // Asking for the intent on arrival also extends the hold, giving the customer the
  // full window to type a card rather than whatever was left of the original ten minutes.
  useEffect(() => {
    if (step !== STEP_REVIEW || !hold?.onlinePaymentRequired) return;
    // Paying by bank doesn't need Stripe, so don't mint a PaymentIntent for it.
    if (payMethod !== "card") return;
    if (payment || paymentMutation.isPending || settling) return;
    void startPayment(hold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hold, payment, settling, payMethod]);

  const isPackage = mode === "package";
  // Every field on this step is asked for deliberately, so the flow waits for all of
  // them rather than taking a half-filled record the studio then has to chase. Notes
  // and the marketing opt-in are the only optional things, and are marked as such.
  const detailsComplete =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    looksLikeEmail(email) &&
    phone.trim().length > 0;
  // A date change refetches without clearing the grid, so "loading" here means the
  // times on screen belong to the previously selected day.
  const loadingTimes = availability.isFetching;

  // The studio's own name where we have it. The location name is the fallback for
  // the moment before it resolves, so the header does not flash a wordmark first.
  const studioName = studio?.tradingName ?? location?.name ?? locations.data?.[0]?.name ?? null;

  // Signed in and already a customer here: offer the way back to their account.
  // Booking is otherwise a one-way street — the page is built for a stranger with
  // a link, and someone who came from their own portal had no route home.
  //
  // Gated on being a customer of *this* studio rather than merely signed in,
  // because /portal has nothing to show anyone else and bounces them out again.
  const portalLink = usePortalLink(signedIn);
  const portalBusinesses = usePortalBusinesses(signedIn && portalLink.isFetched);
  const hasPortalHere = (portalBusinesses.data ?? []).some((b) => b.id === businessId);
  const needsPayment =
    (hold?.booking.priceMinor ?? confirmedBooking?.priceMinor ?? selectedSlot?.priceMinor ?? 0) > 0;
  const payOnline = hold?.onlinePaymentRequired === true;
  // The API only flags this for priced bookings at businesses with bank details on file.
  const bankAvailable = hold?.bankTransferAvailable === true;
  const holdDeposit = hold ? depositRows(hold.booking) : undefined;
  const embedded = layout === "embedded";

  return (
    <div className={embedded ? undefined : "min-h-screen bg-background"}>
      {embedded ? null : (
        <header className="border-b bg-nav text-nav-foreground">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {studio?.branding.logoUrl ? (
                <img
                  src={studio.branding.logoUrl}
                  alt=""
                  className="size-9 shrink-0 rounded-md object-contain"
                />
              ) : null}
              <div className="min-w-0">
                {studioName ? (
                  <p className="truncate text-base font-semibold tracking-tight">{studioName}</p>
                ) : (
                  <Wordmark />
                )}
                <p className="text-xs text-nav-foreground/70">Online booking</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasPortalHere ? (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-nav-foreground hover:bg-nav-accent hover:text-nav-foreground"
                >
                  <Link to="/account">
                    <UserRound className="size-4" /> My account
                  </Link>
                </Button>
              ) : null}
              <Wordmark compact />
            </div>
          </div>
        </header>
      )}

      <div className={embedded ? "space-y-6 px-5 py-6" : "mx-auto max-w-3xl space-y-6 px-5 py-8"}>
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary-soft text-primary"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {i < step ? (
                <Check className="size-3.5" />
              ) : (
                <span className="tabular-nums">{i + 1}</span>
              )}
              {s}
            </li>
          ))}
        </ol>

        {step === STEP_CHOOSE ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {embedded
                ? "Choose a session"
                : studioName
                  ? `Book at ${studioName}`
                  : "Choose a session"}
            </h1>
            {services.isLoading ? (
              <CardsGhost count={3} className="h-28" />
            ) : services.isError ? (
              <p className="text-sm text-destructive">
                Couldn't load services. Please try again shortly.
              </p>
            ) : (services.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bookable services are available right now.
              </p>
            ) : (
              groupByCategory(services.data ?? []).map((group) => (
                <div key={group.category ?? "__none"} className="space-y-3">
                  {/* Headings only when the studio has sorted its services into categories. */}
                  {hasCategories(services.data ?? []) ? (
                    <h2 className="pt-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                      {group.category ?? "Other"}
                    </h2>
                  ) : null}
                  {group.items.map((s) => {
                    const expanded = s.id === serviceId;
                    return (
                      <div key={s.id} className="space-y-3">
                        <button
                          onClick={() => {
                            // Tapping the open one closes it again, so a mis-tap is undoable
                            // without a Back button on a step that no longer exists.
                            if (expanded) {
                              setServiceId(null);
                              setSelectedSlot(null);
                              return;
                            }
                            setServiceId(s.id);
                            setSelectedSlot(null);
                          }}
                          aria-expanded={expanded}
                          className={`surface-card flex w-full items-center justify-between gap-4 p-5 text-left transition ${
                            expanded ? "ring-2 ring-primary" : ""
                          }`}
                        >
                          <span>
                            <span className="block font-medium">{s.name}</span>
                            {s.description ? (
                              <span className="mt-1 block text-sm text-muted-foreground">
                                {s.description}
                              </span>
                            ) : null}
                            <span className="mt-2 block text-xs text-muted-foreground">
                              {s.durationMinutes} minutes
                            </span>
                          </span>
                          <span className="text-right whitespace-nowrap">
                            <span className="block text-lg font-semibold">
                              {formatMoney(s.basePriceMinor, s.currency)}
                            </span>
                            {s.depositMinor && s.depositMinor < s.basePriceMinor ? (
                              <span className="block text-xs text-muted-foreground">
                                {formatMoney(s.depositMinor, s.currency)} deposit
                              </span>
                            ) : null}
                          </span>
                        </button>

                        {expanded ? (
                          <div className="animate-in fade-in slide-in-from-top-2 space-y-5 rounded-xl border border-dashed p-4 duration-300 sm:p-5">
                            {(locations.data ?? []).length > 1 ? (
                              <div className="space-y-2">
                                <h2 className="text-sm font-medium">Where</h2>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {(locations.data ?? []).map((l) => (
                                    <button
                                      key={l.id}
                                      onClick={() => {
                                        setLocationId(l.id);
                                        setSelectedSlot(null);
                                      }}
                                      className={`rounded-xl border p-3 text-left transition ${
                                        l.id === activeLocationId
                                          ? "border-primary bg-primary-soft text-primary"
                                          : "bg-card hover:bg-secondary"
                                      }`}
                                    >
                                      <span className="flex items-center gap-2 text-sm font-medium">
                                        <MapPin className="size-4" />
                                        {l.name}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {activeLocationId ? (
                              <div className="animate-in fade-in slide-in-from-top-1 space-y-3 duration-300">
                                <h2 className="text-sm font-medium">When</h2>
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                                  {dateChoices(date).map((d) => {
                                    const dt = new Date(`${d}T00:00:00Z`);
                                    const selected = d === date;
                                    return (
                                      <button
                                        key={d}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => {
                                          setDate(d);
                                          setSelectedSlot(null);
                                        }}
                                        className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-3 text-center transition ${
                                          selected
                                            ? "border-primary bg-primary-soft text-primary"
                                            : "bg-card hover:bg-secondary"
                                        }`}
                                      >
                                        <span className="text-xs text-muted-foreground">
                                          {dt.toLocaleDateString("en-GB", {
                                            weekday: "short",
                                            timeZone: "UTC",
                                          })}
                                        </span>
                                        <span className="text-base font-semibold tabular-nums">
                                          {dt.toLocaleDateString("en-GB", {
                                            day: "numeric",
                                            timeZone: "UTC",
                                          })}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {dt.toLocaleDateString("en-GB", {
                                            month: "short",
                                            timeZone: "UTC",
                                          })}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {availability.isLoading ? (
                                  <div className="grid grid-cols-3 gap-2">
                                    {Array.from({ length: 6 }, (_, i) => (
                                      <div
                                        key={i}
                                        className="h-10 animate-pulse rounded-md bg-primary/10"
                                      />
                                    ))}
                                  </div>
                                ) : slots.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    {loadingTimes
                                      ? "Checking this date…"
                                      : "No availability on this date. Try another day."}
                                  </p>
                                ) : (
                                  <>
                                    {/* The previous day's times stay put while the new ones
                                        load, dimmed and inert so the grid never jumps and a
                                        stale time can't be tapped mid-swap. */}
                                    <div
                                      aria-busy={loadingTimes}
                                      className={`grid grid-cols-3 gap-2 transition-opacity duration-200 sm:grid-cols-4 ${
                                        loadingTimes
                                          ? "pointer-events-none opacity-50"
                                          : "opacity-100"
                                      }`}
                                    >
                                      {slots.map((slot) => (
                                        <button
                                          key={`${slot.start}-${slot.staffId}`}
                                          onClick={() => setSelectedSlot(slot)}
                                          className={`rounded-xl border py-2.5 text-sm tabular-nums transition ${
                                            slot.start === selectedSlot?.start &&
                                            slot.staffId === selectedSlot?.staffId
                                              ? "border-primary bg-primary-soft text-primary"
                                              : "hover:bg-secondary"
                                          }`}
                                        >
                                          {formatInTz(slot.start, slot.displayTimezone, {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </button>
                                      ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Times shown in {slots[0]?.displayTimezone}.
                                    </p>
                                  </>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Choose a location to see available times.
                              </p>
                            )}

                            {selectedSlot ? (
                              <Button
                                size="xl"
                                className="animate-in fade-in w-full duration-300"
                                onClick={() => {
                                  setMode("service");
                                  setStep(STEP_DETAILS);
                                }}
                              >
                                Continue
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}

            {(packages.data ?? []).length > 0 ? (
              <div className="space-y-3 pt-4">
                <div>
                  <h2 className="text-base font-semibold">Buy a package</h2>
                  <p className="text-sm text-muted-foreground">
                    Pay for several sessions up front, then book them whenever you like.
                  </p>
                </div>
                {(packages.data ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setMode("package");
                      setPackageId(p.id);
                      // A package has no slot, so the session choice is dropped to keep
                      // the summary on later steps honest.
                      setServiceId(null);
                      setSelectedSlot(null);
                      setStep(STEP_DETAILS);
                    }}
                    className="surface-card flex w-full items-center justify-between gap-4 p-5 text-left"
                  >
                    <span>
                      <span className="block font-medium">{p.name}</span>
                      {p.description ? (
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {p.description}
                        </span>
                      ) : null}
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {packageSummary(p)}
                      </span>
                    </span>
                    <span className="text-lg font-semibold whitespace-nowrap">
                      {formatMoney(p.priceMinor, p.currency)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {step === STEP_DETAILS ? (
          <section className="space-y-4">
            <Back onClick={() => setStep(STEP_CHOOSE)} />
            <h1 className="text-2xl font-semibold tracking-tight">Your details</h1>
            {isPackage && chosenPackage ? (
              <p className="text-sm text-muted-foreground">
                So we know whose {chosenPackage.creditsIssued} credits these are, and where to send
                the receipt.
              </p>
            ) : null}
            <div className="surface-card space-y-3 p-5">
              <div className="grid gap-2">
                <Label htmlFor="b-name">First name</Label>
                <Input
                  id="b-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jamie"
                  aria-invalid={Boolean(fieldErrors.firstName)}
                />
                {fieldErrors.firstName ? (
                  <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b-lname">Last name</Label>
                <Input
                  id="b-lname"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Ellis"
                  aria-invalid={Boolean(fieldErrors.lastName)}
                />
                {fieldErrors.lastName ? (
                  <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b-email">Email</Label>
                <Input
                  id="b-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jamie@example.co.uk"
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {fieldErrors.email ? (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b-phone">Mobile</Label>
                <Input
                  id="b-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07700 900000"
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
                {fieldErrors.phone ? (
                  <p className="text-xs text-destructive">{fieldErrors.phone}</p>
                ) : null}
              </div>
              {!isPackage ? (
                <div className="grid gap-2">
                  <Label htmlFor="b-notes">Anything we should know? (optional)</Label>
                  <Textarea
                    id="b-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              ) : null}
              <label className="flex items-start gap-2.5 pt-1 text-sm">
                <Checkbox
                  checked={marketingConsent}
                  onCheckedChange={(v) => setMarketingConsent(v === true)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  Keep me updated with offers and news from this studio. You can opt out anytime.
                </span>
              </label>
            </div>
            {isPackage && chosenPackage ? (
              <PackageSummary pkg={chosenPackage} />
            ) : service && selectedSlot && location ? (
              <Summary
                serviceName={service.name}
                locationName={location.name}
                start={selectedSlot.start}
                end={selectedSlot.end}
                timezone={selectedSlot.displayTimezone}
                price={formatMoney(selectedSlot.priceMinor, selectedSlot.currency)}
                deposit={
                  service.depositMinor && service.depositMinor < selectedSlot.priceMinor
                    ? {
                        dueNow: formatMoney(service.depositMinor, selectedSlot.currency),
                        balance: formatMoney(
                          selectedSlot.priceMinor - service.depositMinor,
                          selectedSlot.currency,
                        ),
                      }
                    : undefined
                }
              />
            ) : null}
            <Button
              size="xl"
              className="w-full"
              disabled={
                !detailsComplete || (isPackage ? buyPackage.isPending : holdMutation.isPending)
              }
              onClick={isPackage ? () => void submitPackageDetails() : submitDetails}
            >
              {isPackage
                ? buyPackage.isPending
                  ? "Setting up secure payment…"
                  : "Continue"
                : holdMutation.isPending
                  ? "Holding your slot…"
                  : "Continue"}
            </Button>
          </section>
        ) : null}

        {step === STEP_REVIEW && isPackage && chosenPackage ? (
          <section className="space-y-4">
            <Back onClick={() => setStep(STEP_DETAILS)} />
            <h1 className="text-2xl font-semibold tracking-tight">Review &amp; pay</h1>
            <PackageSummary pkg={chosenPackage} />
            {packagePayment ? (
              <BookingCheckout
                payment={packagePayment}
                contact={contact}
                onPaid={async () => {
                  setPackageBought(true);
                  if (goToDashboardIfSignedIn("Package bought")) return;
                  setStep(STEP_DONE);
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Setting up secure payment…</p>
            )}
          </section>
        ) : null}

        {step === STEP_REVIEW && !isPackage && hold ? (
          <section className="space-y-4">
            <button
              onClick={() => reselect("Your hold was released — please choose a new time.")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Change time
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">Review &amp; confirm</h1>
            {msLeft !== null ? (
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                  msLeft < HOLD_WARNING_SECONDS * 1000
                    ? "border-destructive/40 bg-destructive-soft text-destructive"
                    : "border-warning/40 bg-warning-soft text-warning-foreground"
                }`}
              >
                <Clock className="size-4 shrink-0" />
                We're holding this time for you — complete your booking within{" "}
                <span className="font-semibold tabular-nums">{formatCountdown(msLeft)}</span>.
              </div>
            ) : null}
            {service && location ? (
              <Summary
                serviceName={service.name}
                locationName={location.name}
                start={hold.booking.start}
                end={hold.booking.end}
                timezone={hold.booking.timezone}
                price={formatMoney(hold.booking.priceMinor, hold.booking.currency)}
                deposit={depositRows(hold.booking)}
              />
            ) : null}
            {settling ? (
              <div className="rounded-xl border bg-secondary px-4 py-3 text-sm">
                <p>Payment received — confirming your booking…</p>
              </div>
            ) : (
              <>
                {bankAvailable ? (
                  <PayMethodPicker
                    value={payMethod}
                    onChange={setPayMethod}
                    cardOffered={payOnline}
                    disabled={confirmMutation.isPending}
                  />
                ) : null}
                {payOnline && payMethod === "card" ? (
                  payment ? (
                    <BookingCheckout
                      payment={payment}
                      contact={contact}
                      onPaid={() => awaitConfirmation(hold)}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {paymentMutation.isPending
                        ? "Setting up secure payment…"
                        : "Payment is unavailable right now. Please try again in a moment."}
                    </p>
                  )
                ) : bankAvailable && payMethod === "bank_transfer" ? (
                  <>
                    <div className="rounded-xl border bg-secondary px-4 py-3 text-left text-sm">
                      <p>
                        {holdDeposit
                          ? `Confirming reserves your time and shows you the account details and payment reference for your ${holdDeposit.dueNow} deposit. The remaining ${holdDeposit.balance} is settled with the business later. We'll email the details too.`
                          : "Confirming reserves your time and shows you the account details, amount and payment reference for your transfer. We'll email them too."}
                      </p>
                    </div>
                    <Button
                      size="xl"
                      className="w-full"
                      disabled={confirmMutation.isPending || (msLeft ?? 0) <= 0}
                      onClick={submitConfirm}
                    >
                      {confirmMutation.isPending ? "Reserving…" : "Confirm & get bank details"}
                    </Button>
                  </>
                ) : (
                  <>
                    {needsPayment ? (
                      <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
                        <p>
                          {holdDeposit
                            ? `This costs ${formatMoney(hold.booking.priceMinor, hold.booking.currency)} — a ${holdDeposit.dueNow} deposit secures it and the ${holdDeposit.balance} balance is payable to the business. Confirming reserves your time.`
                            : `This costs ${formatMoney(hold.booking.priceMinor, hold.booking.currency)}, payable to the business. Confirming reserves your time.`}
                        </p>
                      </div>
                    ) : null}
                    <Button
                      size="xl"
                      className="w-full"
                      disabled={confirmMutation.isPending || (msLeft ?? 0) <= 0}
                      onClick={submitConfirm}
                    >
                      {confirmMutation.isPending ? "Confirming…" : "Confirm booking"}
                    </Button>
                  </>
                )}
              </>
            )}
          </section>
        ) : null}

        {step === STEP_DONE && isPackage && packageBought && chosenPackage ? (
          <section className="space-y-4 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-7" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Package bought</h1>
            <p className="text-sm text-muted-foreground">
              {chosenPackage.creditsIssued} credits are yours, and your receipt is on its way to{" "}
              {email.trim() || "your inbox"}.
            </p>
            <PackageSummary pkg={chosenPackage} />
            {hasPortalHere ? (
              // Already signed in and linked, so skip the claim step entirely — it
              // exists to create the account this buyer is using right now.
              <>
                <Button size="xl" className="w-full" asChild>
                  <Link to="/account">Go to my dashboard</Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  They're on your account, ready whenever you are.
                </p>
              </>
            ) : packagePayment?.claimToken ? (
              <>
                <Button size="xl" className="w-full" asChild>
                  <Link to="/claim/$token" params={{ token: packagePayment.claimToken }}>
                    Book your sessions
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Takes a moment to set up an account. The same link is in your receipt if you would
                  rather do it later.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Your receipt has a link for booking them. The studio can also book you in.
              </p>
            )}
          </section>
        ) : null}

        {step === STEP_DONE && !isPackage && confirmedBooking ? (
          <section className="space-y-4 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-7" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              {bankInstructions
                ? "Reserved — now make your transfer"
                : confirmedBooking.status === "awaiting_payment"
                  ? "Almost there — payment needed"
                  : "You're booked in"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {bankInstructions
                ? "Your time is saved for you. Send the transfer below and the booking is confirmed once the money arrives — we've emailed these details too."
                : confirmedBooking.status === "awaiting_payment"
                  ? "Your slot is reserved while the payment finishes going through. We'll email you as soon as it's confirmed."
                  : "You're all set — we've reserved your booking and emailed you the details."}
            </p>
            {bankInstructions ? <BankTransferPanel details={bankInstructions} /> : null}
            {service && location ? (
              <Summary
                serviceName={service.name}
                locationName={location.name}
                start={confirmedBooking.start}
                end={confirmedBooking.end}
                timezone={confirmedBooking.timezone}
                price={formatMoney(confirmedBooking.priceMinor, confirmedBooking.currency)}
                deposit={depositRows(confirmedBooking)}
              />
            ) : null}
            {confirmedBooking.reference && !bankInstructions ? (
              <p className="text-xs text-muted-foreground">
                Booking reference{" "}
                <span className="font-mono font-medium text-foreground">
                  {confirmedBooking.reference}
                </span>
              </p>
            ) : null}
            <Button size="xl" variant="outline" className="w-full" onClick={bookAnother}>
              Book another session
            </Button>
            <p className="text-xs text-muted-foreground">
              Your details are saved, so it only takes a moment.
            </p>
            {hasPortalHere ? (
              <Button size="xl" variant="ghost" className="w-full" asChild>
                <Link to="/account">Go to my dashboard</Link>
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** Card / bank-transfer choice on the review step (RECA-522). */
function PayMethodPicker({
  value,
  onChange,
  cardOffered,
  disabled,
}: {
  value: PayMethod;
  onChange: (method: PayMethod) => void;
  /** Card is only an option when the business requires online payment. */
  cardOffered: boolean;
  disabled?: boolean;
}) {
  const options: Array<{ id: PayMethod; label: string; hint: string; icon: React.ReactNode }> = [
    ...(cardOffered
      ? [
          {
            id: "card" as const,
            label: "Pay by card",
            hint: "Pay now — your booking confirms straight away.",
            icon: <CreditCard className="size-4" />,
          },
        ]
      : [
          {
            id: "in_person" as const,
            label: "Pay on the day",
            hint: "Settle up with the business directly.",
            icon: <UserRound className="size-4" />,
          },
        ]),
    {
      id: "bank_transfer" as const,
      label: "Pay by bank transfer",
      hint: "We'll show you the account details and a payment reference.",
      icon: <Landmark className="size-4" />,
    },
  ];
  return (
    <div role="radiogroup" aria-label="How would you like to pay?" className="grid gap-2">
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              selected ? "border-primary bg-primary-soft/50" : "hover:border-muted-foreground/40"
            }`}
          >
            <span
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                selected ? "bg-primary-soft text-primary" : "bg-secondary text-muted-foreground"
              }`}
            >
              {opt.icon}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{opt.label}</span>
              <span className="block text-xs text-muted-foreground">{opt.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}

function PackageSummary({ pkg }: { pkg: PublicPackage }) {
  return (
    <dl className="surface-card space-y-2 p-5 text-left text-sm">
      {[
        ["Package", pkg.name],
        ["Credits", String(pkg.creditsIssued)],
        ["Valid for", validityLabel(pkg.validity)],
        ["Total", formatMoney(pkg.priceMinor, pkg.currency)],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Summary({
  serviceName,
  locationName,
  start,
  end,
  timezone,
  price,
  deposit,
}: {
  serviceName: string;
  locationName: string;
  start: string;
  end?: string;
  timezone: string;
  price: string;
  /** Present when a deposit secures the booking and the balance is paid later. */
  deposit?: { dueNow: string; balance: string };
}) {
  const whenOpts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  };
  const multiDay = end ? spansDays(start, end, timezone) : false;
  return (
    <dl className="surface-card space-y-2 p-5 text-left text-sm">
      {[
        ["Service", serviceName],
        ["Where", locationName],
        [multiDay ? "Drop off" : "When", formatInTz(start, timezone, whenOpts)],
        ...(multiDay && end ? [["Ready by", formatInTz(end, timezone, whenOpts)]] : []),
        ["Total", price],
        ...(deposit
          ? [
              ["Deposit to pay now", deposit.dueNow],
              ["Balance to pay later", deposit.balance],
            ]
          : []),
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
