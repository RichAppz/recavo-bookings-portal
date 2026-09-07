/**
 * Provider scaffolding for component tests.
 *
 * Components under `src/components` assume four things exist above them: a
 * React Query client, a TanStack router (for `Link`, `Navigate` and
 * `useRouterState`), the auth context, and the tenant context. Only the first
 * two can be built for real in a test — the other two are contexts whose
 * providers reach for Supabase and the API on mount — so specs mock those two
 * modules and pass plain values in through the helpers here.
 */
import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, type RenderResult } from "@testing-library/react";

/**
 * Every path a component under test might link to. `Link` builds an href from
 * the route tree, so a destination missing from this list renders as a dead
 * link and the assertion fails for the wrong reason.
 */
const APP_PATHS = [
  "/",
  "/login",
  "/register",
  "/reset",
  "/invite",
  "/account",
  "/portal",
  "/calendar",
  "/bookings",
  "/clients",
  "/services",
  "/packages",
  "/staff",
  "/locations",
  "/messages",
  "/payments",
  "/reports",
  "/settings",
  "/billing",
  "/billing/success",
  "/billing/cancel",
  "/platform",
] as const;

export type RenderOptions = {
  /** Where the memory history starts, which drives `useRouterState`. */
  path?: string;
};

export type RenderWithRouterResult = RenderResult & {
  /** The path the router settled on, for asserting a redirect. */
  currentPath: () => string;
  /** Parsed search params at that location, e.g. the preserved `redirect`. */
  currentSearch: () => Record<string, unknown>;
  queryClient: QueryClient;
};

function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Retries turn one deliberate failure into a multi-second test, and stale
      // caching leaks state between cases in the same file.
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders `ui` at `path` inside a real router whose every route renders that
 * same element. Any navigation the component performs is therefore observable
 * through {@link RenderWithRouterResult.currentPath} without the destination
 * needing a component of its own.
 *
 * Async because the router resolves its first match on a microtask: rendering
 * synchronously gives you an empty container and an assertion that fails for a
 * reason that has nothing to do with the component.
 */
export async function renderWithRouter(
  ui: ReactElement,
  { path = "/" }: RenderOptions = {},
): Promise<RenderWithRouterResult> {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const routes = APP_PATHS.map((p) =>
    createRoute({ getParentRoute: () => rootRoute, path: p, component: () => <>{ui}</> }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMinMs: 0,
  });

  await router.load();

  const queryClient = testQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
    currentPath: () => router.state.location.pathname,
    currentSearch: () => router.state.location.search as Record<string, unknown>,
  };
}

/** For components that need Query but no router. */
export function renderWithQuery(ui: ReactNode): RenderResult & { queryClient: QueryClient } {
  const queryClient = testQueryClient();
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}
