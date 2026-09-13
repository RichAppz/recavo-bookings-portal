import { useEffect, useState } from "react";
import { Copy, Link2, Plus, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerSearchPicker } from "@/components/LinkedRecordDialogs";
import { PersonAvatar, SectionCard } from "@/components/ui-bits";
import {
  useCreatePackageLink,
  usePackageLinks,
  usePackages,
  useRevokePackageLink,
  useAssignPackageLink,
  useCustomer,
  useServices,
} from "@/lib/api/hooks";
import type { CatalogueService, Customer, Package, PackageLink } from "@/lib/api/types";
import { customerDisplayName } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { bookingUrlFor } from "@/lib/hosts";
import { useTenant } from "@/lib/tenant/tenant-context";

/** The URL a client opens: the booking page, narrowed to what the link names. */
function packageLinkUrl(slug: string, code: string): string {
  return `${bookingUrlFor(slug)}?offer=${encodeURIComponent(code)}`;
}

function copyLink(url: string, message = "Link copied") {
  void navigator.clipboard.writeText(url);
  toast.success(message, { description: url.replace(/^https?:\/\//, "") });
}

/** "Session" for PT, "Service" for detailing — the same trick the Sessions page uses. */
function sessionNoun(service: string) {
  const noun = service.replace(/\s+type$/i, "").trim() || "Service";
  const lower = noun.toLowerCase();
  const plural = lower.endsWith("s") ? noun : `${noun}s`;
  return { noun, lower, plural, pluralLower: plural.toLowerCase() };
}

/**
 * Offer links: a hand-picked set of sessions and packages behind one URL. The public
 * page shows every session and package the business has switched on; a link lets it
 * send one person or group a narrower choice — or something it never puts on the
 * public page. Rendered on both the Sessions and Packages pages, so it fetches its own
 * catalogue rather than leaning on whichever page it sits in.
 */
export function PackageLinksCard({ slug }: { slug: string }) {
  const tenant = useTenant();
  const nouns = sessionNoun(tenant.terminology.service);
  const links = usePackageLinks();
  const services = useServices();
  const packages = usePackages();
  const revoke = useRevokePackageLink();
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<PackageLink | null>(null);

  const serviceName = (id: string) =>
    (services.data ?? []).find((s) => s.id === id)?.name ?? `Removed ${nouns.lower}`;
  const packageName = (id: string) =>
    (packages.data ?? []).find((p) => p.id === id)?.name ?? "Removed package";
  const contents = (link: PackageLink) => {
    const items = [...link.serviceIds.map(serviceName), ...link.packageIds.map(packageName)];
    const n = link.customerIds.length;
    // Assigned from the client profile; shown here so the PT can see a link is in use.
    if (n > 0) items.push(`sent to ${n} ${n === 1 ? "client" : "clients"}`);
    return items.join(" · ");
  };

  return (
    <SectionCard
      title="Offer links"
      description={`Send a link that shows only the ${nouns.pluralLower} and packages you choose — including ones hidden from your booking page.`}
      action={
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New link
        </Button>
      }
    >
      {links.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : (links.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No offer links yet. Create one to share a specific offer with a client or group.
        </p>
      ) : (
        <ul className="divide-y">
          {(links.data ?? []).map((link) => {
            const url = packageLinkUrl(slug, link.code);
            return (
              <li
                key={link.id}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{link.name}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{contents(link)}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {url.replace(/^https?:\/\//, "")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSharing(link)}>
                    <Users className="size-4" /> Clients
                    {link.customerIds.length > 0 ? ` (${link.customerIds.length})` : null}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copyLink(url)}>
                    <Copy className="size-4" /> Copy link
                  </Button>
                  <RevokeButton
                    link={link}
                    pending={revoke.isPending}
                    onConfirm={() =>
                      revoke.mutate(link.id, {
                        onSuccess: () => toast.success("Link removed"),
                      })
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ShareLinkDialog
        // Read the live row so the list updates as clients are added or removed.
        link={(links.data ?? []).find((l) => l.id === sharing?.id) ?? null}
        onClose={() => setSharing(null)}
      />
      <CreateLinkDialog
        open={creating}
        slug={slug}
        nouns={nouns}
        services={services.data ?? []}
        packages={packages.data ?? []}
        onClose={() => setCreating(false)}
      />
    </SectionCard>
  );
}

/**
 * Hand a link to clients so it appears under Offers in their account. Same action as
 * the switch on the client profile, from the link's side: pick a client, they're added;
 * the × takes it back. The URL keeps working for anyone regardless.
 */
function ShareLinkDialog({ link, onClose }: { link: PackageLink | null; onClose: () => void }) {
  const assign = useAssignPackageLink();
  const toggle = (customerId: string, assigned: boolean) =>
    assign.mutate(
      { linkId: link!.id, customerId, assigned },
      {
        onSuccess: () =>
          toast.success(assigned ? "Added to their Offers" : "Removed from their Offers"),
      },
    );

  return (
    <Dialog open={link !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to clients</DialogTitle>
          <DialogDescription>
            {link ? `“${link.name}” ` : "This link "}
            appears under Offers when these clients sign in. Anyone with the URL can still open it.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-4">
            <CustomerSearchPicker
              value={null}
              placeholder="Add a client…"
              onSelect={(c: Customer) => {
                if (!link.customerIds.includes(c.id)) toggle(c.id, true);
              }}
            />
            {link.customerIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not sent to anyone yet.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {link.customerIds.map((id) => (
                  <AssignedClientRow
                    key={id}
                    customerId={id}
                    disabled={assign.isPending}
                    onRemove={() => toggle(id, false)}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignedClientRow({
  customerId,
  disabled,
  onRemove,
}: {
  customerId: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const customer = useCustomer(customerId);
  const name = customer.data ? customerDisplayName(customer.data) : "…";
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <PersonAvatar name={name} size={28} />
        <span className="truncate font-medium">{name}</span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Remove ${name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
    </li>
  );
}

function RevokeButton({
  link,
  pending,
  onConfirm,
}: {
  link: PackageLink;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={pending} aria-label={`Remove ${link.name}`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{link.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Anyone who opens the link will see your full booking page instead. Bookings made and
            packages bought through it are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep link</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Remove link</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One tickable row; the order badge tells the PT how the page will list things. Whether
 * the item is on the public page is deliberately not shown: a link makes it visible
 * either way, so the flag would only be noise here.
 */
function ChoiceRow({
  checked,
  order,
  name,
  price,
  onToggle,
}: {
  checked: boolean;
  order: number;
  name: string;
  price: string;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm">
      <span className="flex items-center gap-3">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
        <span className="font-medium">{name}</span>
      </span>
      <span className="flex items-center gap-3 text-muted-foreground">
        {checked ? <span className="tabular-nums text-xs">#{order + 1}</span> : null}
        <span className="font-medium text-foreground">{price}</span>
      </span>
    </label>
  );
}

function CreateLinkDialog({
  open,
  slug,
  nouns,
  services,
  packages,
  onClose,
}: {
  open: boolean;
  slug: string;
  nouns: ReturnType<typeof sessionNoun>;
  services: CatalogueService[];
  packages: Package[];
  onClose: () => void;
}) {
  const create = useCreatePackageLink();
  const [name, setName] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [clients, setClients] = useState<Customer[]>([]);
  // Paused items would show nothing on the page, so they are not offered here.
  const serviceChoices = services.filter((s) => s.active);
  const packageChoices = packages.filter((p) => p.active);
  const nothingToShare = serviceChoices.length === 0 && packageChoices.length === 0;

  useEffect(() => {
    if (open) {
      setName("");
      setServiceIds([]);
      setPackageIds([]);
      setClients([]);
    }
  }, [open]);

  const toggleIn = (set: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    set((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const toggleService = toggleIn(setServiceIds);
  const togglePackage = toggleIn(setPackageIds);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the link a name");
      return;
    }
    if (serviceIds.length === 0 && packageIds.length === 0) {
      toast.error(`Choose at least one ${nouns.lower} or package`);
      return;
    }
    try {
      const link = await create.mutateAsync({
        name: name.trim(),
        serviceIds,
        packageIds,
        customerIds: clients.map((c) => c.id),
      });
      // Straight to the clipboard: the next thing the PT does is paste it into a message.
      copyLink(
        packageLinkUrl(slug, link.code),
        clients.length > 0
          ? `Link created, copied and sent to ${clients.length} ${clients.length === 1 ? "client" : "clients"}`
          : "Link created and copied",
      );
      onClose();
    } catch {
      // Surfaced by the mutation's toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New offer link</DialogTitle>
          <DialogDescription>
            Clients who open it see only these {nouns.pluralLower} and packages, in this order, and
            can book or buy them even if they are hidden from your booking page.
          </DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="pl-name">Link name</Label>
            <Input
              id="pl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New client offer"
            />
            <p className="text-xs text-muted-foreground">
              Shown as the heading when someone opens the link.
            </p>
          </div>

          {nothingToShare ? (
            <p className="text-xs text-muted-foreground">
              Nothing active to share yet. Create a {nouns.lower} or a package first.
            </p>
          ) : null}

          {serviceChoices.length > 0 ? (
            <div className="grid gap-2">
              <Label>{nouns.plural}</Label>
              <div className="grid gap-2">
                {serviceChoices.map((s) => (
                  <ChoiceRow
                    key={s.id}
                    checked={serviceIds.includes(s.id)}
                    order={serviceIds.indexOf(s.id)}
                    name={s.name}
                    price={formatMoney(s.basePriceMinor, s.currency)}
                    onToggle={() => toggleService(s.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {packageChoices.length > 0 ? (
            <div className="grid gap-2">
              <Label>Packages</Label>
              <div className="grid gap-2">
                {packageChoices.map((p) => (
                  <ChoiceRow
                    key={p.id}
                    checked={packageIds.includes(p.id)}
                    order={packageIds.indexOf(p.id)}
                    name={p.name}
                    price={formatMoney(p.priceMinor, p.currency)}
                    onToggle={() => togglePackage(p.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {nothingToShare ? null : (
            <p className="text-xs text-muted-foreground">
              Tick things in the order you want them shown. You can mix {nouns.pluralLower} and
              packages, or pick just one kind.
            </p>
          )}

          {nothingToShare ? null : (
            <div className="grid gap-2">
              <Label>Send to clients (optional)</Label>
              <CustomerSearchPicker
                value={null}
                placeholder="Add a client…"
                onSelect={(c: Customer) =>
                  setClients((list) => (list.some((x) => x.id === c.id) ? list : [...list, c]))
                }
              />
              {clients.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {clients.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm"
                    >
                      {customerDisplayName(c)}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-6 rounded-full p-0"
                        aria-label={`Remove ${customerDisplayName(c)}`}
                        onClick={() => setClients((list) => list.filter((x) => x.id !== c.id))}
                      >
                        <X className="size-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">
                The link appears under Offers when these clients sign in. You can add more later.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={create.isPending || nothingToShare} onClick={() => void submit()}>
            {create.isPending ? "Creating…" : "Create and copy link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
