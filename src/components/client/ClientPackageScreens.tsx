import { useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
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
  InkButton,
  OutlineButton,
  PageTitle,
  PoweredBy,
  PrimaryButton,
  StepHeader,
  SummaryRow,
  TextLink,
} from "@/components/client/ClientPage";
import type { PublicPackage, PublicPackagePayment } from "@/lib/api/hooks";
import { price } from "@/lib/client-journey";
import { validityLabel } from "@/lib/packages";
import { cn } from "@/lib/utils";

/**
 * The Review and Done screens of buying a package on the client booking page. A
 * package has no time to hold, so Review is the package, who is buying it and the
 * card form (or, at a business without card processing, a request the business
 * confirms and arranges payment for).
 */

/** The package card shared by Review and Done: credits block, name, validity, price lines. */
export function PackageCard({
  pkg,
  offerLabel,
  totalLabel,
  trailing,
  showLines = true,
}: {
  pkg: PublicPackage;
  /** "Autumn offer · 10% off" when a link cut the price. */
  offerLabel: string | null;
  /** "To pay now" / "Paid" / "To arrange with the studio". */
  totalLabel: string;
  trailing?: ReactNode;
  showLines?: boolean;
}) {
  const list = pkg.listPriceMinor ?? pkg.priceMinor;
  const off = list - pkg.priceMinor;
  return (
    <ClientCard className="shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-4 px-5 pt-5 pb-4">
        <div className="flex h-[64px] w-[64px] shrink-0 flex-col items-center justify-center rounded-[calc(var(--radius)-4px)] bg-muted">
          <span className="text-[24px] font-bold leading-none">{pkg.creditsIssued}</span>
          <span className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {pkg.creditsIssued === 1 ? "session" : "sessions"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold leading-tight">{pkg.name}</p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">
            Use within {validityLabel(pkg.validity)}
          </p>
        </div>
        {trailing}
      </div>
      {pkg.description ? (
        <p className="border-t border-border px-5 py-4 text-[14px] leading-relaxed text-foreground/80">
          {pkg.description}
        </p>
      ) : null}
      {showLines ? (
        <div className="border-t border-border px-5 py-4">
          <SummaryRow label={pkg.name} value={price(list, pkg.currency)} />
          {offerLabel && off > 0 ? (
            <SummaryRow label={offerLabel} value={`−${price(off, pkg.currency)}`} />
          ) : null}
          <div className="mt-2 flex items-baseline justify-between pt-1">
            <span className="text-[15px] font-semibold">{totalLabel}</span>
            <span className="text-[22px] font-bold">{price(pkg.priceMinor, pkg.currency)}</span>
          </div>
        </div>
      ) : null}
    </ClientCard>
  );
}

export function ClientPackageReview({
  pkg,
  offerLabel,
  layout,
  mode,
  businessName,
  bookingAs,
  onNotYou,
  payment,
  paymentPending,
  contact,
  look,
  onPaid,
  notes,
  onBack,
  onEdit,
  onSend,
  sending,
  cardReady,
  onCardReady,
  submitRef,
}: {
  pkg: PublicPackage;
  offerLabel: string | null;
  layout: "phone" | "desktop";
  /** `pay` takes a card now; `request` asks the business to confirm and arrange payment. */
  mode: "pay" | "request";
  businessName: string;
  bookingAs: string | null;
  onNotYou: () => void;
  payment: PublicPackagePayment | null;
  paymentPending: boolean;
  contact: BookingContact;
  look: CheckoutLook;
  onPaid: () => Promise<void>;
  /** What they typed under "Anything we should know?", shown back on a request. */
  notes: string;
  onBack: () => void;
  /** Back to the page to pick something else. */
  onEdit: () => void;
  onSend: () => void;
  sending: boolean;
  cardReady: boolean;
  onCardReady: (ready: boolean) => void;
  submitRef: MutableRefObject<CheckoutSubmitHandle>;
}) {
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const onSubmittingRef = useRef(setCardSubmitting);
  const desktop = layout === "desktop";
  const paying = mode === "pay";
  const amount = price(pkg.priceMinor, pkg.currency);

  const primaryLabel = sending
    ? paying
      ? "Taking payment…"
      : "Sending…"
    : cardSubmitting
      ? "Taking payment…"
      : paying
        ? desktop
          ? `Pay ${amount} and get your sessions`
          : `Pay ${amount}`
        : "Send request";
  const primaryDisabled = sending || cardSubmitting || (paying && (!payment || !cardReady));
  const primaryAction = () => {
    if (paying) {
      void submitRef.current?.submit();
      return;
    }
    onSend();
  };

  const card = (
    <PackageCard
      pkg={pkg}
      offerLabel={offerLabel}
      totalLabel={paying ? "To pay now" : `To arrange with ${businessName}`}
      trailing={<TextLink onClick={onEdit}>Edit</TextLink>}
    />
  );

  const bookingAsCard = bookingAs ? (
    <div className="mt-4 flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3">
      <div>
        <p className="text-[13px] text-muted-foreground">Buying as</p>
        <p className="text-[17px] font-semibold">{bookingAs}</p>
      </div>
      <TextLink onClick={onNotYou}>Not you?</TextLink>
    </div>
  ) : null;

  const paymentBlock = paying ? (
    <div className="mt-6 rounded-[var(--radius)] border border-border bg-card p-4">
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
  ) : (
    <div className="mt-6 space-y-3">
      <p className="rounded-[var(--radius)] bg-muted px-4 py-3 text-[14px] text-muted-foreground">
        {businessName} doesn't take card payments online, so nothing is charged now. They'll confirm
        your request and arrange payment with you, and your {pkg.creditsIssued}{" "}
        {pkg.creditsIssued === 1 ? "session" : "sessions"} appear on your account once they do.
      </p>
      {notes.trim() ? (
        <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-[14px]">
          <p className="text-muted-foreground">Your note</p>
          <p className="mt-1 whitespace-pre-wrap">{notes.trim()}</p>
        </div>
      ) : null}
    </div>
  );

  const afterLine = (
    <p className="mt-5 text-[14px] text-muted-foreground">
      {paying
        ? "Your sessions are ready to book straight away. Book them one at a time, whenever suits you."
        : "You'll get an email as soon as the request is confirmed."}
    </p>
  );

  if (desktop) {
    return (
      <ClientColumn wide className="pt-6">
        <div className="grid grid-cols-1 items-start gap-10 desk:grid-cols-[minmax(0,1fr)_320px] desk:gap-12">
          <div className="min-w-0">
            <PageTitle>{paying ? "Review and pay" : "Review your request"}</PageTitle>
            {bookingAsCard}
            {paymentBlock}
            {afterLine}
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
          <aside className="desk:sticky desk:top-6">{card}</aside>
        </div>
      </ClientColumn>
    );
  }

  return (
    <div>
      <ClientColumn>
        <StepHeader step={3} total={3} label="Review" onBack={onBack} />
        <PageTitle>{paying ? "Review and pay" : "Review your request"}</PageTitle>
        <div className="mt-5">{card}</div>
        {bookingAsCard}
        {paymentBlock}
        {afterLine}
      </ClientColumn>

      <BottomBar>
        <BarSummary caption={paying ? "To pay now" : "Nothing to pay now"} value={amount} />
        <PrimaryButton onClick={primaryAction} disabled={primaryDisabled}>
          {primaryLabel}
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

export type PackageOutcome =
  { kind: "bought"; claimToken: string | null } | { kind: "requested"; claimToken: string | null };

export function ClientPackageDone({
  pkg,
  offerLabel,
  layout,
  outcome,
  businessName,
  email,
  hasAccount,
  onAccount,
  onClaim,
  onBackToPage,
}: {
  pkg: PublicPackage;
  offerLabel: string | null;
  layout: "phone" | "desktop";
  outcome: PackageOutcome;
  businessName: string;
  email: string | null;
  /** Signed in with an account at this business already: no claim step needed. */
  hasAccount: boolean;
  onAccount: () => void;
  onClaim: (token: string) => void;
  onBackToPage: () => void;
}) {
  const desktop = layout === "desktop";
  const bought = outcome.kind === "bought";
  const sessions = `${pkg.creditsIssued} ${pkg.creditsIssued === 1 ? "session" : "sessions"}`;
  const emailLine = email ? `We've emailed ${email}` : "We've emailed you";

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
        {bought ? "Your sessions are ready" : "Request sent"}
      </h1>
      <p className="mx-auto mt-2 max-w-lg text-[16px] text-muted-foreground">
        {bought
          ? `${sessions} are yours to book whenever suits you. ${emailLine} your receipt.`
          : `${businessName} has your request for ${pkg.name}. They'll be in touch to arrange payment and confirm it, and your ${sessions} appear on your account as soon as they do. ${emailLine} a copy.`}
      </p>
    </div>
  );

  const card = (
    <PackageCard
      pkg={pkg}
      offerLabel={offerLabel}
      totalLabel={bought ? "Paid" : "To arrange with the business"}
    />
  );

  const claimToken = outcome.claimToken;
  const primary = hasAccount ? (
    <InkButton full={!desktop} onClick={onAccount} className={cn(desktop && "min-w-[240px]")}>
      {bought ? "Book a session" : "Go to my account"}
    </InkButton>
  ) : claimToken ? (
    <InkButton
      full={!desktop}
      onClick={() => onClaim(claimToken)}
      className={cn(desktop && "min-w-[240px]")}
    >
      {bought ? "Book your sessions" : "Set up my account"}
    </InkButton>
  ) : null;

  const primaryNote = hasAccount
    ? bought
      ? "They're on your account, ready whenever you are."
      : "You'll see the request on your account, and the sessions once it's confirmed."
    : outcome.claimToken
      ? "Takes a moment to set up your account. The same link is in your email if you'd rather do it later."
      : bought
        ? "Your receipt has a link for booking them. The business can also book you in."
        : null;

  if (desktop) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-6 pt-10">
        {hero}
        <div className="mt-7">{card}</div>
        <div className="mt-7 flex flex-col items-center gap-3">
          {primary}
          {primaryNote ? (
            <p className="max-w-md text-center text-[13px] text-muted-foreground">{primaryNote}</p>
          ) : null}
          <TextLink onClick={onBackToPage} className="text-[13px] text-foreground">
            Back to {businessName}
          </TextLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ClientColumn className="pt-10 sm:pt-16">
        {hero}
        <div className="mt-6">{card}</div>
        <div className="mt-8 space-y-3">
          {primary}
          {primaryNote ? (
            <p className="text-center text-[13px] text-muted-foreground">{primaryNote}</p>
          ) : null}
          <OutlineButton full onClick={onBackToPage}>
            Back to {businessName}
          </OutlineButton>
        </div>
        <PoweredBy />
      </ClientColumn>
    </div>
  );
}
