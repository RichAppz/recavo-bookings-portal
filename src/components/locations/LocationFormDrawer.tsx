import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { HoursEditorDrawer, DEFAULT_HOURS } from "@/components/locations/HoursEditorDrawer";
import { PinTile } from "@/components/locations/parts";
import { TimezoneCombobox } from "@/components/TimezoneCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsPhone } from "@/hooks/use-media-query";
import { useCreateLocation, useLocationsList, useUpdateLocation } from "@/lib/api/hooks";
import type { CreateLocationBody } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import type { Location } from "@/lib/api/types";
import type { LocationKind, OpeningHour } from "@/lib/locations";
import {
  hoursSummary,
  KIND_LABEL,
  kindOf,
  lookupPostcode,
  looksLikeUkPostcode,
  NAME_MAX,
  namePlaceholder,
  PARKING_MAX,
  parkingPlaceholder,
  RADIUS_CHOICES,
  tidyPostcode,
  timezoneLabel,
  TRAVEL_CHOICES,
  typeForKind,
} from "@/lib/locations";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type Field =
  | "name"
  | "line1"
  | "postcode"
  | "basePostcode"
  | "radius"
  | "parkingNote"
  | "phone"
  | "timezone"
  | "address"
  | "area";

const KIND_HELP: Record<LocationKind, string> = {
  premises: "A unit, studio or shop with an address.",
  mobile: "You travel to them. Set an area and travel time.",
};

const API_FIELDS: Record<string, Field> = {
  name: "name",
  "address.line1": "line1",
  "address.postcode": "postcode",
  "serviceArea.basePostcode": "basePostcode",
  "serviceArea.radiusMiles": "radius",
  parkingNote: "parkingNote",
  phone: "phone",
  timezone: "timezone",
};

type Coords = { lat: number | null; lng: number | null };

/**
 * Add or edit a location: name, how clients get to you (with the address or the
 * area covered), parking, time zone, phone, opening hours and whether clients can
 * book it online. Inline errors only. Right drawer on desktop, sheet on phone.
 */
