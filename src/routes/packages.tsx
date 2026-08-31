import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Eye, EyeOff, Plus, Ticket } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
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
import { validityLabel } from "@/lib/packages";
import { toast } from "sonner";

export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      { title: "Packages — RECAVO" },
      {
        name: "description",
        content: "Prepaid session packages clients can buy up front.",
      },
      { property: "og:title", content: "RECAVO Packages" },
      {
        property: "og:description",
        content: "Prepaid session packages clients can buy up front.",
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

  return (
    <>
      <PageHeader
        title="Packages"
        description="Prepaid blocks of sessions clients can buy up front."
        actions={
          <>
            <Button variant="outline" onClick={() => setQuick("package")}>
              Sell package
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Create package
            </Button>
          </>
        }
      />

      {packages.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="surface-card h-[280px] animate-pulse" />
          ))}
        </div>
      ) : packages.isError ? (
        <EmptyState
          title="Couldn't load packages"
          description={
            packages.error instanceof ApiError
              ? packages.error.detail || packages.error.title
              : "Please try again shortly."
          }
          action={<Button onClick={() => packages.refetch()}>Try again</Button>}
        />
      ) : (packages.data ?? []).length === 0 ? (
        <EmptyState
          title="No packages yet"
          description="Create a package so clients can buy credits up front."
          action={<Button onClick={() => setCreating(true)}>Create package</Button>}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(packages.data ?? []).map((p) => {
            const eligible =
              p.eligibleServiceIds.length === 0
                ? "Any session"
                : p.eligibleServiceIds
                    .map((id) => services.data?.find((s) => s.id === id)?.name)
                    .filter(Boolean)
                    .join(", ") || "Any session";
            return (
              <article key={p.id} className="surface-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Ticket className="size-4" />
                  </span>
                  <div className="flex items-center gap-2">
                    {p.salesAvailable ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="size-3.5" /> On booking page
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <EyeOff className="size-3.5" /> Hidden from booking page
                      </span>
                    )}
                    <StatusBadge status={p.active ? "active" : "inactive"} />
                  </div>
                </div>
                <h2 className="mt-3 text-lg font-semibold">{p.name}</h2>
                {p.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {formatMoney(p.priceMinor, p.currency)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Ticket className="size-4 text-muted-foreground" />
                    {p.creditsIssued} {p.creditsIssued === 1 ? "session" : "sessions"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-4 text-muted-foreground" />
                    Valid {validityLabel(p.validity)}
                  </span>
                </div>

                <dl className="mt-4 space-y-2 border-t pt-4 text-xs">
                  <Row label="Sessions" value={eligible} />
                  <Row label="Transferable" value={p.transferable ? "Yes" : "No"} />
                </dl>

                <div className="mt-auto flex items-center justify-between pt-5">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
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
                    {p.active ? "On sale" : "Paused"}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                    Edit package
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Credit balances live on the client profile.{" "}
        <Link to="/clients" className="text-primary hover:underline">
          Go to clients
        </Link>
        {" · "}
        <button
          type="button"
          className="text-primary hover:underline disabled:opacity-50"
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
          {expireCredits.isPending ? "Running expiry sweep…" : "Run expiry sweep"}
        </button>
      </p>

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
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
