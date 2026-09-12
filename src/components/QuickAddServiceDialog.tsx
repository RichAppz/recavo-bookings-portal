import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
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
import { ApiError } from "@/lib/api";
import { useCreateService } from "@/lib/api/hooks";
import type { CatalogueService } from "@/lib/api/types";
import {
  buildQuickAddService,
  type DurationUnit,
  type QuickAddServiceErrors,
} from "@/lib/quick-add-service";
import { knownCategories } from "@/lib/service-categories";
import { useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

const NO_CATEGORY = "__none";
const NEW_CATEGORY = "__new";

/**
 * Compact "new service" form for the middle of a booking: a detailer with a customer
 * beside them asking for something not on the menu adds it here — name, category,
 * how long, how much — and it's ticked in the picker straight away. Everything the
 * full Services form also asks (deposit, variants, offer windows, colour, who delivers
 * it) takes a sensible default and can be tidied up later.
 */
export function QuickAddServiceDialog({
  open,
  onOpenChange,
  services,
  initialName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The catalogue as loaded — for the category list and the currency to match. */
  services: CatalogueService[];
  /** What was typed in the picker's search box, so it isn't typed twice. */
  initialName?: string;
  onCreated: (service: CatalogueService) => void;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const createService = useCreateService();
  const isDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const serviceNoun = (
    tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service"
  ).toLowerCase();
  const categories = useMemo(() => knownCategories(services), [services]);
  const currency = services[0]?.currency ?? tenant.business?.currency ?? "GBP";

  const [name, setName] = useState("");
  const [categoryChoice, setCategoryChoice] = useState(NO_CATEGORY);
  const [newCategory, setNewCategory] = useState("");
  const [durationValue, setDurationValue] = useState("1");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("hours");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<QuickAddServiceErrors>({});

  // Fresh form every time it opens, seeded with whatever the search box held.
  useEffect(() => {
    if (!open) return;
    setName(initialName?.trim() ?? "");
    setCategoryChoice(NO_CATEGORY);
    setNewCategory("");
    setDurationValue("1");
    setDurationUnit("hours");
    setPrice("");
    setErrors({});
  }, [open, initialName]);

  const category =
    categoryChoice === NO_CATEGORY
      ? ""
      : categoryChoice === NEW_CATEGORY
        ? newCategory
        : categoryChoice;

  const submit = async () => {
    const built = buildQuickAddService({
      name,
      category,
      durationValue,
      durationUnit,
      price,
      currency,
    });
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    try {
      const created = await createService.mutateAsync(built.body);
      onCreated(created);
      onOpenChange(false);
      toast.success(`${created.name} added — fine-tune it later in Services`, {
        description:
          "It's ticked on this booking. Deposit, variants and who delivers it can be set from the Services page.",
        action: {
          label: "Open Services",
          onClick: () => void navigate({ to: "/services" }),
        },
      });
    } catch (err) {
      // useCreateService toasts the error; field complaints also show inline.
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setErrors(
          Object.fromEntries(
            err.fieldErrors
              .filter((fe) => fe.field)
              .map((fe) => [fe.field, fe.message || fe.code || "Invalid"]),
          ) as QuickAddServiceErrors,
        );
      }
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-quick-add-service="">
        <DialogHeader>
          <DialogTitle>New {serviceNoun}</DialogTitle>
          <DialogDescription>
            Just the essentials — it's added to the booking as soon as you save. Deposit, variants
            and offer windows can be set later in Services.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="qas-name">Name</Label>
            <Input
              id="qas-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onEnter}
              placeholder={isDetailing ? "Headlight restoration" : "1-to-1 session"}
              aria-invalid={Boolean(errors.name)}
              disabled={createService.isPending}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="qas-category">Category</Label>
            <Select
              value={categoryChoice}
              onValueChange={setCategoryChoice}
              disabled={createService.isPending}
            >
              <SelectTrigger id="qas-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_CATEGORY}>New category…</SelectItem>
              </SelectContent>
            </Select>
            {categoryChoice === NEW_CATEGORY ? (
              <Input
                aria-label="New category name"
                value={newCategory}
                autoFocus
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={onEnter}
                placeholder={isDetailing ? "Polishing" : "Classes"}
                disabled={createService.isPending}
              />
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="qas-duration">
                {isDetailing ? "How long you'll have the vehicle" : "Duration"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="qas-duration"
                  inputMode="decimal"
                  value={durationValue}
                  onChange={(e) => setDurationValue(e.target.value)}
                  onKeyDown={onEnter}
                  aria-invalid={Boolean(errors.durationMinutes)}
                  className="min-w-0 flex-1"
                  disabled={createService.isPending}
                />
                <Select
                  value={durationUnit}
                  onValueChange={(v) => setDurationUnit(v as DurationUnit)}
                  disabled={createService.isPending}
                >
                  <SelectTrigger className="w-28 shrink-0" aria-label="Duration unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">minutes</SelectItem>
                    <SelectItem value="hours">hours</SelectItem>
                    <SelectItem value="days">days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {errors.durationMinutes ? (
                <p className="text-xs text-destructive">{errors.durationMinutes}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qas-price">Price (£)</Label>
              <Input
                id="qas-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onKeyDown={onEnter}
                placeholder="0.00"
                aria-invalid={Boolean(errors.basePriceMinor)}
                disabled={createService.isPending}
              />
              {errors.basePriceMinor ? (
                <p className="text-xs text-destructive">{errors.basePriceMinor}</p>
              ) : null}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Anyone on the team can deliver it, at any location, and it shows on your booking page.
            No deposit until you set one.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createService.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={createService.isPending}>
            {createService.isPending ? "Adding…" : `Add ${serviceNoun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
