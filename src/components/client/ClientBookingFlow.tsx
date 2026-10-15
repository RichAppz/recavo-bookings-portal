import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { toast } from "sonner";
import type {
  BookingContact,
  CheckoutLook,
  CheckoutSubmitHandle,
} from "@/components/BookingCheckout";
import { EmailCodeSignIn, type EmailCodeStep } from "@/components/EmailCodeSignIn";
import { JoinWaitlistSheet } from "@/components/JoinWaitlistSheet";
import { ClientConfirmation, type ConfirmationExtra } from "@/components/client/ClientConfirmation";
import { ClientDateTime, type DayAvailability } from "@/components/client/ClientDateTime";
import {
  ClientDetails,
  type DetailsField,
  type DetailsValues,
} from "@/components/client/ClientDetails";
import { ClientLanding, type NextAvailable } from "@/components/client/ClientLanding";
import {
  ClientSheet,
  ClientTheme,
  DesktopTopBar,
  InkButton,
  PrimaryButton,
} from "@/components/client/ClientPage";
import {
  ClientReview,
  type PayMethod,
  type PayOption,
  type ReviewSummary,
} from "@/components/client/ClientReview";
import { ApiError } from "@/lib/api";
import {
  useBookWithPortalCredit,
  useConfirmPublicBooking,
  useCreatePublicBookingHold,
  usePortalBusinesses,
  usePortalCredits,
  usePortalLink,
  usePortalMe,
  usePublicAvailability,
  usePublicCancellationPolicy,
  usePublicLocations,
  usePublicPackageLink,
  usePublicPackages,
  usePublicServices,
  usePublicStaff,
  useStartPublicBookingPayment,
  type PublicBookingPayment,
  type PublicBusinessProfile,
} from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import type { AvailabilitySlot, BankTransferInstructions, Booking } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { addCalendarDays } from "@/lib/client-booking";
import {
  EMPTY_CONTACT,
  authenticationSucceeded,
  formatCountdown,
  looksLikeEmail,
  readStoredJourney,
  returnedFromAuthentication,
  splitDisplayName,
  toE164,
  useCountdown,
  writeStoredJourney,
  type JourneyHold,
} from "@/lib/client-journey";
import { THEME_SPECS, effectiveAccent, type BookingPageContent } from "@/lib/client-theme";
import { formatInTz, formatMoney, formatTimeInTz, isoDateInTz } from "@/lib/format";
import { describeDiscount, discountMinorOff } from "@/lib/offer-discount";

type Step = "landing" | "time" | "details" | "review" | "done";

/** How far ahead one availability request looks; the API caps requests at 62 days. */
const WINDOW_DAYS = 28;

const EMPTY_DETAILS: DetailsValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
  promoCode: "",
  marketingConsent: false,
};

