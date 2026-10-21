import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Megaphone, PenSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AppShell } from "@/components/AppShell";
import { BookingPanel } from "@/components/BookingPanel";
import { AnnouncementDrawer } from "@/components/messages/AnnouncementDrawer";
import { ClientPanel, type ClientPanelActions } from "@/components/messages/ClientPanel";
import { InboxEmpty, InboxList, InboxSearch, InboxTabs } from "@/components/messages/Inbox";
import { NewMessagePicker } from "@/components/messages/NewMessagePicker";
import { ChatTile } from "@/components/messages/parts";
import { SavedRepliesManager } from "@/components/messages/SavedRepliesManager";
import { Thread } from "@/components/messages/Thread";
import { PageHeader } from "@/components/ui-bits";
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFillHeight } from "@/hooks/use-fill-height";
import { useIsPhone, useMediaQuery } from "@/hooks/use-media-query";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { useCustomer, useLocationFilter } from "@/lib/api/hooks";
import {
  useConversationState,
  useInbox,
  useUpdateConversation,
  type InboxRow,
  type InboxTab,
} from "@/lib/api/messages";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { bookingUrlFor } from "@/lib/hosts";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  /** The open conversation. */
  c: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/messages")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Messages — RECAVO" },
      {
        name: "description",
        content: "Texts and emails with your clients, in one place.",
      },
      { property: "og:title", content: "RECAVO Messages" },
      {
        property: "og:description",
        content: "Talk to clients without leaving your booking system.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <MessagesPage />
      </AppShell>
    </RequireAuth>
  ),
});

const INBOX_PANEL_ID = "messages-inbox-list";

