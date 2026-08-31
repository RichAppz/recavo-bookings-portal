/**
 * What a business pays Stripe vs Recavo. Recavo takes 0% on each charge
 * (ADR 0004 / RECA-19); Stripe’s UK card rates are their published standard.
 */
export function StripeFeesNote({ connected = false }: { connected?: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">
        {connected ? "What Stripe takes from each payment" : "What Stripe will charge"}
      </p>
      <p>
        Stripe processes the card and takes <span className="text-foreground">1.5% + 20p</span> on
        standard UK cards, <span className="text-foreground">2.5% + 20p</span> on EEA cards, and{" "}
        <span className="text-foreground">3.25% + 20p</span> on international cards. There is no
        Stripe monthly fee.
      </p>
      <p>
        Recavo does not take a cut of each booking — you only pay your Recavo subscription.
        {connected
          ? " The rest is paid out to your bank automatically on Stripe’s rolling schedule."
          : " Once connected, payouts to your bank run automatically."}{" "}
        <a
          href="https://stripe.com/gb/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Stripe’s full UK pricing
        </a>
        .
      </p>
    </div>
  );
}
