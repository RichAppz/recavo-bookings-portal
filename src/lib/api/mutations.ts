import { useRef } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { request, type RequestOptions } from "./client";
import { ApiError, applyFormErrors, newIdempotencyKey, toastApiError } from "./errors";

type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiMutationConfig<TData, TVariables> = {
  method?: MutationMethod;
  path: string | ((variables: TVariables) => string);
  body?: (variables: TVariables) => unknown;
  /** Generate/reuse an Idempotency-Key for the mutation lifetime. */
  idempotent?: boolean;
  ifMatch?: (variables: TVariables) => number | string | undefined;
  invalidate?: QueryKey[] | ((variables: TVariables, data: TData) => QueryKey[]);
  setError?: (name: string, error: { type: string; message?: string }) => void;
  toastOnError?: boolean;
  public?: boolean;
} & Omit<UseMutationOptions<TData, ApiError, TVariables>, "mutationFn">;

/**
 * Standard mutation helper: Idempotency-Key + If-Match, cache invalidation,
 * and problem+json field-error mapping.
 */
export function useApiMutation<TData = unknown, TVariables = void>(
  config: ApiMutationConfig<TData, TVariables>,
) {
  const queryClient = useQueryClient();
  const {
    method = "POST",
    path,
    body,
    idempotent,
    ifMatch,
    invalidate,
    setError,
    toastOnError = true,
    public: isPublic,
    onSuccess,
    onError,
    ...rest
  } = config;

  const intentKeyRef = useRef<string | undefined>(undefined);
  if (idempotent && intentKeyRef.current === undefined) {
    intentKeyRef.current = newIdempotencyKey();
  }

  return useMutation<TData, ApiError, TVariables>({
    ...rest,
    mutationFn: async (variables) => {
      const resolvedPath = typeof path === "function" ? path(variables) : path;
      const hasBody = method !== "DELETE" || body !== undefined;
      const opts: RequestOptions = {
        method,
        path: resolvedPath,
        body: hasBody ? (body ? body(variables) : variables) : undefined,
        idempotencyKey: intentKeyRef.current,
        ifMatch: ifMatch?.(variables),
        public: isPublic,
      };
      const res = await request<TData>(opts);
      return res.data;
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      if (idempotent) intentKeyRef.current = newIdempotencyKey();
      const keys =
        typeof invalidate === "function" ? invalidate(variables, data) : (invalidate ?? []);
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      if (setError && error instanceof ApiError) {
        applyFormErrors(error, setError);
      }
      if (toastOnError) toastApiError(error);
      onError?.(error, variables, onMutateResult, context);
    },
  });
}

/**
 * Statuses that mean "the server read this request and said no". A retry with the
 * same body would get the same answer, and a retry with a *changed* body (e.g. the
 * same booking re-sent as a drop-in after a 409) is a new intent that must not
 * travel under the old key — the API refuses a reused key with a different body.
 */
const REJECTED_STATUSES = new Set([400, 404, 409, 422]);

/**
 * Wrap a mutationFn so the same Idempotency-Key is reused until success. The key
 * also rotates after a definitive rejection (see {@link REJECTED_STATUSES}); it is
 * kept across network failures, timeouts and 5xx so a blind retry stays safe.
 */
export function createIdempotentMutationFn<TData, TVariables>(
  fn: (variables: TVariables, idempotencyKey: string) => Promise<TData>,
) {
  let key = newIdempotencyKey();
  return async (variables: TVariables) => {
    try {
      const data = await fn(variables, key);
      key = newIdempotencyKey();
      return data;
    } catch (err) {
      if (err instanceof ApiError && REJECTED_STATUSES.has(err.status)) key = newIdempotencyKey();
      throw err;
    }
  };
}
