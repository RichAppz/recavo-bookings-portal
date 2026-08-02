import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { ApiError } from "@/lib/api";
import {
  useCreatePackage,
  useExpireCredits,
  usePackages,
  useServices,
  useUpdatePackage,
} from "@/lib/api/hooks";
import type { Package } from "@/lib/api/types";
import { formatMoney, parseMoneyToMinor } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      { title: "Packages and credits — RECAVO" },
      {
        name: "description",
        content:
          "Sell session packages, track credit balances and follow every credit movement in the ledger.",
      },
      { property: "og:title", content: "RECAVO Packages" },
      {
        property: "og:description",
        content: "Credit packages, expiries and the full credit ledger.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <PackagesPage />
      </AppShell>
    </RequireAuth>
  ),
});

function PackagesPage() {
  const packages = usePackages();
  const services = useServices();
  const updatePackage = useUpdatePackage();
  const expireCredits = useExpireCredits();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Package | null>(null);
  const [quick, setQuick] = useState<QuickAction>(null);

  const activePackages = (packages.data ?? []).filter((p) => p.active).length;

  return (
    <>
      <PageHeader
        title="Packages and credits"
        description="Prepaid blocks of sessions, plus every credit movement across your clients."
        actions={
          <>
            <Button
              variant="outline"
              disabled={expireCredits.isPending}
              onClick={async () => {
                const result = await expireCredits.mutateAsync();
                toast.success(
                  result.expired.length === 0
                    ? "No credits were due to expire"
                    : `Expired ${result.expired.length} entitlement(s)`,
                  { description: result.requestId ? `Ref: ${result.requestId}` : undefined },
                );
              }}
            >
              Run expiry sweep
            </Button>
            <Button variant="outline" onClick={() => setQuick("package")}>
              Sell package
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New package
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Package types" value={String((packages.data ?? []).length)} />
        <StatCard label="Available to buy" value={String(activePackages)} />
        <StatCard
          label="Total credits per sale"
          value={String((packages.data ?? []).reduce((s, p) => s + p.creditsIssued, 0))}
          hint="across all package types"
        />
      </div>

      <SectionCard title="Package types" bodyClassName="p-0">
        {packages.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading packages…</p>
        ) : packages.isError ? (
          <div className="p-6">
            <EmptyState
              title="Couldn't load packages"
              description={
                packages.error instanceof ApiError
                  ? packages.error.detail || packages.error.title
                  : "Please try again shortly."
              }
              action={<Button onClick={() => packages.refetch()}>Try again</Button>}
            />
          </div>
        ) : (packages.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No packages yet"
              description="Create a package to let clients buy credits up front."
              action={<Button onClick={() => setCreating(true)}>New package</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Package",
                    "Price",
                    "Credits",
                    "Validity",
                    "Eligible services",
                    "Available",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(packages.data ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/50">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoney(p.priceMinor, p.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{p.creditsIssued}</td>
                    <td className="px-4 py-3">
                      {p.validity.amount} {p.validity.kind.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.eligibleServiceIds.length === 0
                        ? "All services"
                        : p.eligibleServiceIds
                            .map((id) => services.data?.find((s) => s.id === id)?.name)
                            .filter(Boolean)
                            .join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={p.active}
                        disabled={updatePackage.isPending}
                        onCheckedChange={(v) =>
                          updatePackage.mutate(
                            { packageId: p.id, version: p.version, body: { active: v } },
                            {
                              onSuccess: () =>
                                toast.success(v ? "Package activated" : "Package paused"),
                            },
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                        <Pencil className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Client credit balances and ledgers"
        description="Open a client profile to view or adjust their balances"
      >
        <Link to="/clients" className="text-sm text-primary hover:underline">
          Go to clients →
        </Link>
      </SectionCard>

      <PackageDialog
        open={creating || editing !== null}
        pkg={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
    </>
  );
}

function PackageDialog({
  open,
  pkg,
  onClose,
}: {
  open: boolean;
  pkg: Package | null;
  onClose: () => void;
}) {
  const createPackage = useCreatePackage();
  const updatePackage = useUpdatePackage();
  const services = useServices();

  const [name, setName] = useState(pkg?.name ?? "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [price, setPrice] = useState(String(pkg ? pkg.priceMinor / 100 : 180));
  const [credits, setCredits] = useState(String(pkg?.creditsIssued ?? 4));
  const [validityKind, setValidityKind] = useState<"calendar_months" | "days">(
    pkg?.validity.kind ?? "calendar_months",
  );
  const [validityAmount, setValidityAmount] = useState(String(pkg?.validity.amount ?? 1));
  const [eligibleServiceIds, setEligibleServiceIds] = useState<string[]>(
    pkg?.eligibleServiceIds ?? [],
  );
  const [transferable, setTransferable] = useState(pkg?.transferable ?? false);
  const [salesAvailable, setSalesAvailable] = useState(pkg?.salesAvailable ?? true);
  const [active, setActive] = useState(pkg?.active ?? true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submitting = createPackage.isPending || updatePackage.isPending;

  const resetFrom = (p: Package | null) => {
    setName(p?.name ?? "");
    setDescription(p?.description ?? "");
    setPrice(String(p ? p.priceMinor / 100 : 180));
    setCredits(String(p?.creditsIssued ?? 4));
    setValidityKind(p?.validity.kind ?? "calendar_months");
    setValidityAmount(String(p?.validity.amount ?? 1));
    setEligibleServiceIds(p?.eligibleServiceIds ?? []);
    setTransferable(p?.transferable ?? false);
    setSalesAvailable(p?.salesAvailable ?? true);
    setActive(p?.active ?? true);
    setFieldErrors({});
  };

  useEffect(() => {
    if (open) resetFrom(pkg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id]);

  const toggleService = (id: string) =>
    setEligibleServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Give the package a name");
      throw new Error("validation");
    }

    let priceMinor: number;
    try {
      priceMinor = parseMoneyToMinor(price);
    } catch {
      setFieldErrors((prev) => ({ ...prev, priceMinor: "Enter a valid price" }));
      toast.error("Enter a valid price");
      throw new Error("validation");
    }

    const body: Record<string, unknown> = {
      name,
      description: description || null,
      priceMinor,
      creditsIssued: Number(credits) || 1,
      eligibleServiceIds,
      validity: { kind: validityKind, amount: Number(validityAmount) || 1 },
      transferable,
      salesAvailable,
    };

    setFieldErrors({});
    try {
      if (pkg) {
        await updatePackage.mutateAsync({
          packageId: pkg.id,
          version: pkg.version,
          body: { ...body, active },
        });
        toast.success("Package updated");
      } else {
        await createPackage.mutateAsync({ ...body, currency: "GBP" });
        toast.success("Package created");
      }
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setFieldErrors((prev) => ({
          ...prev,
          ...Object.fromEntries(
            err.fieldErrors
              .filter((fe) => fe.field)
              .map((fe) => [fe.field, fe.message || fe.code || "Invalid"]),
          ),
        }));
      }
      throw err;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else resetFrom(pkg);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pkg ? "Edit package" : "New package"}</DialogTitle>
          <DialogDescription>
            Bundle sessions into prepaid credits with an expiry window.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="p-name">Package name</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Monthly 1-to-1 Package"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea
              id="p-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="p-price">Price (£)</Label>
              <Input
                id="p-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={Boolean(fieldErrors.priceMinor)}
              />
              {fieldErrors.priceMinor ? (
                <p className="text-xs text-destructive">{fieldErrors.priceMinor}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-credits">Credits</Label>
              <Input id="p-credits" value={credits} onChange={(e) => setCredits(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Validity</Label>
              <Select
                value={validityKind}
                onValueChange={(v) => setValidityKind(v as typeof validityKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar_months">Months</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-validity-amount">
              Valid for ({validityKind === "calendar_months" ? "months" : "days"})
            </Label>
            <Input
              id="p-validity-amount"
              value={validityAmount}
              onChange={(e) => setValidityAmount(e.target.value)}
            />
          </div>

          <div className="grid gap-2 border-t pt-4">
            <Label>Eligible services</Label>
            {(services.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No services created yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(services.data ?? []).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={eligibleServiceIds.includes(s.id)}
                      onCheckedChange={() => toggleService(s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave all unchecked so credits can be used on any service.
            </p>
          </div>

          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Available to buy</p>
                <p className="text-xs text-muted-foreground">Show on the public booking page</p>
              </div>
              <Switch checked={salesAvailable} onCheckedChange={setSalesAvailable} />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Transferable</p>
                <p className="text-xs text-muted-foreground">Credits can move between clients</p>
              </div>
              <Switch checked={transferable} onCheckedChange={setTransferable} />
            </div>
            {pkg ? (
              <div className="flex items-center justify-between rounded-xl border p-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">
                    Inactive packages can't be sold or referenced by new purchases
                  </p>
                </div>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              try {
                await handleSubmit();
                onClose();
              } catch {
                // Errors are surfaced via toast/inline field messages above.
              }
            }}
          >
            {submitting ? "Saving…" : pkg ? "Save changes" : "Create package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
