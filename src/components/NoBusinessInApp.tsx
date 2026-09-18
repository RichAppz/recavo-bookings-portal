import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth/auth-store";

/**
 * Signed in to a store app that cannot sell (no In-App Purchase configured)
 * with no staff membership anywhere.
 *
 * Elsewhere this account would be offered "Set up your business", which ends
 * at the plan chooser. Here there is no way to buy one, so the app shows
 * neither the form nor a pointer to where to buy — App Store guideline 3.1.3
 * treats any such call to action as steering, and the UK storefront has no
 * exemption. Just say what is missing and let them sign out.
 */
export function NoBusinessInApp() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">No business on this account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.email ? (
              <>
                You&apos;re signed in as{" "}
                <span className="font-medium text-foreground">{user.email}</span>, but this account
                isn&apos;t a member of a RECAVO business yet.
              </>
            ) : (
              <>This account isn&apos;t a member of a RECAVO business yet.</>
            )}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            If you were invited to join a team, open the invitation email again while signed in here
            and it will attach you to that business.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
