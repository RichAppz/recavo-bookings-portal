import { useEffect, useState } from "react";
import { CalendarPlus, Copy, ExternalLink, Link2, Plus, Trash2, Users, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  useUpdatePackageLinkExtraTimes,
} from "@/lib/api/hooks";
import type { CatalogueService, Customer, Package, PackageLink } from "@/lib/api/types";
import { customerDisplayName } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { bookingUrlFor } from "@/lib/hosts";
import { describeDiscount, discountedMinor, parseDiscountInput } from "@/lib/offer-discount";
import {
  describeExtraTimesCount,
  fromExtraWindows,
  newExtraTimeRow,
  toExtraWindows,
  validateExtraTimeRows,
  WEEKDAYS,
  type ExtraTimeRow,
} from "@/lib/offer-extra-times";
import { useTenant } from "@/lib/tenant/tenant-context";

/** The URL a client opens: the booking page, narrowed to what the link names. */
function packageLinkUrl(slug: string, code: string): string {
  return `${bookingUrlFor(slug)}?offer=${encodeURIComponent(code)}`;
}

function copyLink(url: string, message = "Link copied") {
  void navigator.clipboard.writeText(url);
  toast.success(message, {
    description: url.replace(/^https?:\/\//, ""),
    // The natural next step after copying is to see what the client will see.
    action: { label: "Preview", onClick: () => window.open(url, "_blank", "noreferrer") },
  });
}

/** "£" for GBP, "€" for EUR — the bare symbol for the discount toggle label. */
function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
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
  const [editingTimes, setEditingTimes] = useState<PackageLink | null>(null);

  const serviceName = (id: string) =>
    (services.data ?? []).find((s) => s.id === id)?.name ?? `Removed ${nouns.lower}`;
  const packageName = (id: string) =>
    (packages.data ?? []).find((p) => p.id === id)?.name ?? "Removed package";
  const contents = (link: PackageLink) => {
    const items = [...link.serviceIds.map(serviceName), ...link.packageIds.map(packageName)];
    // Older API builds predate discounts; a link without the field is at list price.
    const saving = describeDiscount(link.discount ?? null, tenant.business?.currency ?? "GBP");
    if (saving) items.unshift(saving);
    // Older API builds predate extra times; a link without the field opens none.
    const extraTimes = describeExtraTimesCount(link.extraAvailability);
    if (extraTimes) items.push(extraTimes);
    const n = link.customerIds.length;
    // Assigned from the client profile; shown here so the PT can see a link is in use.
    if (n > 0) items.push(`sent to ${n} ${n === 1 ? "client" : "clients"}`);
    // Older API builds predate the flag; a link without it shows the full page.
    if (link.showFullCatalogue === false) items.push("private — no link to your full page");
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
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {/* Opens the booking page exactly as a client following the link sees it —
                      the customer hostname, narrowed to this link's sessions and packages. */}
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Preview ${link.name}`}
                    >
                      <ExternalLink className="size-4" /> Preview
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSharing(link)}>
                    <Users className="size-4" /> Clients
                    {link.customerIds.length > 0 ? ` (${link.customerIds.length})` : null}
                  </Button>
                  {/* Only sessions can carry extra times; a packages-only link has nothing to edit. */}
                  {link.serviceIds.length > 0 ? (
                    <Button size="sm" variant="outline" onClick={() => setEditingTimes(link)}>
                      <CalendarPlus className="size-4" /> Extra times
                      {(link.extraAvailability?.length ?? 0) > 0
                        ? ` (${link.extraAvailability.length})`
                        : null}
                    </Button>
                  ) : null}
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
      <EditExtraTimesDialog
        link={(links.data ?? []).find((l) => l.id === editingTimes?.id) ?? null}
        nouns={nouns}
        serviceName={serviceName}
        onClose={() => setEditingTimes(null)}
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
  price: React.ReactNode;
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

/**
 * Extra bookable times for the sessions a link names: rows of "Every <weekday>" or
 * "On <date>" from–to. These are times outside the normal schedule that only a client
 * arriving with the link sees; anything already in the diary still wins. Used inside
 * the create dialog (under the ticked sessions) and on its own to edit a live link.
 */
function ExtraTimesEditor({
  rows,
  onChange,
  serviceIds,
  serviceName,
  nouns,
  errors,
  listError,
}: {
  rows: ExtraTimeRow[];
  onChange: (rows: ExtraTimeRow[]) => void;
  /** The sessions the link names, in link order; one block each. */
  serviceIds: string[];
  serviceName: (id: string) => string;
  nouns: ReturnType<typeof sessionNoun>;
  /** Per-row messages by row key, shown inline once the business tries to save. */
  errors: Map<string, string>;
  listError: string | null;
}) {
  const update = (key: string, patch: Partial<ExtraTimeRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key));

  return (
    <div className="grid gap-2">
      <Label>Extra times for this offer (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Open times you don’t normally offer — a Sunday morning, one particular evening — just for
        clients who book through this link. Anything already in your diary stays unavailable.
      </p>
      {listError ? <p className="text-xs text-destructive">{listError}</p> : null}
      {serviceIds.map((serviceId) => {
        const mine = rows.filter((r) => r.serviceId === serviceId);
        return (
          <div key={serviceId} className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{serviceName(serviceId)}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange([...rows, newExtraTimeRow(serviceId)])}
              >
                <Plus className="size-3.5" /> Add time
              </Button>
            </div>
            {mine.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No extra times. Clients see this {nouns.lower}’s usual availability.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-border/70 rounded-lg border border-border/70">
                {mine.map((row) => {
                  const error = errors.get(row.key);
                  return (
                    // Keyed by the row's own key, never by a value that changes while
                    // typing: remounting a focused <input type="time"> upsets Safari.
                    <div key={row.key} className="grid gap-1.5 px-2.5 py-2">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_6.5rem_6.5rem_2.25rem] items-center gap-2">
                        <Select
                          value={row.mode}
                          onValueChange={(v) =>
                            update(row.key, { mode: v as ExtraTimeRow["mode"] })
                          }
                        >
                          <SelectTrigger aria-label="Repeat" className="w-[5rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Every</SelectItem>
                            <SelectItem value="date">On</SelectItem>
                          </SelectContent>
                        </Select>
                        {row.mode === "weekly" ? (
                          <Select
                            value={String(row.dayOfWeek)}
                            onValueChange={(v) => update(row.key, { dayOfWeek: Number(v) })}
                          >
                            <SelectTrigger aria-label="Day">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WEEKDAYS.map((d) => (
                                <SelectItem key={d.value} value={String(d.value)}>
                                  {d.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="date"
                            aria-label="Date"
                            value={row.date}
                            onChange={(e) => update(row.key, { date: e.target.value })}
                          />
                        )}
                        <Input
                          type="time"
                          aria-label="From"
                          value={row.start}
                          onChange={(e) => update(row.key, { start: e.target.value })}
                        />
                        <Input
                          type="time"
                          aria-label="To"
                          value={row.end}
                          onChange={(e) => update(row.key, { end: e.target.value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove time"
                          onClick={() => remove(row.key)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {error ? <p className="text-xs text-destructive">{error}</p> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Change the extra times on a link already shared; everything else on it stays fixed. */
function EditExtraTimesDialog({
  link,
  nouns,
  serviceName,
  onClose,
}: {
  link: PackageLink | null;
  nouns: ReturnType<typeof sessionNoun>;
  serviceName: (id: string) => string;
  onClose: () => void;
}) {
  const update = useUpdatePackageLinkExtraTimes();
  const [rows, setRows] = useState<ExtraTimeRow[]>([]);
  const [attempted, setAttempted] = useState(false);
  const linkId = link?.id ?? null;

  // Reset the draft when a different link opens, not on every refetch of the same one.
  useEffect(() => {
    if (linkId && link) {
      setRows(fromExtraWindows(link.extraAvailability ?? []));
      setAttempted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  const validation = validateExtraTimeRows(rows);
  const errors = attempted ? validation.byKey : new Map<string, string>();

  const submit = async () => {
    setAttempted(true);
    if (!link || validation.byKey.size > 0 || validation.listError) return;
    try {
      await update.mutateAsync({ linkId: link.id, extraAvailability: toExtraWindows(rows) });
      toast.success(rows.length === 0 ? "Extra times removed" : "Extra times saved");
      onClose();
    } catch {
      // Surfaced by the mutation's toast.
    }
  };

  return (
    <Dialog open={link !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Extra times</DialogTitle>
          <DialogDescription>
            {link ? `“${link.name}”: ` : ""}
            times only clients who book through this link can choose, on top of your usual
            availability.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pr-1">
            <ExtraTimesEditor
              rows={rows}
              onChange={setRows}
              serviceIds={link.serviceIds}
              serviceName={serviceName}
              nouns={nouns}
              errors={errors}
              listError={attempted ? validation.listError : null}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={update.isPending} onClick={() => void submit()}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const tenant = useTenant();
  const currency = tenant.business?.currency ?? "GBP";
  const create = useCreatePackageLink();
  const [name, setName] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [clients, setClients] = useState<Customer[]>([]);
  // Whether the page offers "Looking for something else? See everything … offers".
  // On by default: most links are a shortcut, not a wall.
  const [showFullCatalogue, setShowFullCatalogue] = useState(true);
  // Money off through the link. Kept as the raw field so a half-typed "1" is not
  // rejected mid-keystroke; parsed (and refused) only on submit.
  const [discountMode, setDiscountMode] = useState<"none" | "percent" | "amount">("none");
  const [discountValue, setDiscountValue] = useState("");
  const discount = parseDiscountInput(discountMode, discountValue);
  // Extra bookable times per ticked session; rows for an unticked session are dropped
  // with it so a stale window never reaches the API.
  const [extraTimes, setExtraTimes] = useState<ExtraTimeRow[]>([]);
  const [attemptedTimes, setAttemptedTimes] = useState(false);
  const extraValidation = validateExtraTimeRows(extraTimes);
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
      setShowFullCatalogue(true);
      setDiscountMode("none");
      setDiscountValue("");
      setExtraTimes([]);
      setAttemptedTimes(false);
    }
  }, [open]);

  /** The row's price as the client will see it: struck-through list, then the offer price. */
  const priceLabel = (listMinor: number, itemCurrency: string, picked: boolean) => {
    const list = formatMoney(listMinor, itemCurrency);
    if (!picked || !discount) return list;
    const offer = discountedMinor(discount, listMinor);
    if (offer === listMinor) return list;
    return (
      <>
        <span className="font-normal text-muted-foreground line-through">{list}</span>{" "}
        {formatMoney(offer, itemCurrency)}
      </>
    );
  };

  const toggleIn = (set: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    set((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const toggleService = (id: string) => {
    if (serviceIds.includes(id)) {
      setExtraTimes((rows) => rows.filter((r) => r.serviceId !== id));
    }
    toggleIn(setServiceIds)(id);
  };
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
    if (discount === undefined) {
      toast.error(
        discountMode === "percent"
          ? "Enter a whole percentage between 1 and 100"
          : "Enter an amount to take off",
      );
      return;
    }
    if (extraValidation.byKey.size > 0 || extraValidation.listError) {
      setAttemptedTimes(true);
      toast.error(extraValidation.listError ?? "Check the extra times");
      return;
    }
    try {
      const link = await create.mutateAsync({
        name: name.trim(),
        serviceIds,
        packageIds,
        customerIds: clients.map((c) => c.id),
        showFullCatalogue,
        discount,
        ...(extraTimes.length > 0 ? { extraAvailability: toExtraWindows(extraTimes) } : {}),
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
                    price={priceLabel(s.basePriceMinor, s.currency, serviceIds.includes(s.id))}
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
                    price={priceLabel(p.priceMinor, p.currency, packageIds.includes(p.id))}
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

          {serviceIds.length > 0 ? (
            <ExtraTimesEditor
              rows={extraTimes}
              onChange={setExtraTimes}
              serviceIds={serviceIds}
              serviceName={(id) => services.find((s) => s.id === id)?.name ?? nouns.noun}
              nouns={nouns}
              errors={attemptedTimes ? extraValidation.byKey : new Map<string, string>()}
              listError={attemptedTimes ? extraValidation.listError : null}
            />
          ) : null}

          {nothingToShare ? null : (
            <div className="grid gap-2">
              <Label>Discount (optional)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex rounded-xl border p-0.5"
                  role="radiogroup"
                  aria-label="Discount"
                >
                  {(
                    [
                      ["none", "None"],
                      ["percent", "% off"],
                      ["amount", `${currencySymbol(currency)} off`],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={discountMode === mode}
                      onClick={() => setDiscountMode(mode)}
                      className={`rounded-[10px] px-3 py-1.5 text-sm transition ${
                        discountMode === mode
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {discountMode !== "none" ? (
                  <Input
                    id="pl-discount"
                    inputMode="decimal"
                    className="w-28"
                    aria-label={discountMode === "percent" ? "Percent off" : "Amount off"}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountMode === "percent" ? "20" : "10.00"}
                    autoFocus
                  />
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {discountMode === "none"
                  ? "Take something off everything in this link for whoever books through it. Prices on your booking page are unchanged."
                  : discountMode === "percent"
                    ? `A whole percentage off each ${nouns.lower} and package in the link.`
                    : `Taken off each booking and each package bought through the link — once per booking, never below free.`}
              </p>
            </div>
          )}

          {nothingToShare ? null : (
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-3">
              <span className="grid gap-0.5 text-sm">
                <span className="font-medium">Link to your full booking page</span>
                <span className="text-xs text-muted-foreground">
                  Adds “Looking for something else? See everything you offer” under the offer.
                  Switch off to keep clients to just what this link names.
                </span>
              </span>
              <Switch
                checked={showFullCatalogue}
                onCheckedChange={setShowFullCatalogue}
                aria-label="Link to your full booking page"
              />
            </label>
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
