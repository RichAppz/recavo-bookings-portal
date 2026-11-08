import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthChromeGhost } from "@/components/ghost";
import { displayReferralCode, stashPendingReferral } from "@/lib/auth/pending-referral";

/**
 * Short referral link (`/join/ABCD-EFGH`). Keeps the code for the rest of the visit,
 * so it still applies if they look around before signing up, then opens sign-up.
 */
export const Route = createFileRoute("/join/$code")({
  head: () => ({
    meta: [
      { title: "Join RECAVO" },
      { name: "description", content: "You've been invited to try RECAVO for your bookings." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    stashPendingReferral(code);
    void navigate({ to: "/register", search: { ref: displayReferralCode(code) }, replace: true });
  }, [code, navigate]);

  return <AuthChromeGhost />;
}
