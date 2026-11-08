import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { PublicBookingPayment } from "@/lib/api/hooks";

/** What the customer already told us on the Details step. */
export type BookingContact = {
  name: string | null;
  email: string | null;
  /** E.164, which is the only format Stripe accepts. */
  phone: string | null;
};

/**
 * `loadStripe` fetches and initialises Stripe.js, so it must not run per render.
 * Keyed by connected account as well as publishable key: the PaymentIntent belongs
 * to the business's account (a direct charge), and Stripe.js has to be pointed at
 * that account or it cannot see the intent at all.
 */
const stripeInstances = new Map<string, Promise<Stripe | null>>();

function stripeFor(publishableKey: string, stripeAccount: string): Promise<Stripe | null> {
  const id = `${publishableKey}:${stripeAccount}`;
  const existing = stripeInstances.get(id);
  if (existing) return existing;
  const created = loadStripe(publishableKey, { stripeAccount });
  stripeInstances.set(id, created);
  return created;
}

/** How the themed client page wants the Stripe iframe to look. */
export type CheckoutLook = {
  dark: boolean;
  accent: string;
  radius: string;
  fontFamily?: string;
};

/** Lets a page-level button submit the card form that lives inside Stripe's iframe. */
export type CheckoutSubmitHandle = { submit: () => Promise<void>; ready: boolean } | null;

export function BookingCheckout({
  payment,
  contact,
  onPaid,
  look,
  submitRef,
  onSubmittingChange,
  onReadyChange,
  hideButton = false,
}: {
  payment: PublicBookingPayment;
  /** Details already given on the Details step, so checkout doesn't ask twice. */
  contact: BookingContact;
  /** Runs once the card has cleared, to wait for the booking to be confirmed. */
  onPaid: () => Promise<void>;
  /** Overrides the portal theme when the form sits on a themed booking page. */
  look?: CheckoutLook;
  /** Filled with a `submit` the caller's own Pay button can call. */
  submitRef?: MutableRefObject<CheckoutSubmitHandle>;
  onSubmittingChange?: (submitting: boolean) => void;
  /** Tracks whether Stripe is loaded and idle, so a page-level Pay button can enable itself. */
  onReadyChange?: (ready: boolean) => void;
  /** Hide the built-in Pay button when the page provides its own. */
  hideButton?: boolean;
}) {
  const stripe = useMemo(
    () => stripeFor(payment.publishableKey, payment.connectedAccountId),
    [payment.publishableKey, payment.connectedAccountId],
  );
  const { resolvedTheme } = useTheme();

  // Elements and the Link prompt inside it render in a Stripe-owned iframe, so they
  // cannot inherit the page's CSS — left alone, the card fields stay bright white on a
  // dark booking page. Stripe's own night theme is the only way to follow along.
  const appearance = useMemo(() => {
    const dark = look ? look.dark : resolvedTheme === "dark";
    return {
      theme: (dark ? "night" : "stripe") as "night" | "stripe",
      variables: {
        borderRadius: look?.radius ?? "0.75rem",
        ...(look ? { colorPrimary: look.accent } : {}),
        ...(look?.fontFamily ? { fontFamily: look.fontFamily } : {}),
      },
    };
  }, [resolvedTheme, look]);

  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret: payment.clientSecret,
        appearance,
      }}
    >
      <CheckoutForm
        payment={payment}
        contact={contact}
        onPaid={onPaid}
        submitRef={submitRef}
        onSubmittingChange={onSubmittingChange}
        onReadyChange={onReadyChange}
        hideButton={hideButton}
      />
    </Elements>
  );
}

function CheckoutForm({
  payment,
  contact,
  onPaid,
  submitRef,
  onSubmittingChange,
  onReadyChange,
  hideButton,
}: {
  payment: PublicBookingPayment;
  contact: BookingContact;
  onPaid: () => Promise<void>;
  submitRef?: MutableRefObject<CheckoutSubmitHandle>;
  onSubmittingChange?: (submitting: boolean) => void;
  onReadyChange?: (ready: boolean) => void;
  hideButton: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onSubmittingChange?.(submitting);
  }, [submitting, onSubmittingChange]);

  // Stripe rejects explicit nulls here, so only what we actually have is passed. This
  // seeds both the billing fields and Link's "save my details" block, which otherwise
  // asks the customer for the name, email and phone they gave on the previous step.
  const billingDetails = useMemo(() => {
    const details: { name?: string; email?: string; phone?: string } = {};
    if (contact.name) details.name = contact.name;
    if (contact.email) details.email = contact.email;
    if (contact.phone) details.phone = contact.phone;
    return details;
  }, [contact.name, contact.email, contact.phone]);

  const pay = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      // Only cards whose bank demands authentication leave the page; the rest settle
      // inline, which keeps the held slot and the flow's state intact.
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    if (result.error) {
      // Stripe's union types drop paymentIntent once `error` is narrowed, but the
      // object is still there when the intent already settled on a retry.
      const settledIntent = (result as { paymentIntent?: { status?: string } }).paymentIntent;
      const alreadyPaid =
        settledIntent?.status === "succeeded" ||
        result.error.code === "payment_intent_unexpected_state";
      if (!alreadyPaid) {
        setError(result.error.message ?? "Your card could not be charged. Please try again.");
        setSubmitting(false);
        return;
      }
    }
    await onPaid();
    setSubmitting(false);
  };

  useEffect(() => {
    if (!submitRef) return;
    const ready = Boolean(stripe && elements) && !submitting;
    submitRef.current = { submit: pay, ready };
    onReadyChange?.(ready);
    return () => {
      submitRef.current = null;
      onReadyChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitRef, stripe, elements, submitting]);

  return (
    <div className="space-y-4">
      <PaymentElement options={{ defaultValues: { billingDetails } }} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {hideButton ? null : (
        <Button
          size="xl"
          className="w-full"
          disabled={!stripe || submitting}
          onClick={() => void pay()}
        >
          {submitting
            ? "Taking payment…"
            : `Pay ${formatMoney(payment.amountMinor, payment.currency)}`}
        </Button>
      )}
    </div>
  );
}
