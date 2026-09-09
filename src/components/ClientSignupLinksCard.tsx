import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/ui-bits";
import { useAssignPackageLink, usePackageLinks, usePackages, useServices } from "@/lib/api/hooks";
import type { PackageLink } from "@/lib/api/types";
import { bookingUrlFor } from "@/lib/hosts";

/**
 * Hand a client one of the business's sign-up links. Assigned links show up under
 * "Offers" in the client's own account, so they can book or buy from them without
 * finding the URL in a message. Assignment does not gate the link — the URL still
 * works for anyone — so this card is about reach, not access.
 */
export function ClientSignupLinksCard({
  clientId,
  slug,
  disabled,
}: {
  clientId: string;
  slug: string;
  disabled?: boolean;
}) {
  const links = usePackageLinks();
  const services = useServices();
  const packages = usePackages();
  const assign = useAssignPackageLink();

  const contents = (link: PackageLink) =>
    [
      ...link.serviceIds.map(
        (id) => (services.data ?? []).find((s) => s.id === id)?.name ?? "Removed session",
      ),
      ...link.packageIds.map(
        (id) => (packages.data ?? []).find((p) => p.id === id)?.name ?? "Removed package",
      ),
    ].join(" · ");

  const toggle = (link: PackageLink, assigned: boolean) =>
    assign.mutate(
      { linkId: link.id, customerId: clientId, assigned },
      {
        onSuccess: () =>
          toast.success(assigned ? "Added to their Offers" : "Removed from their Offers"),
      },
    );

  return (
    <SectionCard
      title="Sign-up links"
      description="Switch a link on and it appears under Offers when this client signs in. Anyone with the URL can still open it."
    >
      {links.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : (links.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sign-up links yet. Create one from the Sessions or Packages page.
        </p>
      ) : (
        <ul className="divide-y">
          {(links.data ?? []).map((link) => {
            const assigned = link.customerIds.includes(clientId);
            const url = `${bookingUrlFor(slug)}?offer=${encodeURIComponent(link.code)}`;
            return (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{link.name}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{contents(link)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Copy ${link.name} link`}
                    onClick={() => {
                      void navigator.clipboard.writeText(url);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Switch
                    checked={assigned}
                    disabled={disabled || assign.isPending}
                    aria-label={`${assigned ? "Remove" : "Add"} ${link.name} for this client`}
                    onCheckedChange={(next) => toggle(link, next)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