function MessagesPage() {
  const { c: selectedId } = Route.useSearch();
  const navigate = useNavigate({ from: "/messages" });
  const { business, can } = useTenant();
  const phone = useIsPhone();
  // The spec says 1280px, but beside the app sidebar that leaves the conversation ~380px wide.
  const wide = useMediaQuery("(min-width: 1440px)");
  const timezone = business?.defaultTimezone ?? "Europe/London";
  const locationId = useLocationFilter();
  const canWrite = can(PERMISSIONS.CUSTOMER_UPDATE);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridHeight = useFillHeight(gridRef, !phone);

  const [tab, setTab] = useState<InboxTab>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search);
  const inbox = useInbox({ tab, search: debounced, ...(locationId ? { locationId } : {}) });
  const update = useUpdateConversation();

  const [focusToken, setFocusToken] = useState(0);
  const [insertRequest, setInsertRequest] = useState<{ text: string; nonce: number } | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [managingReplies, setManagingReplies] = useState(false);
  const [panelSheet, setPanelSheet] = useState(false);
  const [newBooking, setNewBooking] = useState(false);
  const [openBooking, setOpenBooking] = useState<{ id: string; reschedule: boolean } | null>(null);

  const now = useMemo(() => new Date(), [inbox.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRow = inbox.items.find((r) => r.conversationId === selectedId) ?? null;
  const conversation = useConversationState(selectedId);
  const customerId = conversation.data?.customerId ?? selectedRow?.customer.id;
  const customer = useCustomer(customerId);

  const select = useCallback(
    (conversationId: string | undefined, opts: { focus?: boolean } = {}) => {
      void navigate({ search: conversationId ? { c: conversationId } : {}, replace: !phone });
      if (opts.focus) setFocusToken((n) => n + 1);
    },
    [navigate, phone],
  );

  // Desktop opens the newest conversation rather than an empty pane.
  const firstId = inbox.items[0]?.conversationId;
  useEffect(() => {
    if (phone || selectedId || !firstId || debounced || tab !== "all") return;
    select(firstId);
  }, [phone, selectedId, firstId, debounced, tab, select]);

  const bookingLink = business?.slug ? bookingUrlFor(business.slug) : null;
  const insert = (text: string) => setInsertRequest({ text, nonce: Date.now() });

  const panelActions: ClientPanelActions = {
    onViewProfile: () => {
      if (customerId) void navigate({ to: "/clients/$clientId", params: { clientId: customerId } });
    },
    onNewBooking: () => setNewBooking(true),
    onOpenBooking: (id, opts) => setOpenBooking({ id, reschedule: Boolean(opts?.reschedule) }),
    onSendBookingLink: () => {
      if (!bookingLink) return toast.error("Your booking page isn't set up yet");
      setPanelSheet(false);
      insert(bookingLink);
    },
  };

  const markDone = async (row: InboxRow) => {
    await update.mutateAsync({ conversationId: row.conversationId, patch: { done: true } });
    toast.success("Marked as done");
  };
  const markUnread = async (row: InboxRow) => {
    await update.mutateAsync({ conversationId: row.conversationId, patch: { unread: true } });
    toast.success("Marked as unread");
  };

  const noConversations =
    inbox.isSuccess && !debounced && tab === "all" && inbox.items.length === 0;

  const emptyList: ReactNode = debounced ? (
    <InboxEmpty
      action={
        <Button size="sm" variant="outline" onClick={() => setSearch("")}>
          Clear search
        </Button>
      }
    >
      No messages match "{debounced}"
    </InboxEmpty>
  ) : tab !== "all" ? (
    <InboxEmpty>You're all caught up.</InboxEmpty>
  ) : (
    <InboxEmpty>Conversations show here when you message a client or they reply to you.</InboxEmpty>
  );

  const inboxColumn = (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-2.5 border-b p-3.5">
        <InboxSearch value={search} onChange={setSearch} />
        <InboxTabs tab={tab} onTab={setTab} counts={inbox.counts} controls={INBOX_PANEL_ID} />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        aria-busy={inbox.isFetching && !inbox.isFetchingNextPage}
      >
        {inbox.isLoading ? (
          <InboxGhost />
        ) : inbox.isError ? (
          <InboxEmpty
            action={
              <Button size="sm" variant="outline" onClick={() => void inbox.refetch()}>
                Try again
              </Button>
            }
          >
            Couldn't load your messages.
          </InboxEmpty>
        ) : (
          <InboxList
            id={INBOX_PANEL_ID}
            rows={inbox.items}
            tab={tab}
            selectedId={phone ? null : (selectedId ?? null)}
            onSelect={(row) => select(row.conversationId)}
            now={now}
            tz={timezone}
            hasNextPage={Boolean(inbox.hasNextPage)}
            fetchingNext={inbox.isFetchingNextPage}
            onLoadMore={() => void inbox.fetchNextPage()}
            empty={emptyList}
            phone={phone}
            onMarkDone={(row) => void markDone(row)}
            onMarkUnread={(row) => void markUnread(row)}
          />
        )}
      </div>
    </div>
  );

  const panel = customer.data ? (
    <ClientPanel customer={customer.data} timezone={timezone} actions={panelActions} />
  ) : null;

  const thread = selectedId ? (
    <Thread
      key={selectedId}
      conversationId={selectedId}
      conversation={conversation.data}
      customer={customer.data}
      timezone={timezone}
      phone={phone}
      panelInline={wide}
      focusToken={focusToken}
      insertRequest={insertRequest}
      actions={{
        onViewProfile: panelActions.onViewProfile,
        onNewBooking: panelActions.onNewBooking,
        onOpenPanel: () => setPanelSheet(true),
        onManageSavedReplies: () => setManagingReplies(true),
        onBack: () => select(undefined),
      }}
      panelSlot={panel}
    />
  ) : null;

  const headerActions = canWrite ? (
    phone ? (
      <div className="flex gap-2">
        <Button
          size="icon"
          variant="outline"
          className="size-11"
          aria-label="Send announcement"
          onClick={() => setAnnouncing(true)}
        >
          <Megaphone className="size-5" />
        </Button>
        <Button
          size="icon"
          className="size-11 bg-mint text-[#10172a] hover:bg-mint/90"
          aria-label="New message"
          onClick={() => setPicking(true)}
        >
          <PenSquare className="size-5" />
        </Button>
      </div>
    ) : (
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setAnnouncing(true)}>
          <Megaphone className="size-4" /> Send announcement
        </Button>
        <Button onClick={() => setPicking(true)}>
          <Plus className="size-4" /> New message
        </Button>
      </div>
    )
  ) : null;

  const unread = inbox.counts?.unread ?? 0;

  return (
    <>
      <PageHeader
        title="Messages"
        description={
          phone
            ? inbox.counts
              ? unread
                ? `${unread} unread`
                : "All caught up"
              : undefined
            : "Texts and emails with your clients, in one place."
        }
        actions={headerActions}
      />

      {phone ? (
        <div className="mt-4 overflow-hidden rounded-2xl border bg-panel">{inboxColumn}</div>
      ) : (
        <div
          ref={gridRef}
          style={gridHeight ? { height: gridHeight } : undefined}
          className={cn(
            "mt-5 grid h-[calc(100dvh-16rem)] min-h-[520px] overflow-hidden rounded-2xl border bg-panel",
            wide
              ? "grid-cols-[320px_minmax(0,1fr)_270px]"
              : "grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]",
          )}
        >
          <div className="flex min-h-0 flex-col border-r">{inboxColumn}</div>
          <div className="min-h-0 min-w-0 bg-background">
            {noConversations ? (
              <NoMessagesYet
                canWrite={canWrite}
                onAnnounce={() => setAnnouncing(true)}
                onNewMessage={() => setPicking(true)}
              />
            ) : thread ? (
              thread
            ) : (
              <CentredNote>
                <ChatTile />
                <p className="mt-3 text-[16px] font-extrabold text-foreground">
                  Pick a conversation
                </p>
              </CentredNote>
            )}
          </div>
          {wide ? (
            <aside
              aria-label="Client"
              className="min-h-0 overflow-y-auto border-l bg-secondary p-4"
            >
              {selectedId ? panel : null}
            </aside>
          ) : null}
        </div>
      )}

      {phone && thread ? <PhoneConversation>{thread}</PhoneConversation> : null}

      {phone ? (
        <BottomSheet open={panelSheet && Boolean(panel)} onOpenChange={setPanelSheet}>
          <BottomSheetContent className="max-h-[85dvh]" aria-describedby={undefined}>
            <BottomSheetTitle className="sr-only">Client details</BottomSheetTitle>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{panel}</div>
          </BottomSheetContent>
        </BottomSheet>
      ) : null}

      <NewMessagePicker
        open={picking}
        onOpenChange={setPicking}
        onOpened={(conversationId) => {
          setPicking(false);
          select(conversationId, { focus: true });
        }}
      />
      <AnnouncementDrawer open={announcing} onOpenChange={setAnnouncing} />
      <SavedRepliesManager open={managingReplies} onOpenChange={setManagingReplies} />
      {newBooking && customerId ? (
        <AddBookingModal
          open={newBooking}
          onOpenChange={setNewBooking}
          defaultCustomerId={customerId}
        />
      ) : null}
      <BookingPanel
        bookingId={openBooking?.id ?? null}
        reschedule={openBooking?.reschedule ?? false}
        onClose={() => setOpenBooking(null)}
      />
    </>
  );
}

