import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { toastApiError } from "./errors";
import type { SupportMessage, SupportRequest } from "./types";

/**
 * A client asking RECAVO for help with the booking app itself. Bookings, cancellations
 * and refunds are the business's to sort out, so the categories stop at technical ones.
 */
export const CLIENT_SUPPORT_CATEGORIES = [
  { value: "bug", label: "Something isn't working" },
  { value: "question", label: "Question about the app" },
  { value: "other", label: "Other technical problem" },
] as const;

export type ClientSupportCategory = (typeof CLIENT_SUPPORT_CATEGORIES)[number]["value"];

export type ClientSupportRequest = SupportRequest & { businessName: string | null };

export type ClientSupportThread = { request: SupportRequest; messages: SupportMessage[] };

const keys = {
  all: ["portal", "support-requests"] as const,
  one: (id: string) => ["portal", "support-requests", id] as const,
};

/** Everything this person has asked us, across every business, newest first. */
export function useClientSupportRequests(enabled = true) {
  return useQuery({
    queryKey: keys.all,
    enabled,
    // Opened from our reply email: show the reply, not the copy saved on the device.
    staleTime: 0,
    queryFn: async () => {
      const res = await api.get<{ requests: ClientSupportRequest[] }>(
        "/api/v1/portal/support-requests",
      );
      return res.data.requests;
    },
  });
}

export function useClientSupportThread(requestId: string | undefined) {
  return useQuery({
    queryKey: keys.one(requestId ?? ""),
    enabled: Boolean(requestId),
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const res = await api.get<ClientSupportThread>(
        `/api/v1/portal/support-requests/${requestId}`,
      );
      return res.data;
    },
  });
}

export function useRaiseClientSupportRequest() {
  const qc = useQueryClient();
  return useMutation<
    SupportRequest,
    Error,
    { businessId: string; category: ClientSupportCategory; subject: string; body: string }
  >({
    mutationFn: async ({ businessId, ...input }) => {
      const res = await api.post<{ request: SupportRequest }>(
        "/api/v1/portal/support-requests",
        input,
        { query: { businessId } },
      );
      return res.data.request;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }),
    onError: (err) => toastApiError(err, "Couldn't send your message"),
  });
}

/** Reply on a thread. Replying to a resolved request reopens it. */
export function useReplyToClientSupportRequest(requestId: string) {
  const qc = useQueryClient();
  return useMutation<{ request: SupportRequest; message: SupportMessage }, Error, string>({
    mutationFn: async (body) => {
      const res = await api.post<{ request: SupportRequest; message: SupportMessage }>(
        `/api/v1/portal/support-requests/${requestId}/messages`,
        { body },
      );
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData<ClientSupportThread>(keys.one(requestId), (prev) => ({
        request: data.request,
        messages: [...(prev?.messages ?? []), data.message],
      }));
      void qc.invalidateQueries({ queryKey: keys.all });
    },
    onError: (err) => toastApiError(err, "Couldn't send your reply"),
  });
}
