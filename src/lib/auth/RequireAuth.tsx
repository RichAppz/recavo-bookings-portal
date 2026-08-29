import { Navigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useAuth } from "./auth-store";

/** Redirect unauthenticated users to /login, preserving the intended destination. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  // Path + query only. The hash is deliberately dropped: an OAuth callback lands
  // on /#access_token=… and round-tripping that through ?redirect= would put the
  // access, refresh and provider tokens in the address bar and browser history.
  const destination = useRouterState({
    select: (s) => `${s.location.pathname}${s.location.searchStr ?? ""}`,
  });
  // Capture the intended destination once at mount. Reading the live location on
  // every render feeds the growing /login?redirect=… URL back into itself and
  // causes an infinite navigation loop during the router transition.
  const [redirectTo] = useState(destination);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Checking session…</p>
      </div>
    );
  }

  if (status === "unconfigured") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-2 text-center">
          <h1 className="text-lg font-semibold">Auth not configured</h1>
          <p className="text-sm text-muted-foreground">
            Set <code className="text-xs">VITE_SUPABASE_URL</code> and{" "}
            <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> in your environment.
          </p>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" search={{ redirect: redirectTo }} replace />;
  }

  return <>{children}</>;
}
