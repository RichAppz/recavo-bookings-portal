import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { api, ApiError, queryKeys } from "@/lib/api";
import type {
  Business,
  BusinessConfiguration,
  BusinessSummary,
  Location,
  Membership,
} from "@/lib/api/types";
import { permissionsForRoles, type PermissionKey } from "@/lib/permissions";
import { useAuth } from "@/lib/auth/auth-store";

const BUSINESS_KEY = "recavo.activeBusinessId";
const LOCATION_KEY = "recavo.activeLocationId";

type TenantContextValue = {
  businesses: BusinessSummary[];
  businessId: string;
  business: Business | null;
  membership: Membership | null;
  roleKeys: string[];
  permissions: Set<PermissionKey>;
  can: (permission: PermissionKey | string) => boolean;
  locations: Location[];
  currentLocationId: string | "all";
  setCurrentLocationId: (id: string | "all") => void;
  configuration: BusinessConfiguration | null;
  switchBusiness: (businessId: string) => void;
  isLoading: boolean;
  terminology: {
    staff: string;
    service: string;
    booking: string;
    client: string;
    linkedRecord: string;
  };
};

const TenantContext = createContext<TenantContextValue | null>(null);

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [businessId, setBusinessId] = useState<string | null>(() => readStored(BUSINESS_KEY));
  const [currentLocationId, setCurrentLocationIdState] = useState<string | "all">(
    () => (readStored(LOCATION_KEY) as string | "all") || "all",
  );

  const businessesQuery = useQuery({
    queryKey: queryKeys.myBusinesses(),
    enabled: status === "authenticated",
    queryFn: async () => {
      const res = await api.get<{ businesses: BusinessSummary[] }>("/api/v1/me/businesses");
      return res.data.businesses;
    },
  });

  const businesses = useMemo(() => businessesQuery.data ?? [], [businessesQuery.data]);

  // Resolve / re-validate selected business against memberships.
  useEffect(() => {
    if (!businesses.length) return;
    const stillValid = businessId && businesses.some((b) => b.id === businessId);
    if (!stillValid) {
      const next = businesses[0]!.id;
      setBusinessId(next);
      writeStored(BUSINESS_KEY, next);
    }
  }, [businesses, businessId]);

  const activeBusinessId =
    businessId && businesses.some((b) => b.id === businessId)
      ? businessId
      : (businesses[0]?.id ?? null);

  const summary = businesses.find((b) => b.id === activeBusinessId) ?? null;

  const businessQuery = useQuery({
    queryKey: queryKeys.business(activeBusinessId ?? ""),
    enabled: Boolean(activeBusinessId),
    queryFn: async () => {
      const res = await api.get<{ business: Business }>(`/api/v1/businesses/${activeBusinessId}`);
      return res.data.business;
    },
  });

  const locationsQuery = useQuery({
    queryKey: queryKeys.locations(activeBusinessId ?? ""),
    enabled: Boolean(activeBusinessId),
    queryFn: async () => {
      const res = await api.get<{ locations: Location[] }>(
        `/api/v1/businesses/${activeBusinessId}/locations`,
      );
      return res.data.locations;
    },
  });

  const membershipsQuery = useQuery({
    queryKey: queryKeys.memberships(activeBusinessId ?? ""),
    enabled: Boolean(activeBusinessId),
    queryFn: async () => {
      const res = await api.get<{ memberships: Membership[] }>(
        `/api/v1/businesses/${activeBusinessId}/memberships`,
      );
      return res.data.memberships;
    },
  });

  const configurationQuery = useQuery({
    queryKey: queryKeys.configuration(activeBusinessId ?? ""),
    enabled: Boolean(activeBusinessId),
    queryFn: async () => {
      const res = await api.get<{ configuration: BusinessConfiguration }>(
        `/api/v1/businesses/${activeBusinessId}/configuration`,
      );
      return res.data.configuration;
    },
  });

  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);

  useEffect(() => {
    if (currentLocationId === "all") return;
    if (locations.length && !locations.some((l) => l.id === currentLocationId)) {
      setCurrentLocationIdState("all");
      writeStored(LOCATION_KEY, "all");
    }
  }, [locations, currentLocationId]);

  const roleKeys = useMemo(() => summary?.roleKeys ?? [], [summary]);
  const permissions = useMemo(() => permissionsForRoles(roleKeys), [roleKeys]);

  const can = useCallback(
    (permission: PermissionKey | string) => permissions.has(permission as PermissionKey),
    [permissions],
  );

  const switchBusiness = useCallback((id: string) => {
    setBusinessId(id);
    writeStored(BUSINESS_KEY, id);
    setCurrentLocationIdState("all");
    writeStored(LOCATION_KEY, "all");
  }, []);

  const setCurrentLocationId = useCallback((id: string | "all") => {
    setCurrentLocationIdState(id);
    writeStored(LOCATION_KEY, id);
  }, []);

  const configuration = configurationQuery.data ?? null;
  const terminology = useMemo(
    () => ({
      staff: configuration?.terminology?.staff || "Staff",
      service: configuration?.terminology?.service || "Service",
      booking: configuration?.terminology?.booking || "Booking",
      client: "Client",
      linkedRecord: configuration?.terminology?.linkedRecord || "Record",
    }),
    [configuration],
  );

  // Prefer the current user's membership when available.
  const membership =
    membershipsQuery.data?.find((m) => m.status === "active") ?? membershipsQuery.data?.[0] ?? null;

  const value = useMemo<TenantContextValue>(
    () => ({
      businesses,
      businessId: activeBusinessId ?? "",
      business: businessQuery.data ?? null,
      membership,
      roleKeys,
      permissions,
      can,
      locations,
      currentLocationId,
      setCurrentLocationId,
      configuration,
      switchBusiness,
      isLoading:
        businessesQuery.isLoading ||
        (!!activeBusinessId &&
          (businessQuery.isLoading || locationsQuery.isLoading || configurationQuery.isLoading)),
      terminology,
    }),
    [
      businesses,
      activeBusinessId,
      businessQuery.data,
      businessQuery.isLoading,
      membership,
      roleKeys,
      permissions,
      can,
      locations,
      currentLocationId,
      setCurrentLocationId,
      configuration,
      switchBusiness,
      businessesQuery.isLoading,
      locationsQuery.isLoading,
      configurationQuery.isLoading,
      terminology,
    ],
  );

  if (status === "authenticated" && businessesQuery.isError) {
    const err = businessesQuery.error;
    const detail =
      err instanceof ApiError
        ? err.detail || err.title
        : "The portal couldn't reach the API. Check your connection or the API URL.";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-lg font-semibold">Couldn't load your businesses</h1>
          <p className="text-sm text-muted-foreground">{detail}</p>
          <button
            onClick={() => void businessesQuery.refetch()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status === "authenticated" && !businessesQuery.isLoading && businesses.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-2 text-center">
          <h1 className="text-lg font-semibold">No business membership</h1>
          <p className="text-sm text-muted-foreground">
            Your account is signed in but is not a member of any business yet.
          </p>
        </div>
      </div>
    );
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used inside TenantProvider");
  return ctx;
}

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionKey | string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useTenant();
  if (!can(permission)) return <>{fallback}</>;
  return <>{children}</>;
}

export function useRequirePermission(permission: PermissionKey | string) {
  const { can, isLoading } = useTenant();
  return { allowed: can(permission), isLoading };
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey | string;
  children: ReactNode;
}) {
  const { allowed, isLoading } = useRequirePermission(permission);
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!allowed) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <h2 className="text-base font-semibold">Permission denied</h2>
        <p className="mt-1 text-sm text-muted-foreground">You do not have access to this area.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Convenience: redirect home when tenant not ready (used rarely). */
export function RequireBusiness({ children }: { children: ReactNode }) {
  const { businessId, isLoading } = useTenant();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading business…</p>;
  if (!businessId) return <Navigate to="/" replace />;
  return <>{children}</>;
}