/** Full-screen conversation on a phone, sized to the visible area so the reply box rides the keyboard. */
function PhoneConversation({ children }: { children: ReactNode }) {
  const viewport = useVisualViewport();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex h-dvh flex-col bg-background"
      style={viewport ? { top: viewport.offsetTop, height: viewport.height } : undefined}
    >
      {children}
    </div>
  );
}

function CentredNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center text-[13.5px] text-muted-foreground">
      {children}
    </div>
  );
}

function NoMessagesYet({
  canWrite,
  onAnnounce,
  onNewMessage,
}: {
  canWrite: boolean;
  onAnnounce: () => void;
  onNewMessage: () => void;
}) {
  return (
    <CentredNote>
      <ChatTile />
      <p className="mt-3 text-[18px] font-extrabold text-foreground">No messages yet</p>
      <p className="mt-1.5 max-w-[420px]">
        Message a client about a booking, or send an announcement to everyone. When clients reply to
        your texts or emails, the replies land here.
      </p>
      {canWrite ? (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={onAnnounce}>
            <Megaphone className="size-4" /> Send announcement
          </Button>
          <Button onClick={onNewMessage}>
            <Plus className="size-4" /> New message
          </Button>
        </div>
      ) : null}
      <p className="mt-5 text-[12.5px]">
        Automatic messages (confirmations, reminders) are in{" "}
        <Link
          to="/settings/$page"
          params={{ page: "client-messages" }}
          className="font-semibold text-foreground underline"
        >
          Settings › Client messages
        </Link>
        .
      </p>
    </CentredNote>
  );
}

function InboxGhost() {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-3.5 py-3">
          <span className="size-9 animate-pulse rounded-full bg-secondary" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3 w-1/2 animate-pulse rounded bg-secondary" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-secondary" />
          </span>
        </div>
      ))}
    </div>
  );
}
