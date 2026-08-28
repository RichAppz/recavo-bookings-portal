import { useMemo, useState } from "react";
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

export function BookingCheckout({
  payment,
  contact,
  onPaid,
}: {
  payment: PublicBookingPayment;
  /** Details already given on the Details step, so checkout doesn't ask twice. */
  contact: BookingContact;
  /** Runs once the card has cleared, to wait for the booking to be confirmed. */
  onPaid: () => Promise<void>;
}) {
  const stripe = useMemo(
    () => stripeFor(payment.publishableKey, payment.connectedAccountId),
    [payment.publishableKey, payment.connectedAccountId],
  );
  const { resolvedTheme } = useTheme();

  // Elements and the Link prompt inside it render in a Stripe-owned iframe, so they
  // cannot inherit the page's CSS — left alone, the card fields stay bright white on a
  // dark booking page. Stripe's own night theme is the only way to follow along.
  const appearance = useMemo(
    () => ({
      theme: (resolvedTheme === "dark" ? "night" : "stripe") as "night" | "stripe",
      variables: { borderRadius: "0.75rem" },
    }),
    [resolvedTheme],
  );

  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret: payment.clientSecret,
        appearance,
      }}
    >
      <CheckoutForm payment={payment} contact={contact} onPaid={onPaid} />
    </Elements>
  );
}

function CheckoutForm({
  payment,
  contact,
  onPaid,
}: {
  payment: PublicBookingPayment;
  contact: BookingContact;
  onPaid: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(result.error.message ?? "Your card could not be charged. Please try again.");
      setSubmitting(false);
      return;
    }
    await onPaid();
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ defaultValues: { billingDetails } }} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
    </div>
  );
}
