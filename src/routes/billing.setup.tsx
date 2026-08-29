import { Navigate, createFileRoute } from "@tanstack/react-router";

/** Old TOTP gate. Keep the path so Back from plan selection lands on plans, not 2FA. */
export const Route = createFileRoute("/billing/setup")({
  component: () => <Navigate to="/billing" replace />,
});