export function ClientBookingFlow({
  business,
  page,
  onClearRedirectParams,
  onPickPackage,
}: {
  business: PublicBusinessProfile;
  page: BookingPageContent;
  /** Strips Stripe's redirect parameters once a card return has been handled. */
  onClearRedirectParams: () => void;
  /** Packages are bought through the catalogue flow; the landing hands over to it. */
  onPickPackage: (packageId: string) => void;
}) {
  const businessId = business.id;
  const tz = business.defaultTimezone;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const signedIn = auth.status === "authenticated";

  const [step, setStep] = useState<Step>("landing");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const today = isoDateInTz(new Date().toISOString(), tz);
  const [date, setDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [details, setDetails] = useState<DetailsValues>(EMPTY_DETAILS);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DetailsField, string>>>({});
  const [hold, setHold] = useState<JourneyHold | null>(null);
  const [payment, setPayment] = useState<PublicBookingPayment | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [agreed, setAgreed] = useState(false);
  const [settling, setSettling] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const [bankInstructions, setBankInstructions] = useState<BankTransferInstructions | null>(null);
  const [restoredContact, setRestoredContact] = useState<BookingContact | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInThen, setSignInThen] = useState<"stay" | "account">("stay");
  const [signInStep, setSignInStep] = useState<EmailCodeStep>("email");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [expiredSlot, setExpiredSlot] = useState<AvailabilitySlot | null>(null);
  const submitRef = useRef<CheckoutSubmitHandle>(null);

  const services = usePublicServices(businessId);
  const locations = usePublicLocations(businessId);
  const packages = usePublicPackages(businessId);
  const staff = usePublicStaff(businessId);
  const policy = usePublicCancellationPolicy(businessId);

  // Signed in and a customer here: their details, credits and account link.
  const portalLink = usePortalLink(signedIn);
  const portalBusinesses = usePortalBusinesses(signedIn && portalLink.isFetched);
  const hasAccountHere = (portalBusinesses.data ?? []).some((b) => b.id === businessId);
  const me = usePortalMe(hasAccountHere ? businessId : undefined);
  const credits = usePortalCredits(hasAccountHere ? businessId : undefined);

  const service = services.data?.find((s) => s.id === serviceId) ?? null;
  const serviceStaff = useMemo(
    () =>
      (staff.data ?? []).filter(
        (p) =>
          (p.eligibleServiceIds.length === 0 ||
            (serviceId && p.eligibleServiceIds.includes(serviceId))) &&
          (!locationId || p.locationIds.length === 0 || p.locationIds.includes(locationId)),
      ),
    [staff.data, serviceId, locationId],
  );
  const soleLocationId = locations.data?.length === 1 ? locations.data[0]!.id : null;
  const activeLocationId = locationId ?? soleLocationId ?? locations.data?.[0]?.id ?? null;
  const location = locations.data?.find((l) => l.id === activeLocationId) ?? null;

  // Promo codes are offer-link codes. The link is looked up as typed; a code that
  // names this session with a discount is applied to the hold.
  const promo = usePublicPackageLink(businessId, details.promoCode.trim() || undefined);
  const promoDiscount =
    promo.isSuccess && serviceId && promo.data.services.some((s) => s.id === serviceId)
      ? (promo.data.link.discount ?? null)
      : null;
  const linkCode = promoDiscount ? details.promoCode.trim() : null;
  const promoError = details.promoCode.trim()
    ? promo.isError
      ? "That code isn't valid"
      : promo.isSuccess && !promoDiscount
        ? "This code doesn't apply to this session"
        : null
    : null;

  // One window of availability per service/person/add-ons; the day strip and the
  // chosen day both read from it, so changing day costs nothing.
  const windowStart = date >= addCalendarDays(today, WINDOW_DAYS) ? date : today;
  const availability = usePublicAvailability(businessId, {
    serviceId: serviceId ?? undefined,
    locationId: activeLocationId ?? undefined,
    from: new Date().toISOString(),
    to: `${addCalendarDays(windowStart, WINDOW_DAYS)}T00:00:00.000Z`,
    staffId,
    linkCode,
    additionalServiceIds: extraIds,
    enabled: step === "time" && Boolean(serviceId && activeLocationId),
  });
  const dayCounts = useMemo<DayAvailability | null>(() => {
    if (!availability.data) return null;
    const counts = new Map<string, number>();
    for (const slot of availability.data) {
      const day = isoDateInTz(slot.start, tz);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [availability.data, tz]);
  const daySlots = useMemo(
    () => (availability.data ?? []).filter((s) => isoDateInTz(s.start, tz) === date),
    [availability.data, date, tz],
  );
  const nextAvailableDate = useMemo(() => {
    if (!dayCounts) return null;
    const days = [...dayCounts.keys()].filter((d) => d > date).sort();
    return days[0] ?? null;
  }, [dayCounts, date]);

  // The landing's "Next available" reads one window for the first bookable session.
  const firstService = services.data?.[0] ?? null;
  const landingAvailability = usePublicAvailability(businessId, {
    serviceId: firstService?.id,
    locationId: activeLocationId ?? undefined,
    from: new Date().toISOString(),
    to: `${addCalendarDays(today, 14)}T00:00:00.000Z`,
    enabled: step === "landing" && Boolean(firstService && activeLocationId),
  });
  const nextAvailable = useMemo<NextAvailable>(() => {
    const first = (landingAvailability.data ?? [])
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (!first || !firstService) return null;
    const day = isoDateInTz(first.start, tz);
    const dayLabel =
      day === today
        ? "Today"
        : day === addCalendarDays(today, 1)
          ? "Tomorrow"
          : formatInTz(first.start, tz, { weekday: "short", day: "numeric", month: "short" });
    return { label: `${dayLabel}, ${formatTimeInTz(first.start, tz)}`, serviceId: firstService.id };
  }, [landingAvailability.data, firstService, tz, today]);

  const holdMutation = useCreatePublicBookingHold(businessId);
  const confirmMutation = useConfirmPublicBooking(businessId);
  const paymentMutation = useStartPublicBookingPayment(businessId);
  const creditMutation = useBookWithPortalCredit(hasAccountHere ? businessId : undefined);

  const contact = useMemo<BookingContact>(() => {
    if (restoredContact) return restoredContact;
    const fullName = [details.firstName.trim(), details.lastName.trim()].filter(Boolean).join(" ");
    return {
      name: fullName || null,
      email: details.email.trim() || null,
      phone: toE164(details.phone),
    };
  }, [restoredContact, details.firstName, details.lastName, details.email, details.phone]);

  // Prefill from the account once it is known, without overwriting anything typed.
  useEffect(() => {
    if (restoredContact) return;
    if (hasAccountHere && me.isLoading) return;
    const fromUser = splitDisplayName(auth.user?.name);
    setDetails((d) => ({
      ...d,
      firstName: d.firstName || me.data?.firstName?.trim() || fromUser.first,
      lastName: d.lastName || me.data?.lastName?.trim() || fromUser.last,
      email: d.email || me.data?.emailDisplay?.trim() || auth.user?.email || "",
      phone: d.phone || me.data?.phoneDisplay?.trim() || auth.user?.phone || "",
    }));
  }, [hasAccountHere, me.isLoading, me.data, auth.user, restoredContact]);

  const signedInName = useMemo(() => {
    if (!signedIn) return null;
    const fromMe = [me.data?.firstName, me.data?.lastName].filter(Boolean).join(" ").trim();
    return fromMe || auth.user?.name || auth.user?.email || null;
  }, [signedIn, me.data, auth.user]);

  const eligibleCredit = useMemo(() => {
    if (!hasAccountHere || !serviceId) return null;
    return (
      (credits.data ?? []).find(
        (c) =>
          c.available > 0 &&
          (c.eligibleServiceIds.length === 0 || c.eligibleServiceIds.includes(serviceId)),
      ) ?? null
    );
  }, [hasAccountHere, credits.data, serviceId]);

  const look = useMemo<CheckoutLook>(() => {
    const spec = THEME_SPECS[page.theme];
    return {
      dark: spec.dark,
      accent: effectiveAccent(page),
      radius: `${spec.radius}px`,
      fontFamily: spec.fontBody,
    };
  }, [page]);

  /* ---------- journey helpers ---------- */

  const clearStoredHold = useCallback(() => writeStoredJourney(businessId, null), [businessId]);

  const refreshAvailability = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.publicAvailabilityAll(businessId) });

  const refreshPortal = () => {
    if (!signedIn) return;
    queryClient.removeQueries({ queryKey: queryKeys.portalLink() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalBusinesses() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalBookings(businessId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalCredits(businessId) });
  };

  /** Back to the times after a clash or an expiry: the grid is refreshed and the slot cleared. */
  const reselect = (message: string | null) => {
    if (message) toast.error(message);
    setHold(null);
    setPayment(null);
    setSelectedSlot(null);
    setSettling(false);
    setExpiredSlot(null);
    clearStoredHold();
    setStep("time");
    refreshAvailability();
  };

  const msLeft = useCountdown(hold?.booking.holdExpiresAt ?? null, () => {
    if (step === "done" || settling) return;
    setExpiredSlot(selectedSlot);
    setHold(null);
    setPayment(null);
    clearStoredHold();
  });

  useEffect(() => {
    writeStoredJourney(businessId, hold ? { hold, contact } : null);
  }, [businessId, hold, contact]);

  const optionsFor = (current: JourneyHold | null, priceMinor: number): PayOption[] => {
    const list: PayOption[] = [];
    if (eligibleCredit) {
      list.push({
        key: "credit",
        title: "Use a session credit",
        subtitle: "From your package",
        ...(current ? { disabled: true } : {}),
      });
    }
    if (priceMinor <= 0) return list;
    const card = current
      ? current.onlinePaymentRequired === true
      : business.paymentMethods?.card !== false;
    const bank = current
      ? current.bankTransferAvailable === true
      : business.paymentMethods?.bankTransfer === true;
    if (card)
      list.push({
        key: "card",
        title: "Pay by card now",
        subtitle: "Card, Apple Pay or Google Pay",
      });
    if (!card) {
      list.push({
        key: "in_person",
        title: "Pay on the day",
        subtitle: `Pay ${business.tradingName} at the session`,
      });
    }
    if (bank)
      list.push({
        key: "bank_transfer",
        title: "Bank transfer",
        subtitle: "We email you the details",
      });
    return list;
  };

  const defaultMethodFor = (current: JourneyHold | null, priceMinor: number): PayMethod => {
    if (eligibleCredit && !current) return "credit";
    if (priceMinor <= 0) return "in_person";
    if (current) {
      return current.onlinePaymentRequired
        ? "card"
        : current.bankTransferAvailable
          ? "bank_transfer"
          : "in_person";
    }
    return business.paymentMethods?.card === false
      ? business.paymentMethods.bankTransfer
        ? "bank_transfer"
        : "in_person"
      : "card";
  };

  /* ---------- actions ---------- */

  const pickService = (id: string) => {
    setServiceId(id);
    setStaffId(null);
    setExtraIds([]);
    setSelectedSlot(null);
    setDate(today);
    setStep("time");
    window.scrollTo({ top: 0 });
  };

  const bookNow = () => {
    if (nextAvailable) {
      pickService(nextAvailable.serviceId);
      return;
    }
    if (services.data?.length === 1) {
      pickService(services.data[0]!.id);
      return;
    }
    document.getElementById("sessions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const takeHold = (slot: AvailabilitySlot, after: (held: JourneyHold) => void) => {
    setFieldErrors({});
    holdMutation.mutate(
      {
        slotToken: slot.slotToken,
        linkCode,
        firstName: details.firstName.trim(),
        lastName: details.lastName.trim() || null,
        email: details.email.trim() || null,
        phone: toE164(details.phone) ?? (details.phone.trim() || null),
        notesCustomer: details.notes.trim() || null,
        marketingConsent: details.marketingConsent,
      },
      {
        onSuccess: (res) => {
          const held: JourneyHold = {
            booking: res.booking,
            holdToken: res.holdToken,
            ...(res.onlinePaymentRequired !== undefined
              ? { onlinePaymentRequired: res.onlinePaymentRequired }
              : {}),
            ...(res.bankTransferAvailable !== undefined
              ? { bankTransferAvailable: res.bankTransferAvailable }
              : {}),
            ...(res.amountDueNowMinor !== undefined
              ? { amountDueNowMinor: res.amountDueNowMinor }
              : {}),
          };
          setHold(held);
          setExpiredSlot(null);
          after(held);
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.code === "BOOKING_CONFLICT" || err.isConflict) {
              reselect(
                `Sorry, ${formatTimeInTz(slot.start, tz)} was just booked by someone else. Here are the nearest times.`,
              );
              return;
            }
            if (err.fieldErrors.length > 0) {
              const next: Partial<Record<DetailsField, string>> = {};
              for (const fe of err.fieldErrors) {
                if (fe.field && fe.field in EMPTY_DETAILS) {
                  next[fe.field as DetailsField] = fe.message || "Please check this";
                }
              }
              setFieldErrors(next);
              setStep("details");
              toast.error(err.title || "Please check your details");
              return;
            }
          }
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
        },
      },
    );
  };

  const submitDetails = () => {
    if (!selectedSlot) return;
    setAgreed(false);
    // Back from Review to check a detail, then Continue: the hold is still theirs.
    if (hold && hold.booking.start === selectedSlot.start) {
      setStep("review");
      window.scrollTo({ top: 0 });
      return;
    }
    // A credit needs no hold: the booking is made outright from the slot on confirm.
    if (eligibleCredit) {
      setPayMethod("credit");
      setStep("review");
      window.scrollTo({ top: 0 });
      return;
    }
    takeHold(selectedSlot, (held) => {
      setPayMethod(defaultMethodFor(held, held.booking.priceMinor));
      setStep("review");
      window.scrollTo({ top: 0 });
    });
  };

  const choosePayMethod = (method: PayMethod) => {
    if (method !== "credit" && !hold && selectedSlot) {
      // Leaving the credit path means the time must now be held like any other booking.
      takeHold(selectedSlot, (held) => {
        const allowed = optionsFor(held, held.booking.priceMinor).map((o) => o.key);
        setPayMethod(
          allowed.includes(method) ? method : defaultMethodFor(held, held.booking.priceMinor),
        );
      });
      return;
    }
    setPayMethod(method);
  };

  const finish = (booking: Booking, bank: BankTransferInstructions | null) => {
    setConfirmed(booking);
    setBankInstructions(bank);
    setSettling(false);
    setHold(null);
    clearStoredHold();
    refreshPortal();
    refreshAvailability();
    setStep("done");
    window.scrollTo({ top: 0 });
  };

  const confirmHold = () => {
    if (!hold) return;
    const viaBank = payMethod === "bank_transfer" && hold.bankTransferAvailable === true;
    confirmMutation.mutate(
      {
        bookingId: hold.booking.id,
        holdToken: hold.holdToken,
        ...(viaBank ? { paymentMethod: "bank_transfer" as const } : {}),
      },
      {
        onSuccess: ({ booking, bankTransfer }) => finish(booking, bankTransfer ?? null),
        onError: (err) => {
          if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
            reselect("That time is no longer available. Please choose another.");
            return;
          }
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
        },
      },
    );
  };

  const confirmWithCredit = async () => {
    if (!selectedSlot) return;
    try {
      const booking = await creditMutation.mutateAsync({
        slotToken: selectedSlot.slotToken,
        notesCustomer: details.notes.trim() || null,
      });
      finish(booking, null);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
        reselect(
          `Sorry, ${formatTimeInTz(selectedSlot.start, tz)} was just booked by someone else. Here are the nearest times.`,
        );
      }
      // Other failures were already toasted by the mutation.
    }
  };

  const onConfirm = () => {
    if (payMethod === "credit") void confirmWithCredit();
    else confirmHold();
  };

  /**
   * A paid booking is confirmed by Stripe's webhook, so after the card clears the
   * confirm endpoint is asked until it stops answering 422 (payment still settling).
   */
  const awaitConfirmation = async (current: JourneyHold) => {
    setSettling(true);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const { booking } = await confirmMutation.mutateAsync({
          bookingId: current.booking.id,
          holdToken: current.holdToken,
        });
        finish(booking, null);
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

  const startPayment = async (current: JourneyHold) => {
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

  // Asking for the intent also extends the hold, so the card form has the full window.
  useEffect(() => {
    if (step !== "review" || !hold?.onlinePaymentRequired || payMethod !== "card") return;
    if (payment || paymentMutation.isPending || settling) return;
    void startPayment(hold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hold, payment, settling, payMethod]);

  // Card authentication goes to the bank and back to a fresh page: rebuild from storage.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !returnedFromAuthentication()) return;
    resumed.current = true;
    const stored = readStoredJourney(businessId);
    if (!stored) return;
    setHold(stored.hold);
    setRestoredContact(stored.contact);
    setServiceId(stored.hold.booking.serviceSnapshot.serviceId);
    setStep("review");
    setPayMethod("card");
    setAgreed(true);
    if (authenticationSucceeded()) void awaitConfirmation(stored.hold);
    else setPayment(null);
    onClearRedirectParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const bookAnother = () => {
    setConfirmed(null);
    setBankInstructions(null);
    setSelectedSlot(null);
    setExtraIds([]);
    setPayment(null);
    setAgreed(false);
    setRestoredContact(null);
    setDetails((d) => ({ ...d, notes: "", promoCode: "" }));
    setStep("landing");
    window.scrollTo({ top: 0 });
  };

  const openSignIn = (then: "stay" | "account") => {
    setSignInThen(then);
    setSignInOpen(true);
  };

  const onSignedIn = () => {
    setSignInOpen(false);
    refreshPortal();
    if (signInThen === "account") void navigate({ to: "/account" });
  };

  const detailsComplete =
    details.firstName.trim().length > 0 &&
    details.lastName.trim().length > 0 &&
    looksLikeEmail(details.email) &&
    details.phone.trim().length > 0 &&
    !(details.promoCode.trim() && promo.isPending);

  /* ---------- derived display ---------- */

  const booking = confirmed ?? hold?.booking ?? null;
  const summaryStart = booking?.start ?? selectedSlot?.start ?? null;
  const summaryEnd = booking?.end ?? selectedSlot?.end ?? null;
  const staffFor = (id: string | null | undefined) =>
    id ? (staff.data?.find((p) => p.id === id)?.displayName ?? null) : null;
  const serviceName = service?.name ?? booking?.serviceSnapshot.name ?? "Session";
  const extrasChosen = (service?.upsells ?? []).filter((u) => extraIds.includes(u.serviceId));
  const extrasPrice = extrasChosen.reduce((sum, u) => sum + u.priceMinor, 0);
  const slotPrice = selectedSlot?.priceMinor ?? service?.basePriceMinor ?? 0;
  const listPrice = (selectedSlot?.listPriceMinor ?? slotPrice) + extrasPrice;
  const previewPrice =
    slotPrice + extrasPrice - (promoDiscount ? discountMinorOff(promoDiscount, slotPrice) : 0);
  const cancellationHours = business.cancellationWindowHours ?? 0;
  const deadlineFor = (start: string | null) =>
    start && cancellationHours > 0
      ? new Date(new Date(start).getTime() - cancellationHours * 3_600_000).toISOString()
      : null;
  const address = page.venue.address ?? business.address ?? null;

  const whenLabel = summaryStart
    ? `${formatInTz(summaryStart, tz, { weekday: "short", day: "numeric", month: "short" })}, ${formatTimeInTz(summaryStart, tz)}`
    : "";

  const reviewSummary: ReviewSummary | null =
    summaryStart && summaryEnd
      ? {
          serviceName,
          extras: booking
            ? booking.lineItems.slice(1).map((li) => ({ name: li.name, priceMinor: li.priceMinor }))
            : extrasChosen.map((u) => ({ name: u.name, priceMinor: u.priceMinor })),
          staffName: staffFor(booking?.staffId ?? selectedSlot?.staffId ?? staffId),
          locationName: location?.name ?? null,
          address,
          start: summaryStart,
          end: summaryEnd,
          timezone: booking?.timezone ?? tz,
          priceMinor: booking ? booking.priceMinor : previewPrice,
          currency: booking?.currency ?? selectedSlot?.currency ?? business.currency,
          listPriceMinor: booking
            ? booking.adjustmentMinor < 0
              ? booking.priceMinor - booking.adjustmentMinor
              : null
            : promoDiscount || listPrice !== previewPrice
              ? listPrice
              : null,
          depositMinor:
            booking?.depositMinor != null &&
            booking.depositMinor > 0 &&
            booking.depositMinor < booking.priceMinor
              ? booking.depositMinor
              : null,
        }
      : null;

  const promoLabel =
    promoDiscount && details.promoCode.trim()
      ? `${details.promoCode.trim()} · ${describeDiscount(promoDiscount, business.currency)}`
      : null;

  const confirmationExtras: ConfirmationExtra[] = confirmed
    ? (service?.upsells ?? [])
        .filter((u) => !confirmed.lineItems.some((li) => li.serviceId === u.serviceId))
        .slice(0, 2)
        .map((u) => ({
          serviceId: u.serviceId,
          name: u.name,
          durationMinutes: u.durationMinutes,
          priceMinor: u.priceMinor,
          currency: u.currency,
        }))
    : [];

  const heldBadge =
    msLeft !== null ? (
      <span className="rounded-full bg-primary-soft px-3 py-1 text-[13px] font-semibold tabular-nums text-primary">
        Held for {formatCountdown(msLeft)}
      </span>
    ) : null;

  const stepNumber = step === "time" ? 1 : step === "details" ? 2 : step === "review" ? 3 : 0;

  /* ---------- render ---------- */

  return (
    <ClientTheme page={page}>
      <main className="min-h-screen pb-6">
        <DesktopTopBar
          name={business.tradingName}
          logoUrl={business.branding.logoUrl}
          step={stepNumber}
          onHome={() => {
            if (step === "review" && hold) return;
            setStep("landing");
          }}
          trailing={step === "review" ? heldBadge : null}
        />

        {step === "landing" ? (
          <ClientLanding
            business={business}
            page={page}
            services={services.data ?? []}
            packages={packages.data?.packages ?? []}
            staff={staff.data ?? []}
            locations={locations.data ?? []}
            nextAvailable={nextAvailable}
            onPickService={pickService}
            onPickPackage={onPickPackage}
            onBookNow={bookNow}
            onSignIn={() => openSignIn("stay")}
            signedInName={hasAccountHere ? signedInName : null}
            onAccount={() => void navigate({ to: "/account" })}
            cancellationWindowHours={cancellationHours}
          />
        ) : null}

        {step === "time" && service ? (
          <ClientDateTime
            service={service}
            timezone={tz}
            staff={serviceStaff}
            staffId={staffId}
            onStaff={(id) => {
              setStaffId(id);
              setSelectedSlot(null);
            }}
            locations={locations.data ?? []}
            locationId={activeLocationId}
            onLocation={(id) => {
              setLocationId(id);
              setSelectedSlot(null);
            }}
            extras={service.upsells ?? []}
            extraIds={extraIds}
            onToggleExtra={(id) => {
              setExtraIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
              setSelectedSlot(null);
            }}
            date={date}
            onDate={(d) => {
              setDate(d);
              setSelectedSlot(null);
            }}
            today={today}
            horizonDays={WINDOW_DAYS}
            dayCounts={dayCounts}
            slots={daySlots}
            loading={availability.isFetching}
            selected={selectedSlot}
            onSelect={setSelectedSlot}
            onBack={() => setStep("landing")}
            onContinue={() => {
              if (!selectedSlot) return;
              setStep("details");
              window.scrollTo({ top: 0 });
            }}
            onWaitlist={() => setWaitlistOpen(true)}
            nextAvailableDate={nextAvailableDate}
            priceMinor={previewPrice}
            currency={selectedSlot?.currency ?? service.currency}
          />
        ) : null}

        {step === "details" && service && selectedSlot ? (
          <ClientDetails
            values={details}
            onChange={(patch) => {
              setDetails((d) => ({ ...d, ...patch }));
              const touched = Object.keys(patch) as (keyof DetailsValues)[];
              setFieldErrors((errs) => {
                const next = { ...errs };
                for (const k of touched) delete next[k as DetailsField];
                return next;
              });
            }}
            errors={fieldErrors}
            whenLabel={whenLabel}
            summaryCaption={`${service.name} · ${previewPrice === 0 ? "Free" : formatMoney(previewPrice, selectedSlot.currency)}`}
            onBack={() => (hold ? reselect(null) : setStep("time"))}
            onChangeTime={() => (hold ? reselect(null) : setStep("time"))}
            onContinue={submitDetails}
            canContinue={detailsComplete}
            pending={holdMutation.isPending}
            signedInAs={hasAccountHere ? signedInName : null}
            onSignIn={() => openSignIn("stay")}
            onNotYou={() => void auth.signOut()}
            promoApplied={
              promoLabel ? `${describeDiscount(promoDiscount!, business.currency)} applied` : null
            }
            promoError={promoError}
          />
        ) : null}

        {step === "review" && reviewSummary ? (
          <ClientReview
            summary={reviewSummary}
            msLeft={hold ? msLeft : null}
            bookingAs={hasAccountHere ? signedInName : null}
            onNotYou={() => void auth.signOut()}
            options={optionsFor(hold, reviewSummary.priceMinor)}
            payMethod={payMethod}
            onPayMethod={choosePayMethod}
            creditNote={
              eligibleCredit
                ? `You have ${eligibleCredit.available} left · use by ${formatInTz(eligibleCredit.expiresAt, tz, { day: "numeric", month: "short", year: "numeric" })}`
                : null
            }
            payment={payment}
            paymentPending={paymentMutation.isPending}
            contact={contact}
            look={look}
            onPaid={async () => {
              if (hold) await awaitConfirmation(hold);
            }}
            policy={{
              deadline: deadlineFor(reviewSummary.start),
              businessName: business.tradingName,
              onOpen: policy.data?.content ? () => setPolicyOpen(true) : null,
            }}
            agreed={agreed}
            onAgreed={setAgreed}
            promoLabel={promoLabel}
            // The time stays held while they look at their details again.
            onBack={() => setStep("details")}
            onEdit={() => reselect(null)}
            onConfirm={onConfirm}
            confirming={
              confirmMutation.isPending || creditMutation.isPending || holdMutation.isPending
            }
            settling={settling}
            cardReady={cardReady}
            onCardReady={setCardReady}
            submitRef={submitRef}
          />
        ) : null}

        {step === "done" && confirmed ? (
          <ClientConfirmation
            booking={confirmed}
            businessName={business.tradingName}
            serviceName={confirmed.serviceSnapshot.name}
            staffName={staffFor(confirmed.staffId)}
            locationName={locations.data?.find((l) => l.id === confirmed.locationId)?.name ?? null}
            address={address}
            parkingNote={page.venue.parkingNote}
            email={contact.email}
            phoneGiven={Boolean(contact.phone)}
            bankTransfer={bankInstructions}
            deadline={deadlineFor(confirmed.start)}
            extras={confirmationExtras}
            onAddExtra={(id) => {
              // Extras ride on a session, so booking one means a quick follow-on booking.
              setServiceId(id);
              setStaffId(confirmed.staffId);
              setExtraIds([]);
              setSelectedSlot(null);
              setDate(isoDateInTz(confirmed.end, tz));
              setStep("time");
              window.scrollTo({ top: 0 });
            }}
            hasAccount={hasAccountHere}
            onManage={() => void navigate({ to: "/account" })}
            onCreateAccount={() => openSignIn("account")}
            onBookAnother={bookAnother}
          />
        ) : null}
      </main>

      {service ? (
        <JoinWaitlistSheet
          open={waitlistOpen}
          onOpenChange={setWaitlistOpen}
          businessId={businessId}
          serviceId={service.id}
          serviceName={service.name}
          locationId={activeLocationId}
          date={date}
          contact={{
            firstName: details.firstName,
            lastName: details.lastName,
            email: details.email,
            phone: details.phone,
          }}
          studioName={business.tradingName}
        />
      ) : null}

      <ClientSheet
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title={signInStep === "code" ? "Check your email" : "Sign in"}
        description={
          signInStep === "code" ? undefined : "We'll email you a code. No password needed."
        }
      >
        <EmailCodeSignIn
          defaultEmail={details.email}
          onSignedIn={onSignedIn}
          onStepChange={(step) => setSignInStep(step)}
        />
      </ClientSheet>

      <ClientSheet
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        title="Cancellation policy"
        description={
          cancellationHours > 0
            ? `${business.tradingName} lets you move or cancel free of charge up to ${cancellationHours} hours before.`
            : undefined
        }
      >
        <p className="whitespace-pre-line text-[15px] leading-relaxed">{policy.data?.content}</p>
      </ClientSheet>

      <ClientSheet
        open={Boolean(expiredSlot) && step !== "done"}
        onOpenChange={(open) => {
          if (!open) reselect(null);
        }}
        title="Your held time ran out"
        description={
          expiredSlot
            ? `We held ${formatTimeInTz(expiredSlot.start, tz)} for 10 minutes. Good news: you can hold it again if it's still free.`
            : undefined
        }
      >
        <div className="flex flex-col items-center gap-3 pt-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-card ring-1 ring-border">
            <Timer className="h-6 w-6" />
          </span>
          <PrimaryButton
            full
            disabled={holdMutation.isPending}
            onClick={() => {
              if (!expiredSlot) return;
              takeHold(expiredSlot, (held) => {
                setPayment(null);
                setPayMethod(defaultMethodFor(held, held.booking.priceMinor));
                setStep("review");
              });
            }}
          >
            {holdMutation.isPending ? "Holding…" : "Hold it again"}
          </PrimaryButton>
          <InkButton full onClick={() => reselect(null)}>
            Pick another time
          </InkButton>
        </div>
      </ClientSheet>
    </ClientTheme>
  );
}
