import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

import type { BroadcastAudienceKind, BroadcastChannelMode, MessageLike } from "@/lib/messages";
import { api } from "./client";
import { toastApiError } from "./errors";
import { useBusinessId } from "./hooks";
import { queryKeys } from "./query-keys";
import type { Conversation } from "./types";

/* ---------------- Types (Messages API, migration 0153) ---------------- */

export type InboxTab = "all" | "unread" | "needs_reply";

export type InboxRow = {
  conversationId: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
  /** The last message a person wrote; automatic messages only when there is nothing else. */
  lastMessage: {
    body: string;
    from: "staff" | "customer";
    channel: "in_app" | "sms" | "email";
    subject: string | null;
    at: string;
  } | null;
  lastActivityAt: string;
  unreadCount: number;
  unread: boolean;
  needsReply: boolean;
  doneAt: string | null;
  blocked: boolean;
};

export type InboxCounts = { all: number; unread: number; needsReply: number };

type InboxPage = { items: InboxRow[]; nextCursor: string | null; counts: InboxCounts };

export type ConversationState = Conversation & {
  doneAt?: string | null;
  markedUnreadAt?: string | null;
  blockedAt?: string | null;
};

export type SavedReply = {
  id: string;
  businessId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type BroadcastAudience = {
  kind: BroadcastAudienceKind;
  serviceIds?: string[];
  tagIds?: string[];
  makes?: string[];
  locationIds?: string[];
};

export type BroadcastInput = {
  audience: BroadcastAudience;
  channelMode: BroadcastChannelMode;
  body: string;
  subject?: string | null;
};

export type BroadcastPreview = {
  matched: number;
  /** Matched clients who agreed to marketing. */
  recipients: number;
  sms: number;
  email: number;
  excludedNoConsent: number;
  unreachable: number;
  estimatedCredits: number;
  /** When the one-per-24-hours limit lifts; null when one may go now. */
  nextAllowedAt: string | null;
  smsWindow: { open: boolean; nextOpenAt: string };
  smsFrame: { prefix: string; suffix: string };
  bookingLink: string;
};

export type Broadcast = {
  id: string;
  audience: BroadcastAudience;
  channelMode: BroadcastChannelMode;
  subject: string | null;
  body: string;
  status: "scheduled" | "sending" | "sent" | "cancelled";
  scheduledFor: string | null;
  sentAt: string | null;
  recipientCount: number;
  smsCount: number;
  emailCount: number;
  failedCount: number;
  creditsUsed: number;
  createdAt: string;
};

export type BroadcastResults = {
  delivered: number;
  failed: number;
  replies: number;
  bookings: number;
};

/* ---------------- Inbox ---------------- */

export const INBOX_PAGE_SIZE = 30;

/** The inbox, 30 rows at a time, with counts for each tab (from the first page). */
export function useInbox(filters: { tab: InboxTab; search: string; locationId?: string }) {
  const businessId = useBusinessId();
  const query = {
    tab: filters.tab,
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
  };
  const q = useInfiniteQuery({
    queryKey: queryKeys.inbox(businessId, query),
    enabled: Boolean(businessId),
    initialPageParam: null as string | null,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<InboxPage>(`/api/v1/businesses/${businessId}/inbox`, {
        query: { ...query, limit: INBOX_PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return res.data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return {
    ...q,
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
    counts: q.data?.pages[0]?.counts ?? null,
  };
}

/* ---------------- One conversation ---------------- */

export function useConversationState(conversationId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.conversation(businessId, conversationId ?? ""),
    enabled: Boolean(businessId && conversationId),
    queryFn: async () => {
      const res = await api.get<{ conversation: ConversationState }>(
        `/api/v1/businesses/${businessId}/conversations/${conversationId}`,
      );
      return res.data.conversation;
    },
  });
}

export const THREAD_PAGE_SIZE = 50;

type ThreadPage = { messages: MessageLike[]; nextCursor: string | null };

/**
 * A thread, newest page first; older pages load as you scroll up. `messages` is the
 * whole loaded run, oldest first.
 */
export function useThread(conversationId: string | undefined) {
  const businessId = useBusinessId();
  const q = useInfiniteQuery({
    queryKey: queryKeys.threadPages(businessId, conversationId ?? ""),
    enabled: Boolean(businessId && conversationId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<ThreadPage>(
        `/api/v1/businesses/${businessId}/conversations/${conversationId}/messages`,
        { query: { limit: THREAD_PAGE_SIZE, ...(pageParam ? { before: pageParam } : {}) } },
      );
      return res.data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const messages = q.data ? [...q.data.pages].reverse().flatMap((p) => p.messages) : [];
  return { ...q, messages };
}

function invalidateConversations(qc: ReturnType<typeof useQueryClient>, businessId: string) {
  void qc.invalidateQueries({ queryKey: ["biz", businessId, "conversations"] });
}

/** Staff opened the thread: client messages count as read and "mark as unread" lifts. */
export function useMarkConversationOpened() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await api.post<{ conversation: ConversationState }>(
        `/api/v1/businesses/${businessId}/conversations/${conversationId}/open`,
      );
      return res.data.conversation;
    },
    onSuccess: (conversation) => {
      qc.setQueryData(queryKeys.conversation(businessId, conversation.id), conversation);
      void qc.invalidateQueries({ queryKey: queryKeys.inbox(businessId).slice(0, 4) });
    },
  });
}

export type ConversationPatch = { done?: boolean; unread?: boolean; blocked?: boolean };

/** Mark as done / unread, or block the client from writing. */
export function useUpdateConversation() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { conversationId: string; patch: ConversationPatch }) => {
      const res = await api.patch<{ conversation: ConversationState }>(
        `/api/v1/businesses/${businessId}/conversations/${vars.conversationId}`,
        vars.patch,
      );
      return res.data.conversation;
    },
    onSuccess: (conversation) => {
      qc.setQueryData(queryKeys.conversation(businessId, conversation.id), conversation);
      void qc.invalidateQueries({ queryKey: queryKeys.inbox(businessId).slice(0, 4) });
    },
    onError: (err) => toastApiError(err),
  });
}

