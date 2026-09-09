import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PackageLinksCard } from "@/components/PackageLinksCard";
import { PageHeader } from "@/components/ui-bits";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Home for sign-up links. The same card also sits on the Sessions and Packages pages,
 * where links are created next to what they contain; this page is the place in the
 * menu to come back to — copy a URL, send a link to clients, or take one down.
 */
export const Route = createFileRoute("/sign-up-links")({
  head: () => ({
    meta: [
      { title: "Sign-up links — RECAVO" },
      {
        name: "description",
        content: "Shareable links that show clients a hand-picked set of sessions and packages.",
      },
      { property: "og:title", content: "RECAVO Sign-up links" },
      {
        property: "og:description",
        content: "Shareable links that show clients a hand-picked set of sessions and packages.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <SignUpLinksPage />
      </AppShell>
    </RequireAuth>
  ),
});

function SignUpLinksPage() {
  const tenant = useTenant();
  return (
    <>
      <PageHeader
        title="Sign-up links"
        description="Share a specific offer — including sessions and packages hidden from your booking page — by URL, or send it straight to a client's account."
      />
      {tenant.business ? <PackageLinksCard slug={tenant.business.slug} /> : null}
    </>
  );
}
