import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  BookingContact,
  CheckoutLook,
  CheckoutSubmitHandle,
} from "@/components/BookingCheckout";
import { EmailCodeSignIn, type EmailCodeStep } from "@/components/EmailCodeSignIn";
import {
  ClientDetails,
  type DetailsField,
  type DetailsValues,
  type PackageDetailsSummary,
} from "@/components/client/ClientDetails";
import {
  CLIENT_DESKTOP_QUERY,
  ClientColumn,
  ClientSheet,
  ClientTheme,
  DesktopTopBar,
  OutlineButton,
  PageTitle,
  TextLink,
} from "@/components/client/ClientPage";
import {
  ClientPackageDone,
  ClientPackageReview,
  type PackageOutcome,
} from "@/components/client/ClientPackageScreens";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api";
import { toastApiError } from "@/lib/api/errors";
import {
  useBuyPublicPackage,
  usePortalBusinesses,
  usePortalLink,
  usePortalMe,
  usePublicPackageLink,
  usePublicPackages,
  useRequestPublicPackage,
  type PublicBusinessProfile,
  type PublicPackage,
  type PublicPackagePayment,
  type PublicPackageRequestReceipt,
} from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-store";
import {
  authenticationSucceeded,
  looksLikeEmail,
  nationalPhone,
  price,
  readStoredPurchase,
  returnedFromAuthentication,
  splitDisplayName,
  toE164,
  writeStoredPurchase,
} from "@/lib/client-journey";
import { THEME_SPECS, effectiveAccent, type BookingPageContent } from "@/lib/client-theme";
import { describeDiscount } from "@/lib/offer-discount";
import { validityLabel } from "@/lib/packages";

