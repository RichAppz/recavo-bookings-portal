import { toast } from "sonner";
import type { SocialSignInOutcome } from "@/lib/auth/auth-store";
import { toastDuration } from "@/lib/toast";

/**
 * What the sign-in / sign-up page should do once a social sign-in has been
 * started: whether its button should stay busy, and anything to tell the
 * person. Shared by /login and /register so the desktop and mobile cases read
 * the same on both.
 *
 * - `redirecting`: the page is on its way to the provider — keep the spinner.
 * - `signed-in`: the session is in; the auth state effect navigates — keep it.
 * - `cancelled`: the mobile sheet was closed — back to the form.
 * - `in-browser`: the desktop shell sent them to the browser. The page stays
 *   where it is (the shell reloads it when the result comes back), so release
 *   the button, say where to look, and let them try again if they lost it.
 */
export function settleSocialSignIn(outcome: SocialSignInOutcome): { busy: boolean } {
  switch (outcome) {
    case "redirecting":
    case "signed-in":
      return { busy: true };
    case "cancelled":
      return { busy: false };
    case "in-browser":
      toast.info("Continue in your browser", {
        description:
          "Finish signing in in the browser window that just opened. You'll be brought back here automatically.",
        ...toastDuration(10_000),
      });
      return { busy: false };
  }
}
