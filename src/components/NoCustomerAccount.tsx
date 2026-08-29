import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth/auth-store";
import { staffHostFor } from "@/lib/hosts";

/**
 * Signed in on the customer hostname with nothing attached to the account yet:
 * no staff membership and no customer link at any studio.
 *
 * Reachable during the gap in the claim flow — sign up, then confirm the email
 * some minutes later — where for a moment the account genuinely owns nothing.
 * The staff app offers to create a business here, which is the wrong question to
 * ask someone who arrived to book a session.
 */
export function NoCustomerAccount() {
  const { user, signOut } = useAuth();
  const staffHost = typeof window === "undefined" ? null : staffHostFor(window.location.hostname);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">Nothing here yet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.email ? (
              <>
                You're signed in as{" "}
                <span className="font-medium text-foreground">{user.email}</span>, but this account
                has no sessions or purchases yet.
              </>
            ) : (
              <>This account has no sessions or purchases yet.</>
            )}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            If you were emailed a link to set up sessions you'd bought, open it again — it attaches
            them to whichever account you're signed in as.
          </p>

          {staffHost ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Running a studio rather than booking one?{" "}
              {/* A link, not a redirect: the session lives in localStorage, which
                  does not cross origins, so sending them there would sign them out
                  without explaining why. */}
              <a
                href={`https://${staffHost}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Sign in at {staffHost}
              </a>
              .
            </p>
          ) : null}

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
