import { useEffect, useState } from "react";
import { Copy, EyeOff, Link2, Plus, Trash2 } from "lucide-react";
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
import { SectionCard } from "@/components/ui-bits";
import { useCreatePackageLink, usePackageLinks, useRevokePackageLink } from "@/lib/api/hooks";
import type { Package, PackageLink } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { bookingUrlFor } from "@/lib/hosts";

/** The URL a client opens: the booking page, narrowed to the link's packages. */
function packageLinkUrl(slug: string, code: string): string {
  return `${bookingUrlFor(slug)}?offer=${encodeURIComponent(code)}`;
}

function copyLink(url: string, message = "Link copied") {
  void navigator.clipboard.writeText(url);
  toast.success(message, { description: url.replace(/^https?:\/\//, "") });
}

/**
 * Sign-up links: a hand-picked set of packages behind one URL. The public page shows
 * every package with "Available to buy" switched on; a link lets the business send one
 * person or group a narrower choice — or a package it never puts on the public page.
 */
export function PackageLinksCard({ slug, packages }: { slug: string; packages: Package[] }) {
  const links = usePackageLinks();
  const revoke = useRevokePackageLink();
  const [creating, setCreating] = useState(false);
  const nameOf = (id: string) => packages.find((p) => p.id === id)?.name ?? "Removed package";

  return (
    <SectionCard
      title="Sign-up links"
      description="Send a link that shows only the packages you choose — including ones hidden from your booking page."
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
          No links yet. Create one to share a specific offer with a client or group.
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
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {link.packageIds.map(nameOf).join(" · ")}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {url.replace(/^https?:\/\//, "")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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

      <CreateLinkDialog
        open={creating}
        slug={slug}
        packages={packages}
        onClose={() => setCreating(false)}
      />
    </SectionCard>
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
            Anyone who opens the link will see your full booking page instead. Packages already
            bought through it are not affected.
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

function CreateLinkDialog({
  open,
  slug,
  packages,
  onClose,
}: {
  open: boolean;
  slug: string;
  packages: Package[];
  onClose: () => void;
}) {
  const create = useCreatePackageLink();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  // Paused packages would show nothing on the page, so they are not offered here.
  const choices = packages.filter((p) => p.active);

  useEffect(() => {
    if (open) {
      setName("");
      setSelected([]);
    }
  }, [open]);

  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the link a name");
      return;
    }
    if (selected.length === 0) {
      toast.error("Choose at least one package");
      return;
    }
    try {
      const link = await create.mutateAsync({ name: name.trim(), packageIds: selected });
      // Straight to the clipboard: the next thing the PT does is paste it into a message.
      copyLink(packageLinkUrl(slug, link.code), "Link created and copied");
      onClose();
    } catch {
      // Surfaced by the mutation's toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New sign-up link</DialogTitle>
          <DialogDescription>
            Clients who open it see only these packages, in this order, and can buy them even if
            they are hidden from your booking page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pr-1">
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
          <div className="grid gap-2">
            <Label>Packages</Label>
            {choices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active packages to share yet. Create a package first.
              </p>
            ) : (
              <div className="grid gap-2">
                {choices.map((p) => {
                  const order = selected.indexOf(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm"
                    >
                      <span className="flex items-center gap-3">
                        <Checkbox checked={order >= 0} onCheckedChange={() => toggle(p.id)} />
                        <span>
                          <span className="block font-medium">{p.name}</span>
                          {!p.salesAvailable ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <EyeOff className="size-3" /> Hidden from booking page
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-muted-foreground">
                        {order >= 0 ? (
                          <span className="tabular-nums text-xs">#{order + 1}</span>
                        ) : null}
                        <span className="font-medium text-foreground">
                          {formatMoney(p.priceMinor, p.currency)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Tick packages in the order you want them shown.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={create.isPending || choices.length === 0} onClick={() => void submit()}>
            {create.isPending ? "Creating…" : "Create and copy link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
