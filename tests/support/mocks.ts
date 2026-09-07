/**
 * Stand-ins for the three modules a component test cannot build for real.
 *
 * `AuthProvider` talks to Supabase on mount and `TenantProvider` fetches
 * `/me/businesses`, so specs mock those modules outright and feed plain values
 * in through {@link makeAuth} and {@link makeTenant}. `@/lib/api/hooks` is 3,500
 * lines of query hooks; {@link apiHooksModule} stubs the whole surface so a
 * component pulls in idle data unless the spec says otherwise.
 */
import { permissionsForRoles, type PermissionKey } from "@/lib/permissions";

export type TenantStub = {
  businesses: Array<{ id: string; tradingName: string }>;
  businessId: string;
  business: { id: string; tradingName: string; slug?: string } | null;
  membership: { roleKeys: string[] } | null;
  roleKeys: string[];
  permissions: Set<PermissionKey>;
  can: (permission: PermissionKey | string) => boolean;
  locations: unknown[];
  currentLocationId: string;
  setCurrentLocationId: (id: string) => void;
  configuration: unknown;
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

/**
 * A tenant context for someone holding `roleKeys`. Permissions come from the
 * real role table rather than a hand-written list, so a change to the bundles
 * shows up here as a changed nav rather than a still-passing stub.
 */
export function makeTenant(over: Partial<TenantStub> & { roleKeys?: string[] } = {}): TenantStub {
  const roleKeys = over.roleKeys ?? ["business_owner"];
  const permissions = over.permissions ?? permissionsForRoles(roleKeys);
  return {
    businesses: [{ id: "biz_1", tradingName: "Demo Strength Co" }],
    businessId: "biz_1",
    business: { id: "biz_1", tradingName: "Demo Strength Co", slug: "demo-strength" },
    membership: { roleKeys },
    roleKeys,
    permissions,
    can: (permission) => permissions.has(permission as PermissionKey),
    locations: [],
    currentLocationId: "all",
    setCurrentLocationId: () => {},
    configuration: null,
    switchBusiness: () => {},
    isLoading: false,
    terminology: {
      staff: "Staff",
      service: "Service",
      booking: "Booking",
      client: "Client",
      linkedRecord: "Linked record",
    },
    ...over,
  };
}

export function makeAuth(over: Record<string, unknown> = {}) {
  return {
    status: "authenticated",
    session: null,
    supabaseUser: null,
    accessToken: "test-token",
    user: { id: "usr_1", email: "owner@demo.test", firstName: "Ada", lastName: "Lovelace" },
    signIn: async () => {},
    signInWithGoogle: async () => {},
    signUp: async () => {},
    sendEmailCode: async () => {},
    verifyEmailCode: async () => {},
    signOut: async () => {},
    resetPassword: async () => {},
    updateProfile: async () => ({}),
    verifyMfa: async () => true,
    mfaRequired: false,
    clearMfa: () => {},
    ...over,
  };
}

const idleQuery = {
  data: undefined,
  isLoading: false,
  isPending: false,
  isSuccess: true,
  isError: false,
  isFetched: true,
  isFetching: false,
  error: null,
  refetch: () => {},
  fetchNextPage: () => {},
  hasNextPage: false,
};

const idleMutation = {
  mutate: () => {},
  mutateAsync: async () => ({}),
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
  reset: () => {},
};

/** Hooks whose name reads as an action return a mutation, not a query. */
const MUTATION_VERB =
  /^use(Accept|Add|Adjust|Archive|Cancel|Claim|Confirm|Create|Delete|Dismiss|Invite|Issue|Mark|Publish|Redeem|Refund|Remove|Reschedule|Reset|Save|Send|Set|Skip|Start|Sync|Update|Upload)/;

/** Per-hook results a spec has asked for, keyed by hook name. */
export const apiHookResults = new Map<string, unknown>();

export function setApiHook(name: string, result: unknown) {
  apiHookResults.set(name, result);
}

export function resetApiHooks() {
  apiHookResults.clear();
}

/**
 * A module namespace covering every export of `@/lib/api/hooks`.
 *
 * A Proxy rather than a listed object: the module has hundreds of exports and
 * enumerating the ones each component happens to call turns every new query
 * into a failing unrelated test.
 */
export const apiHooksModule = new Proxy({} as Record<string | symbol, unknown>, {
  get(_target, property) {
    // Vitest and the ESM loader probe these; answering with a function would
    // make the namespace look like a thenable or a class.
    if (typeof property !== "string") return undefined;
    if (property === "then" || property === "__esModule") return undefined;

    return (...args: unknown[]) => {
      if (apiHookResults.has(property)) {
        const configured = apiHookResults.get(property);
        return typeof configured === "function"
          ? (configured as (...a: unknown[]) => unknown)(...args)
          : configured;
      }
      return MUTATION_VERB.test(property) ? idleMutation : idleQuery;
    };
  },
  has: () => true,
});
