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
import { ClientBookingCard } from "@/components/client/ClientBookingCard";
import { ClientConfirmation, type ConfirmationExtra } from "@/components/client/ClientConfirmation";
import { ClientDateTime, type DayAvailability } from "@/components/client/ClientDateTime";
import {
  ClientDetails,
  type DetailsField,
  type DetailsSummary,
  type DetailsValues,
} from "@/components/client/ClientDetails";
import { ClientLanding, type NextAvailable } from "@/components/client/ClientLanding";
import {
  CLIENT_DESKTOP_QUERY,
  ClientSheet,
  ClientTheme,
  DesktopTopBar,
  InkButton,
  PrimaryButton,
  TextLink,
} from "@/components/client/ClientPage";
import {
  ClientReview,
  type PayMethod,
  type PayOption,
  type PromoState,
  type ReviewSummary,
} from "@/components/client/ClientReview";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api";
import { toastApiError } from "@/lib/api/errors";
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
  usePublicReviews,
  usePublicStaff,
  useReleasePublicBookingHold,
  useStartPublicBookingPayment,
  type PublicBookingPayment,
  type PublicBusinessProfile,
} from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import type { AvailabilitySlot, BankTransferInstructions, Booking } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { addCalendarDays, nextAvailableLabel, shortPlace } from "@/lib/client-booking";
import {
  EMPTY_CONTACT,
  authenticationSucceeded,
  formatCountdown,
  looksLikeEmail,
  nationalPhone,
  readStoredJourney,
  returnedFromAuthentication,
  splitDisplayName,
  toE164,
  isTooLateToHold,
  useCountdown,
  useNow,
  writeStoredJourney,
  type JourneyHold,
  price,
} from "@/lib/client-journey";
import {
  THEME_SPECS,
  effectiveAccent,
  sectionEnabled,
  type BookingPageContent,
} from "@/lib/client-theme";
import { formatInTz, formatTimeInTz, isoDateInTz } from "@/lib/format";
import { describeDiscount, discountMinorOff } from "@/lib/offer-discount";

type Step = "landing" | "time" | "details" | "review" | "done";

/** How far ahead one availability request looks; the API caps requests at 62 days. */
const WINDOW_DAYS = 28;
/** The desktop month calendar loads its whole horizon in one go. */
const DESKTOP_WINDOW_DAYS = 56;

/** "Now", rounded down to five minutes, so it is a stable query input. */
function availabilityWindowStart(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
  return d.toISOString();
}

const EMPTY_DETAILS: DetailsValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
  promoCode: "",
  marketingConsent: false,
};

/**
 * Where to drop someone who arrives already knowing what they want: the account's
 * calendar hands over a session, a day and — when they tapped one — a time.
 */
export type BookingStart = {
  serviceId: string;
  locationId: string | null;
  /** YYYY-MM-DD in the business's timezone. */
  date: string | null;
  /** ISO start of the time they picked; matched against live availability. */
  startAt: string | null;
};