type Step = "details" | "review" | "done";

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
 * Buying a package on the client booking page (`?package=<id>`, with `?offer=<code>`
 * alongside when it came from an offer so the offer's price is charged). The landing
 * was the "choose" step, so this opens on Details, then Review and pay — or, at a
 * business without card processing, Review your request — and a Done screen.
 */
export function ClientPackageFlow({
  business,
  page,
  packageId,
  offerCode = null,
  onBack,
  onClearRedirectParams,
}: {
  business: PublicBusinessProfile;
  page: BookingPageContent;
  packageId: string;
  /** The offer link the package came from; its code goes with the purchase. */
  offerCode?: string | null;
  /** Back to the booking page (keeping the offer they arrived by). */
  onBack: () => void;
  /** Strips Stripe's redirect parameters once a card return has been handled. */
  onClearRedirectParams: () => void;
}) {
  const businessId = business.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const signedIn = auth.status === "authenticated";
  const desktop = useMediaQuery(CLIENT_DESKTOP_QUERY);
  const layout = desktop ? "desktop" : "phone";

  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState<DetailsValues>(EMPTY_DETAILS);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DetailsField, string>>>({});
  const [payment, setPayment] = useState<PublicPackagePayment | null>(null);
  const [bought, setBought] = useState(false);
  const [receipt, setReceipt] = useState<PublicPackageRequestReceipt | null>(null);
  const [restoredContact, setRestoredContact] = useState<BookingContact | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInStep, setSignInStep] = useState<EmailCodeStep>("email");
  const submitRef = useRef<CheckoutSubmitHandle>(null);

  const packages = usePublicPackages(businessId);
  const offer = usePublicPackageLink(businessId, offerCode ?? undefined);
  // The offer's copy of the package carries the discounted price and may be one the
  // public list hides, so it is preferred whenever the link names this package.
  const offerPackage = offer.data?.packages.find((p) => p.id === packageId) ?? null;
  const pkg: PublicPackage | null =
    offerPackage ?? packages.data?.packages.find((p) => p.id === packageId) ?? null;
  const linkCode = offerPackage && offerCode ? offerCode : null;
  // No card processing at this business: a package is asked for, not bought.
  const requestMode =
    (offerPackage ? offer.data?.onlinePaymentAvailable : packages.data?.onlinePaymentAvailable) ===
    false;
  const offerLabel =
    offerPackage && offer.data
      ? [offer.data.link.name, describeDiscount(offer.data.link.discount, pkg?.currency ?? "GBP")]
          .filter(Boolean)
          .join(" · ")
      : null;

  // Signed in and a customer here: their details and account link.
  const portalLink = usePortalLink(signedIn);
  const portalBusinesses = usePortalBusinesses(signedIn && portalLink.isFetched);
  const hasAccountHere = (portalBusinesses.data ?? []).some((b) => b.id === businessId);
  const me = usePortalMe(hasAccountHere ? businessId : undefined);

  const buyPackage = useBuyPublicPackage(businessId);
  const requestPackage = useRequestPublicPackage(businessId);

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

  const look = useMemo<CheckoutLook>(() => {
    const spec = THEME_SPECS[page.theme];
    return {
      dark: spec.dark,
      accent: effectiveAccent(page),
      radius: `${spec.radius}px`,
      fontFamily: spec.fontBody,
    };
  }, [page]);

  const refreshPortal = () => {
    if (!signedIn) return;
    queryClient.removeQueries({ queryKey: queryKeys.portalLink() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalBusinesses() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalCredits(businessId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalPurchases(businessId) });
  };

  // The intent is kept across a card's bank authentication so a retry reuses it.
  useEffect(() => {
    writeStoredPurchase(businessId, payment && !bought ? { packageId, payment, contact } : null);
  }, [businessId, packageId, payment, bought, contact]);

  // Card authentication goes to the bank and back to a fresh page: rebuild from storage.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !returnedFromAuthentication()) return;
    resumed.current = true;
    const stored = readStoredPurchase(businessId);
    if (!stored || stored.packageId !== packageId) return;
    setPayment(stored.payment);
    setRestoredContact(stored.contact);
    if (authenticationSucceeded()) {
      // Credits are issued by the webhook; the card clearing is all this page needs.
      setBought(true);
      writeStoredPurchase(businessId, null);
      refreshPortal();
      setStep("done");
    } else {
      // Back to the card form with the original intent, so a retry cannot double-charge.
      setStep("review");
    }
    onClearRedirectParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, packageId]);

  const fieldErrorsFrom = (err: ApiError) => {
    const next: Partial<Record<DetailsField, string>> = {};
    for (const fe of err.fieldErrors) {
      if (fe.field && fe.field in EMPTY_DETAILS) {
        next[fe.field as DetailsField] = fe.message || "Please check this";
      }
    }
    return next;
  };

  /**
   * The package's equivalent of taking a hold: Details turns the buyer into a customer
   * and opens a PaymentIntent, so Review has a card form to render. Nothing to set up
   * when the business cannot take cards: Review shows what will be asked for.
   */
  const submitDetails = async () => {
    if (!pkg) return;
    setFieldErrors({});
    if (requestMode) {
      setStep("review");
      window.scrollTo({ top: 0 });
      return;
    }
    // Back from Review to check a detail, then Continue: the intent is still theirs.
    if (payment) {
      setStep("review");
      window.scrollTo({ top: 0 });
      return;
    }
    try {
      setPayment(
        await buyPackage.mutateAsync({
          packageId: pkg.id,
          linkCode,
          firstName: details.firstName.trim(),
          lastName: details.lastName.trim() || null,
          email: details.email.trim(),
          phone: toE164(details.phone) ?? (details.phone.trim() || null),
          marketingConsent: details.marketingConsent,
        }),
      );
      setStep("review");
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setFieldErrors(fieldErrorsFrom(err));
        toast.error(err.title || "Please check your details");
        return;
      }
      toastApiError(err, "We couldn't start the payment. Please try again.");
    }
  };

  /** Sends the request; the business confirms it from their Packages page. */
  const sendRequest = async () => {
    if (!pkg) return;
    try {
      const res = await requestPackage.mutateAsync({
        packageId: pkg.id,
        linkCode,
        firstName: details.firstName.trim(),
        lastName: details.lastName.trim() || null,
        email: details.email.trim(),
        phone: toE164(details.phone) ?? (details.phone.trim() || null),
        marketingConsent: details.marketingConsent,
        notes: details.notes.trim() || null,
      });
      setReceipt(res);
      refreshPortal();
      setStep("done");
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setFieldErrors(fieldErrorsFrom(err));
        setStep("details");
        toast.error(err.title || "Please check your details");
        return;
      }
      toastApiError(err, "We couldn't send your request. Please try again.");
    }
  };

  const onPaid = async () => {
    setBought(true);
    writeStoredPurchase(businessId, null);
    refreshPortal();
    setStep("done");
    window.scrollTo({ top: 0 });
  };

  const detailsComplete =
    details.firstName.trim().length > 0 &&
    details.lastName.trim().length > 0 &&
    looksLikeEmail(details.email) &&
    details.phone.trim().length > 0;

  const outcome: PackageOutcome | null = bought
    ? { kind: "bought", claimToken: payment?.claimToken ?? null }
    : receipt
      ? { kind: "requested", claimToken: receipt.claimToken }
      : null;

  const summary: PackageDetailsSummary | null = pkg
    ? {
        kind: "package",
        page,
        businessName: business.tradingName,
        packageName: pkg.name,
        creditsIssued: pkg.creditsIssued,
        validity: validityLabel(pkg.validity),
        priceMinor: pkg.priceMinor,
        listPriceMinor: pkg.listPriceMinor ?? null,
        currency: pkg.currency,
        offerLabel,
      }
    : null;

  const loading = packages.isPending || (Boolean(offerCode) && offer.isPending);
  const stepNumber = step === "details" ? 2 : step === "review" ? 3 : 0;

  const topBarTrailing =
    step === "details" ? (
      signedInName ? (
        <span className="text-[14px] text-muted-foreground">{signedInName}</span>
      ) : (
        <TextLink
          className="text-[14px] font-medium no-underline hover:underline"
          onClick={() => setSignInOpen(true)}
        >
          Sign in
        </TextLink>
      )
    ) : step === "done" ? (
      <TextLink
        className="text-[14px] font-medium no-underline hover:underline"
        onClick={() => (signedIn ? void navigate({ to: "/account" }) : setSignInOpen(true))}
      >
        My bookings
      </TextLink>
    ) : null;

  return (
    <ClientTheme page={page}>
      <main className="min-h-screen pb-6">
        <DesktopTopBar
          name={business.tradingName}
          logoUrl={business.branding.logoUrl}
          step={stepNumber}
          onHome={onBack}
          trailing={topBarTrailing}
        />

        {!pkg ? (
          loading ? (
            <ClientColumn className="pt-6">
              <div className="h-9 w-2/3 animate-pulse rounded-lg bg-card" />
              <div className="mt-4 h-16 animate-pulse rounded-[18px] bg-card" />
              <div className="mt-2 h-16 animate-pulse rounded-[18px] bg-card" />
            </ClientColumn>
          ) : (
            <ClientColumn className="pt-10 text-center">
              <PageTitle>This package isn't available</PageTitle>
              <p className="mt-2 text-[15px] text-muted-foreground">
                It may have been taken off sale. Everything {business.tradingName} offers is on the
                booking page.
              </p>
              <OutlineButton className="mt-8" onClick={onBack}>
                Back to {business.tradingName}
              </OutlineButton>
            </ClientColumn>
          )
        ) : null}

        {pkg && summary && step === "details" ? (
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
            whenLabel={pkg.name}
            summaryCaption={`${pkg.creditsIssued} ${pkg.creditsIssued === 1 ? "session" : "sessions"} · ${price(pkg.priceMinor, pkg.currency)}`}
            summary={summary}
            layout={layout}
            onBack={onBack}
            onChangeTime={onBack}
            onContinue={() => void submitDetails()}
            canContinue={detailsComplete}
            pending={buyPackage.isPending}
            pendingLabel="Setting up payment…"
            signedInAs={signedInName}
            onSignIn={() => setSignInOpen(true)}
            onNotYou={() => void auth.signOut()}
          />
        ) : null}

        {pkg && step === "review" ? (
          <ClientPackageReview
            pkg={pkg}
            offerLabel={offerLabel}
            layout={layout}
            mode={requestMode ? "request" : "pay"}
            businessName={business.tradingName}
            bookingAs={signedInName}
            onNotYou={() => void auth.signOut()}
            payment={payment}
            paymentPending={buyPackage.isPending}
            contact={contact}
            look={look}
            onPaid={onPaid}
            notes={details.notes}
            onBack={() => setStep("details")}
            onEdit={onBack}
            onSend={() => void sendRequest()}
            sending={requestPackage.isPending}
            cardReady={cardReady}
            onCardReady={setCardReady}
            submitRef={submitRef}
          />
        ) : null}

        {pkg && step === "done" && outcome ? (
          <ClientPackageDone
            pkg={pkg}
            offerLabel={offerLabel}
            layout={layout}
            outcome={outcome}
            businessName={business.tradingName}
            email={contact.email}
            hasAccount={hasAccountHere}
            onAccount={() => void navigate({ to: "/account" })}
            onClaim={(token) => void navigate({ to: "/claim/$token", params: { token } })}
            onBackToPage={onBack}
          />
        ) : null}
      </main>

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
          onSignedIn={() => {
            setSignInOpen(false);
            refreshPortal();
          }}
          onStepChange={(s) => setSignInStep(s)}
        />
      </ClientSheet>
    </ClientTheme>
  );
}
