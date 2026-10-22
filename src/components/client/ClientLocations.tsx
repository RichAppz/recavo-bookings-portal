import { useEffect, useMemo, useState } from "react";
import { Check, LocateFixed, MapPin, Navigation, Truck } from "lucide-react";
import {
  BottomBar,
  ClientColumn,
  PageTitle,
  PrimaryButton,
  StepHeader,
  TextLink,
} from "@/components/client/ClientPage";
import type { PublicLocation } from "@/lib/api/hooks";
import { addressText, directionsUrl, lookupPostcode, todayState } from "@/lib/locations";
import { cn } from "@/lib/utils";

type Point = { lat: number; lng: number };

export function isMobileLocation(l: Pick<PublicLocation, "type">): boolean {
  return l.type !== "physical";
}

/** The premises address, or "LS1 4AB, within 15 miles" for a location that travels. */
export function placeLine(l: PublicLocation): string {
  if (isMobileLocation(l)) {
    const area = l.serviceArea;
    return area ? `${area.basePostcode}, within ${area.radiusMiles} miles` : "We come to you";
  }
  return addressText(l.address) || "";
}

/** "Open today until 17:00", "Closed today · Opens Thu at 08:00". */
export function todayLine(l: PublicLocation): string {
  const state = todayState(l);
  if (state.open) return state.pill.replace(/^Open until/, "Open today until");
  return state.line ? `${state.pill} · ${state.line}` : state.pill;
}

export function locationDirections(l: PublicLocation): string | null {
  if (isMobileLocation(l) || !l.address) return null;
  return directionsUrl(l.address);
}

