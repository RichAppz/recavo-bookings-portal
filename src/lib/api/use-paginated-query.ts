import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
} from "@tanstack/react-query";
import { api, type QueryValue } from "./client";
import type { ApiError } from "./errors";

type PageEnvelope<TItem, TListKey extends string> = {
  [K in TListKey]: TItem[];
} & {
  nextCursor?: string | null;
};

type UsePaginatedQueryArgs<TItem, TListKey extends string> = {
  queryKey: QueryKey;
  path: string;
  listKey: TListKey;
  query?: Record<string, QueryValue>;
  enabled?: boolean;
  limit?: number;
} & Omit<
  UseInfiniteQueryOptions<
    PageEnvelope<TItem, TListKey>,
    ApiError,
    InfiniteData<PageEnvelope<TItem, TListKey>>,
    QueryKey,
    string | null
  >,
  "queryKey" | "queryFn" | "getNextPageParam" | "initialPageParam"
>;

/**
 * Cursor-paginated list query. API pages look like
 * `{ bookings: [...], nextCursor }` or `{ items: [...], nextCursor }`.
 */
export function usePaginatedQuery<TItem, TListKey extends string>(
  args: UsePaginatedQueryArgs<TItem, TListKey>,
) {
  const { queryKey, path, listKey, query, enabled, limit, ...rest } = args;

  return useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<PageEnvelope<TItem, TListKey>>(path, {
        query: {
          ...query,
          ...(limit !== undefined ? { limit } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      });
      return res.data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...rest,
  });
}

/** Flatten infinite pages into a single item array. */
export function flattenPages<TItem, TListKey extends string>(
  data: InfiniteData<PageEnvelope<TItem, TListKey>> | undefined,
  listKey: TListKey,
): TItem[] {
  if (!data) return [];
  return data.pages.flatMap((page) => page[listKey] ?? []);
}