export type SendInput = {
  body: string;
  channel: "in_app" | "sms" | "email";
  subject?: string | null;
};

/** Send from the reply box. Shows straight away as "Sending…", then the real outcome. */
export function useSendConversationMessage(conversationId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const key = queryKeys.threadPages(businessId, conversationId ?? "");
  type Data = InfiniteData<ThreadPage, string | null>;

  return useMutation({
    mutationFn: async (input: SendInput) => {
      const res = await api.post<{ message: MessageLike }>(
        `/api/v1/businesses/${businessId}/conversations/${conversationId}/messages`,
        input,
      );
      return res.data.message;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Data>(key);
      const optimistic: MessageLike = {
        id: `optimistic-${crypto.randomUUID()}`,
        businessId,
        conversationId: conversationId ?? "",
        senderType: "staff",
        senderId: "me",
        body: input.body,
        createdAt: new Date().toISOString(),
        isAnnouncement: false,
        readByCustomerAt: null,
        readByStaffAt: new Date().toISOString(),
        channel: input.channel,
        subject: input.subject ?? null,
        deliveryState: "sending",
      };
      qc.setQueryData<Data>(key, (old) => {
        if (!old || old.pages.length === 0) {
          return { pages: [{ messages: [optimistic], nextCursor: null }], pageParams: [null] };
        }
        const [first, ...rest] = old.pages;
        return {
          ...old,
          pages: [{ ...first!, messages: [...first!.messages, optimistic] }, ...rest],
        };
      });
      return { previous, optimisticId: optimistic.id };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous);
      toastApiError(err, "Couldn't send your message");
    },
    onSuccess: (message, _input, ctx) => {
      qc.setQueryData<Data>(key, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                messages: p.messages.map((m) => (m.id === ctx?.optimisticId ? message : m)),
              })),
            }
          : old,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.inbox(businessId).slice(0, 4) });
      void qc.invalidateQueries({ queryKey: queryKeys.smsCredits(businessId) });
    },
  });
}

/* ---------------- Saved replies ---------------- */