export function LocationFormDrawer({
  open,
  onOpenChange,
  location,
  everBooked,
  planNote,
  onSaved,
  onPlanLimit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null adds a new location. */
  location: Location | null;
  /** Its kind is fixed once booked. */
  everBooked: boolean;
  /** "This will be location 3 of 5 on your Growth plan." (Add only). */
  planNote: string | null;
  onSaved?: (location: Location, created: boolean) => void;
  onPlanLimit: () => void;
}) {
  const phone = useIsPhone();
  const tenant = useTenant();
  const industry = tenant.business?.industryTemplateKey;
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const list = useLocationsList();
  const nameRef = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState<Location | null>(location);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LocationKind>("premises");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [town, setTown] = useState("");
  const [postcode, setPostcode] = useState("");
  const [coords, setCoords] = useState<Coords>({ lat: null, lng: null });
  const [basePostcode, setBasePostcode] = useState("");
  const [areaCoords, setAreaCoords] = useState<Coords>({ lat: null, lng: null });
  const [radius, setRadius] = useState<number>(15);
  const [radiusOther, setRadiusOther] = useState(false);
  const [travel, setTravel] = useState<number>(30);
  const [parking, setParking] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [hours, setHours] = useState<OpeningHour[]>(DEFAULT_HOURS);
  const [online, setOnline] = useState(true);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState<"address" | "area" | null>(null);
  const [tried, setTried] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const seed = (l: Location | null) => {
    setCurrent(l);
    setName(l?.name ?? "");
    setKind(l ? kindOf(l) : "premises");
    setLine1(l?.address?.line1 ?? "");
    setLine2(l?.address?.line2 ?? "");
    setTown(l?.address?.town ?? "");
    setPostcode(l?.address?.postcode ?? "");
    setCoords({ lat: l?.address?.lat ?? null, lng: l?.address?.lng ?? null });
    setBasePostcode(l?.serviceArea?.basePostcode ?? "");
    setAreaCoords({ lat: l?.serviceArea?.lat ?? null, lng: l?.serviceArea?.lng ?? null });
    const r = l?.serviceArea?.radiusMiles ?? 15;
    setRadius(r);
    setRadiusOther(!RADIUS_CHOICES.includes(r as (typeof RADIUS_CHOICES)[number]));
    setTravel(l ? l.travelMinutes : 30);
    setParking(l?.parkingNote ?? "");
    setTimezone(l?.timezone ?? tenant.business?.defaultTimezone ?? "Europe/London");
    setPhoneNumber(l?.phone ?? "");
    setHours(l ? [...l.openingHours] : DEFAULT_HOURS);
    setOnline(l ? l.publicVisible : true);
    setTried(false);
    setErrors({});
    setFormError(null);
  };

  useEffect(() => {
    if (open) seed(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, location?.id]);

  const premises = kind === "premises";
  const hasAddress = line1.trim().length > 0 || postcode.trim().length > 0;

  const validate = () => {
    const next: Partial<Record<Field, string>> = {};
    if (!name.trim()) {
      next.name = `Give the location a name, ${namePlaceholder(industry)}.`;
    }
    if (premises) {
      if (hasAddress && !line1.trim()) next.line1 = "Add the first line of the address.";
      if (hasAddress && !postcode.trim()) next.postcode = "Add the postcode.";
      if (online && !hasAddress) {
        next.address = "Add an address so clients know where to go, or turn off online booking.";
      }
    } else {
      if (online && !basePostcode.trim()) {
        next.area = "Add the postcode you work from, or turn off online booking.";
      }
      if (!(radius > 0 && radius <= 200)) next.radius = "Pick how far you travel, up to 200 miles.";
    }
    return next;
  };
  const live = tried ? validate() : {};
  const shown = { ...live, ...errors };
  const missing = [
    !name.trim() ? "a name" : null,
    shown.address ? "an address" : null,
    shown.area ? "your area" : null,
  ].filter(Boolean) as string[];

  /** "missing" means the postcode doesn't exist; null means the lookup couldn't run. */
  const findPostcode = async (which: "address" | "area"): Promise<Coords | "missing" | null> => {
    const raw = which === "address" ? postcode : basePostcode;
    const tidy = tidyPostcode(raw);
    if (which === "address") setPostcode(tidy);
    else setBasePostcode(tidy);
    if (!looksLikeUkPostcode(tidy)) return null;
    setLookingUp(which);
    try {
      const found = await lookupPostcode(tidy);
      const field: Field = which === "address" ? "postcode" : "basePostcode";
      if (!found) {
        setErrors((e) => ({
          ...e,
          [field]: "We couldn't find that postcode. Check it and try again.",
        }));
        return "missing";
      }
      setErrors((e) => ({ ...e, [field]: undefined }));
      if (which === "address") {
        setPostcode(found.postcode);
        setCoords({ lat: found.lat, lng: found.lng });
        if (!town.trim() && found.town) setTown(found.town);
      } else {
        setBasePostcode(found.postcode);
        setAreaCoords({ lat: found.lat, lng: found.lng });
      }
      return { lat: found.lat, lng: found.lng };
    } catch {
      // Offline or the lookup is down: the postcode is still saved, just without a map pin.
      return null;
    } finally {
      setLookingUp(null);
    }
  };

  const submitting = createLocation.isPending || updateLocation.isPending;

  const submit = async () => {
    setTried(true);
    setFormError(null);
    const found = validate();
    setErrors({});
    if (Object.keys(found).length > 0) {
      if (found.name) nameRef.current?.focus();
      return;
    }
    let pin = coords;
    let areaPin = areaCoords;
    if (premises && hasAddress && pin.lat === null) {
      const hit = await findPostcode("address");
      if (hit === "missing") return;
      pin = hit ?? pin;
    }
    if (!premises && basePostcode.trim() && areaPin.lat === null) {
      const hit = await findPostcode("area");
      if (hit === "missing") return;
      areaPin = hit ?? areaPin;
    }
    const details = premises
      ? {
          address: hasAddress
            ? {
                line1: line1.trim(),
                line2: line2.trim() || null,
                town: town.trim() || null,
                postcode: tidyPostcode(postcode),
                lat: pin.lat,
                lng: pin.lng,
              }
            : null,
          parkingNote: parking.trim() || null,
          serviceArea: null,
          travelMinutes: 0,
        }
      : {
          serviceArea: basePostcode.trim()
            ? {
                basePostcode: tidyPostcode(basePostcode),
                radiusMiles: radius,
                lat: areaPin.lat,
                lng: areaPin.lng,
              }
            : null,
          travelMinutes: travel,
          address: null,
          parkingNote: null,
        };
    const body: CreateLocationBody = {
      name: name.trim(),
      type: current && kindOf(current) === kind ? current.type : typeForKind(kind),
      timezone,
      openingHours: hours,
      publicVisible: online,
      phone: phoneNumber.trim() || null,
      ...details,
    };
    try {
      if (current) {
        const saved = await updateLocation.mutateAsync({
          locationId: current.id,
          version: current.version,
          body,
        });
        toast.success("Changes saved");
        onSaved?.(saved, false);
      } else {
        const saved = await createLocation.mutateAsync(body);
        toast.success(`${saved.name} added`);
        onSaved?.(saved, true);
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PLAN_LIMIT_EXCEEDED") {
        onOpenChange(false);
        onPlanLimit();
        return;
      }
      if (err instanceof ApiError && err.isConflict && current) {
        const fresh = await list.refetch();
        const row = fresh.data?.find((l) => l.id === current.id) ?? null;
        if (row) seed(row);
        setFormError("Someone else just saved this location. We've loaded their version.");
        return;
      }
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        const mapped: Partial<Record<Field, string>> = {};
        for (const fe of err.fieldErrors) {
          const key = fe.field ? API_FIELDS[fe.field] : undefined;
          if (key) mapped[key] = fe.message || "Check this field.";
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          return;
        }
      }
      setFormError(
        err instanceof ApiError
          ? err.detail || err.title
          : "Couldn't save. Check your connection and try again.",
      );
    }
  };

  const errorId = (f: Field) => (shown[f] ? `lf-${f}-error` : undefined);
  const fieldError = (f: Field) =>
    shown[f] ? (
      <p id={`lf-${f}-error`} className="text-xs text-destructive">
        {shown[f]}
      </p>
    ) : null;

  const chip = (on: boolean) =>
    cn(
      "inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors max-sm:h-11",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
    );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={phone ? "bottom" : "right"}
          className={cn(
            "flex w-full flex-col gap-0 p-0",
            phone ? "top-sheet-peek rounded-t-3xl" : "sm:max-w-[480px]",
          )}
        >
          {phone ? (
            <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
          ) : null}
          <SheetHeader className="border-b px-4 sm:px-6 pt-6 pb-4 text-left">
            <SheetTitle className="text-xl font-extrabold">
              {location ? "Edit location" : "Add location"}
            </SheetTitle>
            <SheetDescription>
              {location
                ? "Update the address, hours and who can book here."
                : "A place you work from, with its own address and hours."}
            </SheetDescription>
          </SheetHeader>

          <form
            id="location-form"
            className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 sm:px-6 py-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            noValidate
          >
            {formError ? (
              <p
                role="alert"
                className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="lf-name">Name</Label>
              <Input
                id="lf-name"
                ref={nameRef}
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((x) => ({ ...x, name: undefined }));
                }}
                placeholder={namePlaceholder(industry)}
                aria-invalid={Boolean(shown.name)}
                aria-describedby={errorId("name")}
                autoFocus={!phone && !location}
              />
              {fieldError("name")}
            </div>

            <div className="grid gap-2">
              <span id="lf-kind-label" className="text-sm leading-none font-medium">
                How clients get to you
              </span>
              <div
                role="radiogroup"
                aria-labelledby="lf-kind-label"
                aria-describedby={everBooked && location ? "lf-kind-locked" : undefined}
                className="grid gap-2 sm:grid-cols-2"
              >
                {(["premises", "mobile"] as const).map((k) => {
                  const on = kind === k;
                  const locked = everBooked && Boolean(location) && !on;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={locked}
                      onClick={() => setKind(k)}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        on
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-secondary/50",
                      )}
                    >
                      <PinTile kind={k} size={34} />
                      <span className="grid gap-0.5">
                        <span className="text-sm font-extrabold">{KIND_LABEL[k]}</span>
                        <span className="text-xs text-muted-foreground">{KIND_HELP[k]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {everBooked && location ? (
                <p id="lf-kind-locked" className="text-xs text-muted-foreground">
                  Can't change once booked.
                </p>
              ) : null}
            </div>

            {premises ? (
              <fieldset className="grid gap-3" aria-describedby={errorId("address")}>
                <legend className="mb-2 text-sm leading-none font-medium">Address</legend>
                <div className="grid gap-1.5">
                  <Label htmlFor="lf-postcode" className="text-xs text-muted-foreground">
                    Postcode
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="lf-postcode"
                      value={postcode}
                      maxLength={12}
                      autoComplete="postal-code"
                      onChange={(e) => {
                        setPostcode(e.target.value);
                        setCoords({ lat: null, lng: null });
                        setErrors((x) => ({ ...x, postcode: undefined, address: undefined }));
                      }}
                      onBlur={() => postcode.trim() && void findPostcode("address")}
                      placeholder="LS1 4AB"
                      aria-invalid={Boolean(shown.postcode)}
                      aria-describedby={errorId("postcode")}
                      className="w-36 uppercase"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!postcode.trim() || lookingUp === "address"}
                      onClick={() => void findPostcode("address")}
                    >
                      {lookingUp === "address" ? (
                        <Loader2 className="size-4 animate-spin" aria-label="Looking up" />
                      ) : (
                        "Find"
                      )}
                    </Button>
                  </div>
                  {fieldError("postcode")}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lf-line1" className="text-xs text-muted-foreground">
                    First line
                  </Label>
                  <Input
                    id="lf-line1"
                    value={line1}
                    maxLength={120}
                    autoComplete="address-line1"
                    onChange={(e) => {
                      setLine1(e.target.value);
                      setErrors((x) => ({ ...x, line1: undefined, address: undefined }));
                    }}
                    placeholder="4 Riverside Way"
                    aria-invalid={Boolean(shown.line1)}
                    aria-describedby={errorId("line1")}
                  />
                  {fieldError("line1")}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="lf-line2" className="text-xs text-muted-foreground">
                      Second line (optional)
                    </Label>
                    <Input
                      id="lf-line2"
                      value={line2}
                      maxLength={120}
                      autoComplete="address-line2"
                      onChange={(e) => setLine2(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lf-town" className="text-xs text-muted-foreground">
                      Town
                    </Label>
                    <Input
                      id="lf-town"
                      value={town}
                      maxLength={80}
                      autoComplete="address-level2"
                      onChange={(e) => setTown(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Shown to clients with a Directions link.
                </p>
                {fieldError("address")}
              </fieldset>
            ) : (
              <fieldset className="grid gap-3" aria-describedby={errorId("area")}>
                <legend className="mb-2 text-sm leading-none font-medium">Area you cover</legend>
                <div className="grid gap-1.5">
                  <Label htmlFor="lf-base" className="text-xs text-muted-foreground">
                    Postcode you work from
                  </Label>
                  <Input
                    id="lf-base"
                    value={basePostcode}
                    maxLength={12}
                    onChange={(e) => {
                      setBasePostcode(e.target.value);
                      setAreaCoords({ lat: null, lng: null });
                      setErrors((x) => ({ ...x, basePostcode: undefined, area: undefined }));
                    }}
                    onBlur={() => basePostcode.trim() && void findPostcode("area")}
                    placeholder="LS1 4AB"
                    aria-invalid={Boolean(shown.basePostcode || shown.area)}
                    aria-describedby={errorId("basePostcode")}
                    className="w-36 uppercase"
                  />
                  {fieldError("basePostcode")}
                </div>
                <div className="grid gap-1.5">
                  <span id="lf-radius-label" className="text-xs text-muted-foreground">
                    How far you travel
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby="lf-radius-label"
                    className="flex flex-wrap gap-2"
                  >
                    {RADIUS_CHOICES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={!radiusOther && radius === r}
                        onClick={() => {
                          setRadius(r);
                          setRadiusOther(false);
                        }}
                        className={chip(!radiusOther && radius === r)}
                      >
                        {r} miles
                      </button>
                    ))}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={radiusOther}
                      onClick={() => setRadiusOther(true)}
                      className={chip(radiusOther)}
                    >
                      Other
                    </button>
                  </div>
                  {radiusOther ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={200}
                        aria-label="Miles you travel"
                        value={Number.isFinite(radius) ? radius : ""}
                        onChange={(e) => setRadius(Number(e.target.value))}
                        aria-invalid={Boolean(shown.radius)}
                        aria-describedby={errorId("radius")}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">miles</span>
                    </div>
                  ) : null}
                  {fieldError("radius")}
                </div>
                <div className="grid gap-1.5">
                  <span id="lf-travel-label" className="text-xs text-muted-foreground">
                    Travel time added before and after each{" "}
                    {tenant.terminology.booking.toLowerCase()}
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby="lf-travel-label"
                    className="flex flex-wrap gap-2"
                  >
                    {TRAVEL_CHOICES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={travel === t}
                        onClick={() => setTravel(t)}
                        className={chip(travel === t)}
                      >
                        {t === 0 ? "None" : `${t} min`}
                      </button>
                    ))}
                  </div>
                </div>
                {fieldError("area")}
              </fieldset>
            )}

            {premises ? (
              <div className="grid gap-2">
                <Label htmlFor="lf-parking">Parking and how to find you (optional)</Label>
                <Textarea
                  id="lf-parking"
                  value={parking}
                  maxLength={PARKING_MAX}
                  rows={2}
                  onChange={(e) => setParking(e.target.value)}
                  placeholder={parkingPlaceholder(industry)}
                  aria-invalid={Boolean(shown.parkingNote)}
                  aria-describedby={errorId("parkingNote")}
                />
                {fieldError("parkingNote")}
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="lf-timezone">Time zone</Label>
              <TimezoneCombobox
                id="lf-timezone"
                value={timezone}
                onChange={setTimezone}
                invalid={Boolean(shown.timezone)}
              />
              <p className="text-xs text-muted-foreground">
                {timezoneLabel(timezone)}. Every time here is shown in it.
              </p>
              {fieldError("timezone")}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lf-phone">Phone (optional)</Label>
              <Input
                id="lf-phone"
                type="tel"
                value={phoneNumber}
                maxLength={40}
                autoComplete="tel"
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Uses your business number"
                aria-invalid={Boolean(shown.phone)}
                aria-describedby={errorId("phone")}
              />
              {fieldError("phone")}
            </div>

            <div className="grid gap-2">
              <span className="text-sm leading-none font-medium">Opening hours</span>
              <button
                type="button"
                onClick={() => setHoursOpen(true)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors hover:bg-secondary/50"
              >
                <span className="text-sm">{hoursSummary(hours)}</span>
                <span className="inline-flex shrink-0 items-center text-[13px] font-semibold text-primary">
                  Set hours <ChevronRight className="size-3.5" aria-hidden />
                </span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="lf-online" className="text-sm font-semibold">
                  Clients can book here online
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off keeps it for staff bookings only.
                </p>
              </div>
              <Switch
                id="lf-online"
                checked={online}
                onCheckedChange={(v) => {
                  setOnline(v);
                  setErrors((x) => ({ ...x, address: undefined, area: undefined }));
                }}
              />
            </div>

            {planNote ? <p className="text-xs text-muted-foreground">{planNote}</p> : null}
          </form>

          <footer className="grid gap-2 border-t px-4 sm:px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
            {tried && missing.length > 0 ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Still needed: {missing.join(", ")}.
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="location-form"
                disabled={submitting}
                className={cn(phone && "h-12 flex-1")}
              >
                {submitting ? "Saving…" : location ? "Save changes" : "Add location"}
              </Button>
            </div>
          </footer>
        </SheetContent>
      </Sheet>

      <HoursEditorDrawer
        open={hoursOpen}
        onOpenChange={setHoursOpen}
        locationName={name.trim() || "New location"}
        zoneLabel={timezoneLabel(timezone)}
        hours={hours}
        onSave={(next) => setHours(next)}
      />
    </>
  );
}
