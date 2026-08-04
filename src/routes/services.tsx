import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Clock, Eye, EyeOff, Plus, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useCreateService,
  useLocationsList,
  useServices,
  useStaffList,
  useUpdateService,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import { formatMoney, parseMoneyToMinor } from "@/lib/format";
import type { CatalogueService } from "@/lib/api/types";
import { toast } from "sonner";

const searchSchema = z.object({
  create: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/services")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Services — RECAVO" },
      {
        name: "description",
        content:
          "Manage bookable services: duration, price, capacity, assigned trainers, locations and cancellation rules.",
      },
      { property: "og:title", content: "RECAVO Services" },
      {
        property: "og:description",
        content: "One-to-one, two-to-one and group services with full booking rules.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ServicesPage />
      </AppShell>
    </RequireAuth>
  ),
});

function ServicesPage() {
  const { create: openCreate } = Route.useSearch();
  const navigate = Route.useNavigate();
  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const updateService = useUpdateService();
  const [editing, setEditing] = useState<CatalogueService | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!openCreate) return;
    setCreating(true);
    void navigate({ search: { create: undefined }, replace: true });
  }, [openCreate, navigate]);

  return (
    <>
      <PageHeader
        title="Services"
        description="What clients can book, how long it takes and what it costs."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create service
          </Button>
        }
      />

      {services.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="surface-card h-[280px] animate-pulse" />
          ))}
        </div>
      ) : services.isError ? (
        <EmptyState
          title="Couldn't load services"
          description={
            services.error instanceof ApiError
              ? services.error.detail || services.error.title
              : "Please try again shortly."
          }
          action={<Button onClick={() => services.refetch()}>Try again</Button>}
        />
      ) : (services.data ?? []).length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Create your first bookable service to start taking bookings."
          action={<Button onClick={() => setCreating(true)}>Create service</Button>}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(services.data ?? []).map((s) => (
            <article key={s.id} className="surface-card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.colour ?? "var(--color-chart-2)" }}
                />
                <div className="flex items-center gap-2">
                  {s.publicVisible ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="size-3.5" /> Public
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <EyeOff className="size-3.5" /> Hidden from booking page
                    </span>
                  )}
                  <StatusBadge status={s.active ? "active" : "inactive"} />
                </div>
              </div>
              <h2 className="mt-3 text-lg font-semibold">{s.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-muted-foreground" />
                  {s.durationMinutes} min
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  {formatMoney(s.basePriceMinor, s.currency)}
                  {s.capacityMax > 1 ? " pp" : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-4 text-muted-foreground" />
                  {s.capacityMax} {s.capacityMax === 1 ? "place" : "places"}
                </span>
              </div>

              {s.variants.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  {s.variants.map((v) => (
                    <li key={v.id} className="flex items-center justify-between">
                      <span>{v.name}</span>
                      <span className="tabular-nums">
                        {v.durationMinutes ? `${v.durationMinutes} min` : "—"} ·{" "}
                        {v.priceMinor != null ? formatMoney(v.priceMinor, s.currency) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <dl className="mt-4 space-y-2 border-t pt-4 text-xs">
                <Row
                  label="Trainers"
                  value={
                    s.eligibleStaffIds
                      .map((id) => staff.data?.find((m) => m.id === id)?.displayName)
                      .filter(Boolean)
                      .join(", ") || "Any"
                  }
                />
                <Row
                  label="Locations"
                  value={
                    s.locationIds
                      .map((id) => locations.data?.find((l) => l.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "All"
                  }
                />
                <Row
                  label="Booking notice"
                  value={`${Math.round(s.bookingNoticeMinutes / 60)} hours`}
                />
                <Row label="Cancellation" value={`${s.cancellationPolicy.windowHours} hours`} />
                <Row
                  label="Buffer"
                  value={`${s.bufferBeforeMinutes + s.bufferAfterMinutes} minutes`}
                />
              </dl>

              <div className="mt-5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={s.active}
                    disabled={updateService.isPending}
                    onCheckedChange={(v) => {
                      updateService.mutate(
                        {
                          serviceId: s.id,
                          version: s.version,
                          body: { active: v, depositMinor: 0 },
                        },
                        {
                          onSuccess: () =>
                            toast.success(v ? "Service activated" : "Service paused"),
                        },
                      );
                    }}
                  />
                  {s.active ? "Bookable" : "Hidden"}
                </span>
                <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                  Edit service
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ServiceDialog
        open={creating || editing !== null}
        service={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
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

type VariantRow = {
  id?: string;
  name: string;
  durationMinutes: string;
  priceMinor: string;
};

function toVariantRows(service: CatalogueService | null): VariantRow[] {
  if (!service) return [];
  return service.variants.map((v) => ({
    id: v.id,
    name: v.name,
    durationMinutes: v.durationMinutes != null ? String(v.durationMinutes) : "",
    priceMinor: v.priceMinor != null ? (v.priceMinor / 100).toFixed(2) : "",
  }));
}

function ServiceDialog({
  open,
  service,
  onClose,
}: {
  open: boolean;
  service: CatalogueService | null;
  onClose: () => void;
}) {
  const createService = useCreateService();
  const updateService = useUpdateService();
  const [name, setName] = useState(service?.name ?? "");
  const [price, setPrice] = useState(String(service ? service.basePriceMinor / 100 : 50));
  const [duration, setDuration] = useState(String(service?.durationMinutes ?? 60));
  const [capacity, setCapacity] = useState(String(service?.capacityMax ?? 1));
  const [description, setDescription] = useState(service?.description ?? "");
  const [active, setActive] = useState(service?.active ?? true);
  const [publicVisible, setPublicVisible] = useState(service?.publicVisible ?? true);
  const [variants, setVariants] = useState<VariantRow[]>(() => toVariantRows(service));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submitting = createService.isPending || updateService.isPending;

  const resetFrom = (s: CatalogueService | null) => {
    setName(s?.name ?? "");
    setPrice(String(s ? s.basePriceMinor / 100 : 50));
    setDuration(String(s?.durationMinutes ?? 60));
    setCapacity(String(s?.capacityMax ?? 1));
    setDescription(s?.description ?? "");
    setActive(s?.active ?? true);
    setPublicVisible(s?.publicVisible ?? true);
    setVariants(toVariantRows(s));
    setFieldErrors({});
  };

  const updateVariant = (index: number, patch: Partial<VariantRow>) => {
    setVariants((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeVariant = (index: number) => {
    setVariants((rows) => rows.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Give the service a name");
      throw new Error("validation");
    }

    let basePriceMinor: number;
    try {
      basePriceMinor = parseMoneyToMinor(price);
    } catch {
      setFieldErrors((prev) => ({ ...prev, basePriceMinor: "Enter a valid price" }));
      toast.error("Enter a valid price");
      throw new Error("validation");
    }

    const durationMinutes = Number(duration) || 60;
    const capacityMax = Number(capacity) || 1;

    // depositMinor is offline/manual-only and the API rejects values > 0
    // (TOO_BIG on create, UNSUPPORTED on update) until online deposit
    // capture ships — always send 0.
    const variantsPayload = variants
      .filter((v) => v.name.trim())
      .map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        name: v.name.trim(),
        durationMinutes: v.durationMinutes.trim() ? Number(v.durationMinutes) : null,
        priceMinor: v.priceMinor.trim() ? parseMoneyToMinor(v.priceMinor) : null,
      }));

    const body: Record<string, unknown> = {
      name,
      description: description || null,
      durationMinutes,
      basePriceMinor,
      capacityMax,
      active,
      publicVisible,
      depositMinor: 0,
      variants: variantsPayload,
    };

    setFieldErrors({});
    try {
      if (service) {
        await updateService.mutateAsync({
          serviceId: service.id,
          version: service.version,
          body,
        });
        toast.success("Service updated");
      } else {
        await createService.mutateAsync({ ...body, currency: "GBP", capacityMin: 1 });
        toast.success("Service created");
      }
    } catch (err) {
      // The mutation hooks already toast the error (and, on 409, refetch the
      // service list so the version is fresh next time this dialog opens).
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
        else resetFrom(service);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Create service"}</DialogTitle>
          <DialogDescription>
            Set pricing, capacity and the booking rules clients see on your booking page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="1-to-1 Personal Training"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="s-dur">Duration (min)</Label>
              <Input
                id="s-dur"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                aria-invalid={Boolean(fieldErrors.durationMinutes)}
              />
              {fieldErrors.durationMinutes ? (
                <p className="text-xs text-destructive">{fieldErrors.durationMinutes}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-price">Price (£)</Label>
              <Input
                id="s-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={Boolean(fieldErrors.basePriceMinor)}
              />
              {fieldErrors.basePriceMinor ? (
                <p className="text-xs text-destructive">{fieldErrors.basePriceMinor}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-cap">Max capacity</Label>
              <Input
                id="s-cap"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                aria-invalid={Boolean(fieldErrors.capacityMax)}
              />
              {fieldErrors.capacityMax ? (
                <p className="text-xs text-destructive">{fieldErrors.capacityMax}</p>
              ) : null}
            </div>
          </div>
          {fieldErrors.depositMinor ? (
            <p className="text-xs text-destructive">
              Deposit: {fieldErrors.depositMinor} — online deposits aren't supported yet, so
              deposits are always kept at £0.
            </p>
          ) : null}

          <div className="grid gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Variants</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVariants((rows) => [
                    ...rows,
                    { name: "", durationMinutes: "", priceMinor: "" },
                  ])
                }
              >
                <Plus className="size-3.5" /> Add variant
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Optional named options (e.g. "60 min" / "90 min"). Leave duration or price blank to
              fall back to the service default.
            </p>
            {variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No variants — this service books as-is.
              </p>
            ) : (
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1">
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input
                        value={v.name}
                        onChange={(e) => updateVariant(i, { name: e.target.value })}
                        placeholder="60 minutes"
                      />
                    </div>
                    <div className="grid w-24 gap-1">
                      <Label className="text-xs text-muted-foreground">Duration</Label>
                      <Input
                        value={v.durationMinutes}
                        onChange={(e) => updateVariant(i, { durationMinutes: e.target.value })}
                        placeholder={duration}
                      />
                    </div>
                    <div className="grid w-24 gap-1">
                      <Label className="text-xs text-muted-foreground">Price (£)</Label>
                      <Input
                        value={v.priceMinor}
                        onChange={(e) => updateVariant(i, { priceMinor: e.target.value })}
                        placeholder={price}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeVariant(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Allow new bookings for this service</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Public</p>
                <p className="text-xs text-muted-foreground">Show on the public booking page</p>
              </div>
              <Switch checked={publicVisible} onCheckedChange={setPublicVisible} />
            </div>
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
            {submitting ? "Saving…" : service ? "Save changes" : "Create service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