/** Straight-line miles between two points. */
export function milesBetween(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

function pointOf(l: PublicLocation): Point | null {
  const p = isMobileLocation(l) ? l.serviceArea : l.address;
  return p && p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null;
}

function milesText(miles: number): string {
  return miles < 10 ? `${miles.toFixed(1)} miles` : `${Math.round(miles)} miles`;
}

/**
 * "Where would you like it done?": picked after the service and before times, when
 * the business has two or more locations on its booking page. A "We come to you"
 * location asks for the client's postcode and is only offered inside its area.
 */
export function ClientLocationStep({
  locations,
  locationId,
  serviceName,
  postcode: initialPostcode,
  onBack,
  onContinue,
}: {
  locations: PublicLocation[];
  locationId: string | null;
  serviceName: string | null;
  postcode: string;
  onBack: () => void;
  onContinue: (locationId: string, postcode: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(locationId);
  const [postcode, setPostcode] = useState(initialPostcode);
  const [client, setClient] = useState<Point | null>(null);
  const [checking, setChecking] = useState(false);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const hasMobile = locations.some(isMobileLocation);

  const check = async (value: string) => {
    if (!value.trim()) return;
    setChecking(true);
    setPostcodeError(null);
    const found = await lookupPostcode(value).catch(() => null);
    setChecking(false);
    if (!found) {
      setClient(null);
      setPostcodeError("We couldn't find that postcode.");
      return;
    }
    setPostcode(found.postcode);
    setClient({ lat: found.lat, lng: found.lng });
  };

  useEffect(() => {
    if (initialPostcode) void check(initialPostcode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setClient({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { maximumAge: 600_000, timeout: 10_000 },
    );
  };

  const rows = useMemo(() => {
    const withDistance = locations.map((l, index) => {
      const at = pointOf(l);
      const miles = client && at ? milesBetween(client, at) : null;
      const mobile = isMobileLocation(l);
      const covered =
        !mobile || !l.serviceArea
          ? true
          : miles === null
            ? null
            : miles <= l.serviceArea.radiusMiles;
      return { l, index, miles, mobile, covered };
    });
    if (!client) return withDistance;
    return [...withDistance].sort(
      (a, b) => (a.miles ?? Number.POSITIVE_INFINITY) - (b.miles ?? Number.POSITIVE_INFINITY),
    );
  }, [locations, client]);

  const choice = rows.find((r) => r.l.id === picked) ?? null;
  const canContinue = Boolean(choice && (choice.mobile ? choice.covered === true : true));

  return (
    <div>
      <ClientColumn>
        <StepHeader step={1} total={3} label="Choose" onBack={onBack} />
        <PageTitle>Where would you like it done?</PageTitle>
        {serviceName ? (
          <p className="mt-1 text-[15px] text-muted-foreground">{serviceName}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          {hasMobile ? (
            <form
              className="flex min-w-0 flex-1 items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void check(postcode);
              }}
            >
              <label className="grid min-w-0 flex-1 gap-1">
                <span className="text-[13px] font-semibold text-muted-foreground">
                  Your postcode, for "We come to you"
                </span>
                <input
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  onBlur={() => void check(postcode)}
                  autoComplete="postal-code"
                  placeholder="e.g. LS6 2AB"
                  className="h-12 w-full min-w-0 rounded-[var(--radius)] border border-input bg-card px-4 text-[16px] uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <button
                type="submit"
                className="h-12 shrink-0 rounded-full border border-border px-4 text-[14px] font-semibold hover:bg-muted"
                disabled={checking}
              >
                {checking ? "Checking…" : "Check"}
              </button>
            </form>
          ) : null}
          <TextLink
            onClick={useMyLocation}
            className="mb-3 inline-flex items-center gap-1 text-[14px]"
          >
            <LocateFixed className="h-4 w-4" aria-hidden /> Use my location
          </TextLink>
        </div>
        {postcodeError ? (
          <p className="mt-1 text-[13px] text-destructive" role="alert">
            {postcodeError}
          </p>
        ) : null}

        <div role="radiogroup" aria-label="Location" className="mt-4 grid gap-2.5">
          {rows.map(({ l, index, miles, mobile, covered }) => {
            const selected = picked === l.id;
            const outside = mobile && covered === false;
            const line = placeLine(l);
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={outside}
                onClick={() => (outside ? undefined : setPicked(l.id))}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left transition",
                  selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-foreground/30",
                  outside && "cursor-not-allowed opacity-60",
                )}
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[14px] font-bold text-primary"
                >
                  {mobile ? <Truck className="h-4 w-4" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold">
                    {mobile ? `${l.name} · We come to you` : l.name}
                  </span>
                  {line ? (
                    <span className="block text-[14px] text-muted-foreground">{line}</span>
                  ) : null}
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {todayLine(l)}
                  </span>
                  {mobile && covered === true ? (
                    <span className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" aria-hidden /> Your postcode is in the area
                    </span>
                  ) : null}
                  {outside ? (
                    <span className="mt-1 block text-[13px] font-semibold text-destructive">
                      Sorry, that's outside the area we cover
                    </span>
                  ) : null}
                  {mobile && covered === null ? (
                    <span className="mt-1 block text-[13px] text-muted-foreground">
                      Enter your postcode to check we cover it.
                    </span>
                  ) : null}
                </span>
                {miles !== null && !mobile ? (
                  <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">
                    {milesText(miles)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </ClientColumn>
      <BottomBar back={{ onClick: onBack }}>
        <span className="min-w-0 truncate text-[15px] font-semibold">
          {choice ? choice.l.name : "Pick a location"}
        </span>
        <PrimaryButton
          disabled={!canContinue}
          onClick={() => choice && onContinue(choice.l.id, postcode.trim())}
        >
          Continue
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

/** "Unit 4, Riverside · 4 Riverside Way, Leeds" with Directions, under the title. */
export function LocationLine({
  location,
  onChange,
}: {
  location: PublicLocation;
  /** Shown with two or more locations: back to the location step. */
  onChange?: () => void;
}) {
  const line = placeLine(location);
  const href = locationDirections(location);
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted-foreground">
      <MapPin className="h-4 w-4 shrink-0" aria-hidden />
      <span className="font-semibold text-foreground">{location.name}</span>
      {line ? <span>· {line}</span> : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Directions
        </a>
      ) : null}
      {onChange ? (
        <TextLink onClick={onChange} className="text-[14px]">
          Change
        </TextLink>
      ) : null}
    </p>
  );
}

/** Landing "Location and parking": every visible location with its own details. */
export function LocationRows({
  locations,
  preview,
}: {
  locations: PublicLocation[];
  preview?: boolean;
}) {
  return (
    <ul className="grid gap-4">
      {locations.map((l) => {
        const href = preview ? null : locationDirections(l);
        const line = placeLine(l);
        return (
          <li key={l.id} className="flex items-start gap-3">
            {isMobileLocation(l) ? (
              <Truck className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <MapPin className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold">{l.name}</p>
              {line ? <p className="text-[15px] text-muted-foreground">{line}</p> : null}
              <p className="text-[14px] text-muted-foreground">{todayLine(l)}</p>
              {l.parkingNote ? (
                <p className="mt-1 text-[14px] text-foreground/80">{l.parkingNote}</p>
              ) : null}
            </div>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-[13px] font-semibold hover:bg-muted"
              >
                <Navigation className="h-4 w-4" aria-hidden />
                Directions
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** True once locations carry their own addresses, so the landing lists them. */
export function locationsHaveDetails(locations: PublicLocation[]): boolean {
  return locations.some((l) => Boolean(l.address) || Boolean(l.serviceArea));
}
