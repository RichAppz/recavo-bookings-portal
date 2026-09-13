import * as React from "react";
import { offersAppleSignIn } from "@/lib/native";

/**
 * Whether to render the Sign in with Apple button. Resolved after mount so the
 * server render (which can't see the Capacitor bridge) matches the client.
 */
export function useOffersAppleSignIn(): boolean {
  const [offers, setOffers] = React.useState(false);
  React.useEffect(() => {
    setOffers(offersAppleSignIn());
  }, []);
  return offers;
}
