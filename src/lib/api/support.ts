import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { toastApiError } from "./errors";
import { useBusinessId } from "./hooks";
import { queryKeys } from "./query-keys";
import type { SupportMessage, SupportRequest, SupportRequestCategory } from "./types";

export const SUPPORT_CATEGORIES: ReadonlyArray<{ value: SupportRequestCategory; label: string }> = [
  { value: "question", label: "Question" },
  { value: "bug", label: "Something isn't working" },
  { value: "billing", label: "Billing" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
];

export type CreateSupportRequestInput = {
  category: SupportRequestCategory;
  subject: string;
  body: string;
};

export type SupportThread = { request: SupportRequest; messages: SupportMessage[] };

/** Every request this business has raised, newest first. */
export function useSupportRequests() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.supportRequests(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ requests: SupportRequest[] }>(
        `/api/v1/businesses/${businessId}/support-requests`,
      );
      return res.data.requests;
    },
  });
}

/** One request with its thread (opening message is `request.body`; replies follow). */
export function useSupportRequest(requestId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.supportRequest(businessId, requestId ?? ""),
    enabled: Boolean(businessId && requestId),
    queryFn: async () => {
      const res = await api.get<SupportThread>(
        `/api/v1/businesses/${businessId}/support-requests/${requestId}`,
      );
      return res.data;
    },
  });
}

/**
 * Raise a support request for the current business. It lands in the RECAVO
 * internal console and alerts the team; replies come back to /support and by
 * email. Not idempotency-keyed on purpose: a double submit is rate-limited
 * server-side and is harmless to triage.
 */
export function useCreateSupportRequest() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation<SupportRequest, Error, CreateSupportRequestInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ request: SupportRequest }>(
        `/api/v1/businesses/${businessId}/support-requests`,
        input,
      );
      return res.data.request;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.supportRequests(businessId) });
    },
    onError: (err) => toastApiError(err, "Couldn't send your message"),
  });
}

/** Reply on a thread. Replying to a resolved request reopens it. */
export function useReplyToSupportRequest(requestId: string) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation<{ request: SupportRequest; message: SupportMessage }, Error, string>({
    mutationFn: async (body) => {
      const res = await api.post<{ request: SupportRequest; message: SupportMessage }>(
        `/api/v1/businesses/${businessId}/support-requests/${requestId}/messages`,
        { body },
      );
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData<SupportThread>(queryKeys.supportRequest(businessId, requestId), (prev) =>
        prev
          ? { request: data.request, messages: [...prev.messages, data.message] }
          : { request: data.request, messages: [data.message] },
      );
      void qc.invalidateQueries({ queryKey: queryKeys.supportRequests(businessId) });
    },
    onError: (err) => toastApiError(err, "Couldn't send your reply"),
  });
}
