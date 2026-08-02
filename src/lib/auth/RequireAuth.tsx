import { Navigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "./auth-store";

/** Redirect unauthenticated users to /login, preserving the intended destination. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.href });

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
    return <Navigate to="/login" search={{ redirect: pathname }} replace />;
  }

  return <>{children}</>;
}