export function ClientBookingFlow({
  business,
  page,
  start = null,
  onStarted,
  onClearRedirectParams,
  onPickPackage,
}: {
  business: PublicBusinessProfile;
  page: BookingPageContent;
  /** A session (and maybe a day and time) chosen before arriving, e.g. from the account. */
  start?: BookingStart | null;
  /** Called once `start` has been applied, so the caller can drop it from the URL. */
  onStarted?: () => void;
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
  // Desktop: the landing carries the booking card, so "choose a time" is not a
  // separate screen and the other steps sit beside a summary card.
  const desktop = useMediaQuery(CLIENT_DESKTOP_QUERY);
  const layout = desktop ? "desktop" : "phone";

  const [step, setStep] = useState<Step>("landing");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  // Availability is keyed on its `from`; a fresh timestamp each render would make
  // every render a new query and refetch without end, so the window starts on a
  // five-minute boundary that stays put between renders.
  const fromIso = availabilityWindowStart();
  const today = isoDateInTz(fromIso, tz);
  const [date, setDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [details, setDetails] = useState<DetailsValues>(EMPTY_DETAILS);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DetailsField, string>>>({});
  const [hold, setHold] = useState<JourneyHold | null>(null);
  /** The promo code the current hold was priced with, so a new code re-holds once. */
  const [heldCode, setHeldCode] = useState<string | null>(null);
  const [reholding, setReholding] = useState(false);
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
  const reviews = usePublicReviews(businessId, sectionEnabled(page, "reviews"));
  const policy = usePublicCancellationPolicy(businessId);

  // Signed in and a customer here: their details, credits and account link.
  const portalLink = usePortalLink(signedIn);
  const portalBusinesses = usePortalBusinesses(signedIn && portalLink.isFetched);
  const hasAccountHere = (portalBusinesses.data ?? []).some((b) => b.id === businessId);
  const me = usePortalMe(hasAccountHere ? businessId : undefined);
  const credits = usePortalCredits(hasAccountHere ? businessId : undefined);

  const service = services.data?.find((s) => s.id === serviceId) ?? null;
  const selectedPackage = packages.data?.packages.find((p) => p.id === selectedPackageId) ?? null;

  // Desktop opens with the first session chosen, so the card shows times straight away.
  useEffect(() => {
    if (!desktop || serviceId || selectedPackageId) return;
    const first = services.data?.[0];
    if (first) setServiceId(first.id);
  }, [desktop, serviceId, selectedPackageId, services.data]);

  // Arriving from the account with a session already chosen: open on its times
  // (the day they were looking at, if any) instead of the landing. Declared after
  // the desktop default above so this choice is the one that sticks.
  const startApplied = useRef(false);
  const [pendingStartAt, setPendingStartAt] = useState<string | null>(null);
  useEffect(() => {
    if (startApplied.current || !start || !services.data || !locations.data) return;
    startApplied.current = true;
    onStarted?.();
    if (!services.data.some((s) => s.id === start.serviceId)) return;
    setSelectedPackageId(null);
    setServiceId(start.serviceId);
    if (start.locationId && locations.data.some((l) => l.id === start.locationId)) {
      setLocationId(start.locationId);
    }
    if (start.date && start.date >= today) setDate(start.date);
    setPendingStartAt(start.startAt);
    setStep(desktop ? "landing" : "time");
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, services.data, locations.data]);

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
  const windowDays = desktop ? DESKTOP_WINDOW_DAYS : WINDOW_DAYS;
  const windowStart = date >= addCalendarDays(today, windowDays) ? date : today;
  const choosingTime = step === "time" || (desktop && step === "landing");
  const availability = usePublicAvailability(businessId, {
    serviceId: serviceId ?? undefined,
    locationId: activeLocationId ?? undefined,
    from: fromIso,
    to: `${addCalendarDays(windowStart, windowDays)}T00:00:00.000Z`,
    staffId,
    linkCode,
    additionalServiceIds: extraIds,
    enabled: choosingTime && Boolean(serviceId && activeLocationId),
  });
  // The whole window takes the API a while for a busy session (it works day by
  // day), so the day on screen is asked for on its own first and its times show
  // straight away; the wide window fills in the day counts behind it. The window
  // is a day either side in UTC so any timezone's local day is inside it.
  const dayWindow = usePublicAvailability(businessId, {
    serviceId: serviceId ?? undefined,
    locationId: activeLocationId ?? undefined,
    from: date > today ? `${addCalendarDays(date, -1)}T12:00:00.000Z` : fromIso,
    to: `${addCalendarDays(date, 1)}T12:00:00.000Z`,
    staffId,
    linkCode,
    additionalServiceIds: extraIds,
    enabled: choosingTime && Boolean(serviceId && activeLocationId) && !availability.data,
  });
  // Times are fetched once and sit on screen while the clock moves on. Without
  // this, a page left open past 09:00 still offers 09:00, and tapping it is
  // refused by the server. Every slot on screen is checked against a clock that
  // ticks every half minute, so the past falls away on its own.
  const now = useNow(choosingTime || step === "details" ? 30_000 : null);
  const upcoming = useCallback(
    (slots: readonly AvailabilitySlot[] | undefined | null) =>
      (slots ?? []).filter((s) => Date.parse(s.start) > now),
    [now],
  );
  const slotSource = availability.data ?? dayWindow.data ?? null;
  const timesLoading = availability.data ? availability.isFetching : dayWindow.isFetching;
  const dayCounts = useMemo<DayAvailability | null>(() => {
    if (!availability.data) return null;
    const counts = new Map<string, number>();
    for (const slot of upcoming(availability.data)) {
      const day = isoDateInTz(slot.start, tz);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [availability.data, tz, upcoming]);
  const daySlots = useMemo(
    () => upcoming(slotSource).filter((s) => isoDateInTz(s.start, tz) === date),
    [slotSource, date, tz, upcoming],
  );
  const nextAvailableDate = useMemo(() => {
    if (!dayCounts) return null;
    const days = [...dayCounts.keys()].filter((d) => d > date).sort();
    return days[0] ?? null;
  }, [dayCounts, date]);

  // The time they tapped on the account calendar is only a time; the slot token
  // that holds it comes from this page's own availability, so wait for that.
  useEffect(() => {
    if (!pendingStartAt) return;
    // Placeholder data is another day's times kept on screen; wait for the real ones.
    const fresh = [availability, dayWindow].find((q) => q.isSuccess && !q.isPlaceholderData);
    if (!fresh?.data) return;
    setPendingStartAt(null);
    const match = fresh.data.find((s) => s.start === pendingStartAt);
    if (!match) {
      toast.error(
        `Sorry, ${formatTimeInTz(pendingStartAt, tz)} has just gone. Here are the nearest times.`,
      );
      return;
    }
    setSelectedSlot(match);
    setStep("details");
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStartAt, availability.data, dayWindow.data]);

  // The landing's "Next available" reads one window for the first bookable session.
  const firstService = services.data?.[0] ?? null;
  const landingAvailability = usePublicAvailability(businessId, {
    serviceId: firstService?.id,
    locationId: activeLocationId ?? undefined,
    from: fromIso,
    to: `${addCalendarDays(today, 14)}T00:00:00.000Z`,
    // The desktop card shows the times themselves, so no separate peek is needed.
    enabled: !desktop && step === "landing" && Boolean(firstService && activeLocationId),
  });
  const nextAvailable = useMemo<NextAvailable>(() => {
    const first = upcoming(landingAvailability.data)
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (!first || !firstService) return null;
    return { label: nextAvailableLabel(first.start, tz, today), serviceId: firstService.id };
  }, [landingAvailability.data, firstService, tz, today, upcoming]);

  const holdMutation = useCreatePublicBookingHold(businessId);
  const releaseMutation = useReleasePublicBookingHold(businessId);
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
      phone: d.phone || nationalPhone(me.data?.phoneDisplay?.trim() || auth.user?.phone || ""),
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

  /** Hands a held time back so nobody waits ten minutes for it; best effort. */
  const releaseHold = (current: JourneyHold | null) => {
    if (!current || current.booking.status !== "held") return Promise.resolve(false);
    return releaseMutation
      .mutateAsync({ bookingId: current.booking.id, holdToken: current.holdToken })
      .catch(() => false);
  };

  /** Back to the times after a clash or an expiry: the grid is refreshed and the slot cleared. */
  const reselect = (message: string | null) => {
    if (message) toast.error(message);
    void releaseHold(hold).then(() => refreshAvailability());
    setHold(null);
    setHeldCode(null);
    setPayment(null);
    setSelectedSlot(null);
    setSettling(false);
    setExpiredSlot(null);
    clearStoredHold();
    // The desktop landing carries the booking card; the phone has its own screen.
    setStep(desktop ? "landing" : "time");
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
        title: "Pay now",
        subtitle: "Card, Apple Pay, Google Pay",
      });
    // Paying at the session is only on offer when the business does not insist
    // on payment up front; the confirm call would refuse it otherwise.
    if (!card) {
      list.push({
        key: "in_person",
        title: "Pay on the day",
        subtitle: "At your session",
      });
    }
    if (bank)
      list.push({
        key: "bank_transfer",
        title: "Bank transfer",
        subtitle: "Details sent by email",
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
    setSelectedPackageId(null);
    if (id === serviceId && desktop) return;
    setServiceId(id);
    setStaffId(null);
    setExtraIds([]);
    setSelectedSlot(null);
    setDate(today);
    if (desktop) return;
    setStep("time");
    window.scrollTo({ top: 0 });
  };

  // Desktop: a package is a radio row like the sessions, and the card becomes its
  // buy card. Phone: straight through to the package checkout.
  const pickPackage = (id: string) => {
    if (!desktop) {
      onPickPackage(id);
      return;
    }
    setSelectedPackageId(id);
    setSelectedSlot(null);
  };

  const bookNow = () => {
    if (desktop) {
      document.getElementById("booking-card")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
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

  const takeHold = (
    slot: AvailabilitySlot,
    after: (held: JourneyHold) => void,
    onFail?: () => void,
  ) => {
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
          setHeldCode(linkCode);
          setExpiredSlot(null);
          after(held);
        },
        onError: (err) => {
          onFail?.();
          if (err instanceof ApiError) {
            if (err.code === "BOOKING_CONFLICT" || err.isConflict) {
              reselect(
                `Sorry, ${formatTimeInTz(slot.start, tz)} was just booked by someone else. Here are the nearest times.`,
              );
              return;
            }
            // The time passed (or slid inside the notice window) while they typed.
            if (isTooLateToHold(err)) {
              reselect(
                `Sorry, ${formatTimeInTz(slot.start, tz)} has just gone. Here are the nearest times.`,
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
          toastApiError(err, "Couldn't hold that time");
        },
      },
    );
  };

  const submitDetails = () => {
    if (!selectedSlot) return;
    if (Date.parse(selectedSlot.start) <= Date.now()) {
      reselect(
        `Sorry, ${formatTimeInTz(selectedSlot.start, tz)} has just gone. Here are the nearest times.`,
      );
      return;
    }
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
          toastApiError(err, "Something went wrong");
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
          toastApiError(err, "Something went wrong");
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
      toastApiError(err, "We couldn't start the payment. Please try again.");
    }
  };

  // Asking for the intent also extends the hold, so the card form has the full window.
  useEffect(() => {
    if (step !== "review" || !hold?.onlinePaymentRequired || payMethod !== "card") return;
    if (payment || paymentMutation.isPending || settling) return;
    void startPayment(hold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hold, payment, settling, payMethod]);

  // A promo code applied on Review changes the price, and a hold's price is fixed
  // when it is taken: give the held time back and hold it again with the code.
  useEffect(() => {
    if (step !== "review" || !hold || !selectedSlot || reholding || settling) return;
    if (promo.isPending && details.promoCode.trim()) return;
    if (linkCode === heldCode) return;
    if (hold.booking.start !== selectedSlot.start) return;
    setReholding(true);
    const previous = hold;
    void releaseHold(previous).then(() => {
      setPayment(null);
      takeHold(
        selectedSlot,
        (held) => {
          setReholding(false);
          setPayMethod((m) => {
            const allowed = optionsFor(held, held.booking.priceMinor).map((o) => o.key);
            return allowed.includes(m) ? m : defaultMethodFor(held, held.booking.priceMinor);
          });
        },
        () => setReholding(false),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hold, selectedSlot, linkCode, heldCode, promo.isPending, reholding, settling]);

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
  // "Northside Studio, LS6": the venue and the outward half of its postcode.
  const whereLabel = location
    ? [location.name, location.type === "physical" ? shortPlace(address)?.split(" ").pop() : null]
        .filter(Boolean)
        .join(", ")
    : null;
  const bookingFor =
    [details.firstName.trim(), details.lastName.trim()].filter(Boolean).join(" ") ||
    contact.name ||
    null;

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
          bookingFor,
          // The trainer is assigned on confirm; until then "Any trainer" unless they chose one.
          staffName: staffFor(confirmed ? confirmed.staffId : staffId),
          locationName: location?.name ?? null,
          address,
          where: whereLabel,
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
  const promoState: PromoState = {
    code: details.promoCode.trim(),
    label: promoLabel,
    error: promoError,
    pending: reholding || (Boolean(details.promoCode.trim()) && promo.isPending),
    onApply: (code) => setDetails((d) => ({ ...d, promoCode: code.toUpperCase() })),
  };

  const detailsSummary: DetailsSummary | null =
    service && selectedSlot
      ? {
          page,
          businessName: business.tradingName,
          serviceName: service.name,
          start: selectedSlot.start,
          end: selectedSlot.end,
          timezone: tz,
          durationMinutes: service.durationMinutes,
          staffName: staffFor(staffId),
          where: whereLabel,
          priceMinor: previewPrice,
          currency: selectedSlot.currency,
          msLeft: hold ? msLeft : null,
        }
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

  // On desktop the landing is also the "choose" step, so the stepper starts at Details.
  const onLanding = step === "landing" || (desktop && step === "time");
  const stepNumber = step === "time" ? 1 : step === "details" ? 2 : step === "review" ? 3 : 0;

  const myBookings = (
    <TextLink
      className="text-[14px] font-medium no-underline hover:underline"
      onClick={() => (signedIn ? void navigate({ to: "/account" }) : openSignIn("account"))}
    >
      My bookings
    </TextLink>
  );
  const topBarTrailing = onLanding ? (
    <>
      {myBookings}
      <InkButton onClick={bookNow} className="h-10 px-5 text-[14px]">
        Book
      </InkButton>
    </>
  ) : step === "details" ? (
    signedInName ? (
      <span className="text-[14px] text-muted-foreground">{signedInName}</span>
    ) : (
      <TextLink
        className="text-[14px] font-medium no-underline hover:underline"
        onClick={() => openSignIn("stay")}
      >
        Sign in
      </TextLink>
    )
  ) : step === "review" ? (
    heldBadge
  ) : (
    myBookings
  );

  const bookingCard = desktop ? (
    <div id="booking-card" className="scroll-mt-6">
      <ClientBookingCard
        service={service}
        pkg={selectedPackage}
        timezone={tz}
        staff={serviceStaff}
        staffId={staffId}
        onStaff={(id) => {
          setStaffId(id);
          setSelectedSlot(null);
        }}
        extras={service?.upsells ?? []}
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
        horizonDays={DESKTOP_WINDOW_DAYS}
        dayCounts={dayCounts}
        slots={daySlots}
        allSlots={availability.data ?? []}
        loading={timesLoading}
        selected={selectedSlot}
        onSelect={setSelectedSlot}
        onContinue={() => {
          if (!selectedSlot) return;
          setStep("details");
          window.scrollTo({ top: 0 });
        }}
        onBuyPackage={onPickPackage}
        onWaitlist={() => setWaitlistOpen(true)}
        priceMinor={previewPrice}
        currency={selectedSlot?.currency ?? service?.currency ?? business.currency}
        cancellationWindowHours={cancellationHours}
      />
    </div>
  ) : null;

  /* ---------- render ---------- */

  return (
    <ClientTheme page={page}>
      <main className="min-h-screen pb-6">
        <DesktopTopBar
          name={business.tradingName}
          logoUrl={business.branding.logoUrl}
          step={onLanding ? 0 : stepNumber}
          onHome={() => {
            if (step === "review" && hold) return;
            setStep("landing");
          }}
          trailing={topBarTrailing}
        />

        {onLanding ? (
          <ClientLanding
            business={business}
            page={page}
            services={services.data ?? []}
            packages={packages.data?.packages ?? []}
            staff={staff.data ?? []}
            locations={locations.data ?? []}
            reviews={reviews.data ?? null}
            nextAvailable={nextAvailable}
            onPickService={pickService}
            onPickPackage={pickPackage}
            onBookNow={bookNow}
            onSignIn={() => openSignIn("stay")}
            signedInName={hasAccountHere ? signedInName : null}
            onAccount={() => void navigate({ to: "/account" })}
            cancellationWindowHours={cancellationHours}
            layout={layout}
            selectedServiceId={selectedPackageId ? null : serviceId}
            selectedPackageId={selectedPackageId}
            bookingCard={bookingCard}
          />
        ) : null}

        {step === "time" && !desktop && service ? (
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
            loading={timesLoading}
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

        {step === "details" && service && selectedSlot && detailsSummary ? (
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
            summaryCaption={`${service.name} · ${previewPrice === 0 ? "Free" : price(previewPrice, selectedSlot.currency)}`}
            summary={detailsSummary}
            layout={layout}
            onBack={() => (hold ? reselect(null) : setStep(desktop ? "landing" : "time"))}
            onChangeTime={() => (hold ? reselect(null) : setStep(desktop ? "landing" : "time"))}
            onContinue={submitDetails}
            canContinue={detailsComplete}
            pending={holdMutation.isPending}
            signedInAs={signedInName}
            onSignIn={() => openSignIn("stay")}
            onNotYou={() => void auth.signOut()}
          />
        ) : null}

        {step === "review" && reviewSummary ? (
          <ClientReview
            summary={reviewSummary}
            layout={layout}
            msLeft={hold ? msLeft : null}
            bookingAs={signedInName}
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
            promo={promoState}
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
            layout={layout}
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
              setSelectedPackageId(null);
              setDate(isoDateInTz(confirmed.end, tz));
              setStep(desktop ? "landing" : "time");
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
          signInStep === "code"
            ? undefined
            : "We'll email you a sign-in link and a code. No password needed."
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
