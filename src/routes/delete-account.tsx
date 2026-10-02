import { createFileRoute, Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/Wordmark";

const SUPPORT_EMAIL = "hello@recavo.app";

/**
 * Public, unauthenticated explanation of how to delete a RECAVO account. Google
 * Play's Data safety form needs a web page like this (the "account deletion
 * link"), and it doubles as the place to point anyone who can no longer sign in.
 * The self-serve path it describes is DeleteAccountSection (Settings › Account).
 */
export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete your account — RECAVO" },
      {
        name: "description",
        content:
          "How to delete your RECAVO account and personal data, from the app or by emailing us.",
      },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-background px-safe-4 pt-safe-8 pb-safe-12 sm:px-safe-8 sm:pt-safe-12">
      <article className="mx-auto w-full max-w-xl space-y-8">
        <div>
          <Wordmark />
        </div>

        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Delete your RECAVO account</h1>
          <p className="text-muted-foreground">
            You can delete your account and personal data yourself from inside RECAVO at any time.
            If you can no longer sign in, email us and we’ll do it for you.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Delete it in the app</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed">
            <li>
              Sign in to RECAVO on iOS, Android or at{" "}
              <Link to="/login" className="text-primary underline underline-offset-4">
                bookings.recavo.app
              </Link>
              .
            </li>
            <li>
              Open <strong>Settings</strong>, then the <strong>Account</strong> tab.
            </li>
            <li>
              Under <strong>Delete account</strong>, tap <strong>Delete my account…</strong>
            </li>
            <li>
              Read what will happen, type <span className="font-mono">DELETE</span> to confirm and
              tap <strong>Delete account</strong>.
            </li>
          </ol>
          <p className="text-sm text-muted-foreground">
            The same option is also shown on the billing screen and the create-a-business screen, so
            you can delete an account even if you never finished setting up.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Can’t sign in?</h2>
          <p className="text-[15px] leading-relaxed">
            Email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20RECAVO%20account`}
              className="text-primary underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            from the email address on your account with the subject “Delete my RECAVO account”.
            We’ll confirm it’s you and delete the account within 30 days, then let you know when
            it’s done.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What happens when you delete</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
            <li>
              Your sign-in, name, email address and phone number are deleted immediately and you’re
              signed out everywhere.
            </li>
            <li>
              Any business that nobody else owns is closed. Its bookings, clients and invoices stay
              available to export for 30 days, then they’re anonymised. Any web subscription is
              cancelled at the end of its current period.
            </li>
            <li>You’re removed from businesses other people own; they carry on without you.</li>
            <li>
              A subscription billed through the App Store or Google Play is <strong>not</strong>{" "}
              cancelled by deleting your account — cancel it in iOS Settings › Apple ID ›
              Subscriptions, or in Google Play › Payments &amp; subscriptions › Subscriptions.
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">Deletion can’t be undone.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Booked with a business through RECAVO?</h2>
          <p className="text-[15px] leading-relaxed">
            If you’re a client of a business that uses RECAVO and want your details removed, ask the
            business directly or email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Remove%20my%20details`}
              className="text-primary underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            and we’ll help.
          </p>
        </section>

        <footer className="border-t pt-6 text-sm text-muted-foreground">
          <a
            href="https://recavo.app/privacy"
            className="text-primary underline underline-offset-4"
          >
            Privacy policy
          </a>
        </footer>
      </article>
    </main>
  );
}