export function useSavedReplies() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.savedReplies(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ savedReplies: SavedReply[] }>(
        `/api/v1/businesses/${businessId}/saved-replies`,
      );
      return res.data.savedReplies;
    },
  });
}

export function useSaveSavedReply() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: string; title: string; body: string }) => {
      const payload = { title: vars.title, body: vars.body };
      const res = vars.id
        ? await api.put<{ savedReply: SavedReply }>(
            `/api/v1/businesses/${businessId}/saved-replies/${vars.id}`,
            payload,
          )
        : await api.post<{ savedReply: SavedReply }>(
            `/api/v1/businesses/${businessId}/saved-replies`,
            payload,
          );
      return res.data.savedReply;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.savedReplies(businessId) }),
    onError: (err) => toastApiError(err, "Couldn't save the reply"),
  });
}

export function useDeleteSavedReply() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/businesses/${businessId}/saved-replies/${id}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.savedReplies(businessId) }),
    onError: (err) => toastApiError(err, "Couldn't delete the reply"),
  });
}

/* ---------------- Announcements ---------------- */

export function useBroadcastOptions(enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.broadcastOptions(businessId),
    enabled: Boolean(businessId) && enabled,
    queryFn: async () => {
      const res = await api.get<{ makes: string[] }>(
        `/api/v1/businesses/${businessId}/broadcasts/options`,
      );
      return res.data;
    },
  });
}

/** Who an announcement reaches and what it costs. Pass a debounced input. */
export function useBroadcastPreview(input: BroadcastInput, enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.broadcastPreview(businessId, input as unknown as Record<string, unknown>),
    enabled: Boolean(businessId) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await api.post<{ preview: BroadcastPreview }>(
        `/api/v1/businesses/${businessId}/broadcasts/preview`,
        input,
      );
      return res.data.preview;
    },
  });
}

/** Counts for each "Who to send to" option, so every row shows its own number. */
export function useBroadcastAudienceCounts(channelMode: BroadcastChannelMode, enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.broadcastPreview(businessId, { counts: true, channelMode }),
    enabled: Boolean(businessId) && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const kinds: BroadcastAudienceKind[] = ["all", "upcoming_30d", "lapsed_6m"];
      const results = await Promise.all(
        kinds.map((kind) =>
          api.post<{ preview: BroadcastPreview }>(
            `/api/v1/businesses/${businessId}/broadcasts/preview`,
            { audience: { kind }, channelMode, body: "" },
          ),
        ),
      );
      return Object.fromEntries(
        kinds.map((kind, i) => [kind, results[i]!.data.preview.recipients]),
      ) as Record<"all" | "upcoming_30d" | "lapsed_6m", number>;
    },
  });
}

export function useBroadcasts(enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.broadcasts(businessId),
    enabled: Boolean(businessId) && enabled,
    queryFn: async () => {
      const res = await api.get<{
        broadcasts: { broadcast: Broadcast; results: BroadcastResults }[];
      }>(`/api/v1/businesses/${businessId}/broadcasts`);
      return res.data.broadcasts;
    },
  });
}

/** Send now, or at `scheduledFor`. Errors are left to the caller: the limits need words. */
export function useSendBroadcast() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BroadcastInput & { scheduledFor?: string | null }) => {
      const res = await api.post<{ broadcast: Broadcast }>(
        `/api/v1/businesses/${businessId}/broadcasts`,
        input,
      );
      return res.data.broadcast;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.broadcasts(businessId) });
      void qc.invalidateQueries({ queryKey: queryKeys.smsCredits(businessId) });
      invalidateConversations(qc, businessId);
    },
  });
}

export function useSendBroadcastTest() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async (input: BroadcastInput) => {
      const res = await api.post<{
        test: { channel: "sms" | "email"; delivered: boolean; error: string | null };
      }>(`/api/v1/businesses/${businessId}/broadcasts/test`, input);
      return res.data.test;
    },
    onError: (err) => toastApiError(err, "Couldn't send the test"),
  });
}

export function useCancelBroadcast() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/businesses/${businessId}/broadcasts/${id}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.broadcasts(businessId) }),
    onError: (err) => toastApiError(err, "Couldn't cancel the announcement"),
  });
}
