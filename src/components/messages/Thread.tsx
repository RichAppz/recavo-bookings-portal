import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BellOff,
  CalendarPlus,
  Check,
  ChevronLeft,
  Info,
  Link2,
  Mail,
  MailOpen,
  MoreHorizontal,
  PanelRight,
  ShieldBan,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCustomerNotifications } from "@/lib/api/hooks";
import {
  useMarkConversationOpened,
  useSendConversationMessage,
  useThread,
  useUpdateConversation,
  type ConversationState,
} from "@/lib/api/messages";
import { customerDisplayName, type Customer } from "@/lib/api/types";
import { formatInTz, timeInTz } from "@/lib/format";
import { bookingUrlFor } from "@/lib/hosts";
import {
  bubbleLabel,
  buildStream,
  eventLineFor,
  messageStatus,
  type EventLine,
  type MessageLike,
} from "@/lib/messages";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { useNextBooking } from "./use-next-booking";
import { ClientAvatar } from "./parts";
import { ReplyBox } from "./ReplyBox";

export type ThreadActions = {
  onViewProfile: () => void;
  onNewBooking: () => void;
  onOpenPanel: () => void;
  onManageSavedReplies: () => void;
  onBack?: () => void;
};

export function Thread({
  conversationId,
  conversation,
  customer,
  timezone,
  phone,
  panelInline,
  focusToken,
  insertRequest,
  actions,
  panelSlot,
}: {
  conversationId: string;
  conversation: ConversationState | undefined;
  customer: Customer | undefined;
  timezone: string;
  phone: boolean;
  /** The client panel is beside the thread, so no Client button is needed. */
  panelInline: boolean;
  focusToken: number;
  insertRequest: { text: string; nonce: number } | null;
  actions: ThreadActions;
  /** Where the desktop "Client" popover content comes from (panel hidden below 1280px). */
  panelSlot?: ReactNode;
}) {
  const { business, can } = useTenant();
  const thread = useThread(conversationId);
  const notifications = useCustomerNotifications(customer?.id);
  const opened = useMarkConversationOpened();
  const update = useUpdateConversation();
  const [muteEvents, setMuteEvents] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const name = customer ? customerDisplayName(customer) : "";
  const now = new Date();

  const events = useMemo<EventLine[]>(
    () =>
      muteEvents
        ? []
        : (notifications.data ?? []).flatMap((n) => {
            const e = eventLineFor(n);
            return e ? [e] : [];
          }),
    [notifications.data, muteEvents],
  );
  const messages = thread.messages;
  const stream = useMemo(
    () => buildStream(messages, events, now, timezone),
    // `now` only moves the Today / Yesterday labels; recomputing on data is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, events, timezone],
  );

  const lastHuman = [...messages]
    .reverse()
    .find((m) => m.senderType === "customer" || (m.senderType === "staff" && !m.isAnnouncement));
  const needsReply =
    lastHuman?.senderType === "customer" &&
    (!conversation?.doneAt || conversation.doneAt < lastHuman.createdAt);
  const blocked = Boolean(conversation?.blockedAt);
  const canWrite = can(PERMISSIONS.CUSTOMER_UPDATE);

  // Opening the thread reads the client's messages; again whenever a new one lands here.
  const lastIncomingId = [...messages].reverse().find((m) => m.senderType === "customer")?.id;
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!thread.isSuccess) return;
    const key = `${conversationId}:${lastIncomingId ?? ""}`;
    if (openedFor.current === key) return;
    openedFor.current = key;
    opened.mutate(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, lastIncomingId, thread.isSuccess]);

  // Polite announcement for messages that arrive while the thread is open.
  const [announcement, setAnnouncement] = useState("");
  const seenIncoming = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!thread.isSuccess) return;
    if (seenIncoming.current === undefined) {
      seenIncoming.current = lastIncomingId ?? null;
      return;
    }
    if (lastIncomingId && lastIncomingId !== seenIncoming.current) {
      seenIncoming.current = lastIncomingId;
      setAnnouncement(`New message from ${name}`);
    }
  }, [lastIncomingId, thread.isSuccess, name]);

  const scroller = useScrollManager(conversationId, messages, thread);

  const bookingLink = business?.slug ? bookingUrlFor(business.slug) : null;
  const next = useNextBooking(customer?.id);

  const setDone = async () => {
    await update.mutateAsync({ conversationId, patch: { done: true } });
    toast.success("Marked as done");
  };

  const menu = (
    <ConversationMenu
      phone={phone}
      needsReply={Boolean(needsReply)}
      muteEvents={muteEvents}
      blocked={blocked}
      canWrite={canWrite}
      canBook={can(PERMISSIONS.BOOKING_CREATE)}
      onViewProfile={actions.onViewProfile}
      onNewBooking={actions.onNewBooking}
      onMarkDone={() => void setDone()}
      onMarkUnread={async () => {
        await update.mutateAsync({ conversationId, patch: { unread: true } });
        toast.success("Marked as unread");
      }}
      onToggleMute={() => setMuteEvents((m) => !m)}
      onBlock={() => setConfirmBlock(true)}
      onUnblock={async () => {
        await update.mutateAsync({ conversationId, patch: { blocked: false } });
        toast.success(`${name} can message you again`);
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {phone ? (
        <header className="pt-safe flex items-center gap-2 border-b bg-panel px-2 py-2">
          <button
            type="button"
            onClick={actions.onBack}
            aria-label="Back to messages"
            className="flex size-11 cursor-pointer items-center justify-center rounded-full hover:bg-secondary"
          >
            <ChevronLeft className="size-6" />
          </button>
          {customer ? <ClientAvatar id={customer.id} name={name} size={28} /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15.5px] font-extrabold">{name}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {next.next
                ? `Next: ${formatInTz(next.next.start, next.next.timezone || timezone, { weekday: "short", day: "numeric", month: "short" })} · ${timeInTz(next.next.start, next.next.timezone || timezone)}`
                : "No upcoming bookings"}
            </p>
          </div>
          <button
            type="button"
            onClick={actions.onOpenPanel}
            aria-label="Client details"
            className="flex size-11 cursor-pointer items-center justify-center rounded-full hover:bg-secondary"
          >
            <Info className="size-5" />
          </button>
          {menu}
        </header>
      ) : (
        <header className="flex items-center gap-3 border-b px-[18px] py-3">
          {customer ? <ClientAvatar id={customer.id} name={name} /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-extrabold">{name}</p>
            <p className="truncate text-[12.5px] text-muted-foreground">
              {[customer?.phoneDisplay, customer?.emailDisplay].filter(Boolean).join(" · ") ||
                "No contact details"}
            </p>
          </div>
          {canWrite && needsReply ? (
            <Button size="sm" variant="outline" onClick={() => void setDone()}>
              <Check className="size-4" /> Mark as done
            </Button>
          ) : null}
          {!panelInline && panelSlot ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <PanelRight className="size-4" /> Client
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="max-h-[70vh] w-[300px] overflow-y-auto bg-secondary"
              >
                {panelSlot}
              </PopoverContent>
            </Popover>
          ) : null}
          {menu}
        </header>
      )}

      <div
        ref={scroller.ref}
        onScroll={scroller.onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-[22px]"
      >
        {thread.isFetchingNextPage ? (
          <p className="pb-2 text-center text-xs text-muted-foreground">
            Loading earlier messages…
          </p>
        ) : null}
        {thread.isLoading ? (
          <ThreadGhost />
        ) : stream.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-[13.5px] text-muted-foreground">
            <p className="font-bold text-foreground">
              No messages with {name || "this client"} yet
            </p>
            <p className="mt-1">Write below to start the conversation.</p>
          </div>
        ) : (
          <ol role="log" aria-label={`Conversation with ${name}`} className="flex flex-col gap-2">
            {stream.map((item) => (
              <Fragment key={item.key}>
                {item.kind === "day" ? (
                  <li className="py-2 text-center text-[12px] font-bold text-muted-foreground">
                    {item.label}
                  </li>
                ) : item.kind === "event" ? (
                  <EventPill event={item.event} timezone={timezone} />
                ) : (
                  <Bubble
                    message={item.message}
                    mine={item.mine}
                    showMeta={item.showMeta}
                    sender={item.mine ? "You" : name}
                    timezone={timezone}
                    phone={phone}
                    bookingLink={bookingLink}
                    businessName={business?.tradingName ?? business?.legalName ?? ""}
                    conversationId={conversationId}
                  />
                )}
              </Fragment>
            ))}
          </ol>
        )}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>

      {blocked ? (
        <div className="border-t bg-secondary px-[18px] py-3.5 text-[13.5px]">
          <p>
            <strong>You blocked {name}.</strong> They can't message you from their client account.
          </p>
          {canWrite ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={async () => {
                await update.mutateAsync({ conversationId, patch: { blocked: false } });
                toast.success(`${name} can message you again`);
              }}
            >
              Unblock
            </Button>
          ) : null}
        </div>
      ) : canWrite ? (
        <div className={phone ? "pb-safe bg-panel" : undefined}>
          <ReplyBox
            key={conversationId}
            conversationId={conversationId}
            customer={customer}
            messages={messages}
            businessName={business?.tradingName ?? business?.legalName ?? ""}
            bookingLink={bookingLink}
            phone={phone}
            focusToken={focusToken}
            onManageSavedReplies={actions.onManageSavedReplies}
            insertRequest={insertRequest}
          />
        </div>
      ) : null}

      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They won't be able to message you from their client account. Bookings, reminders and
              your own messages still work. You can unblock them here at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await update.mutateAsync({ conversationId, patch: { blocked: true } });
                toast.success(`${name} is blocked`);
              }}
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Opens at the bottom, keeps your place when older messages load above, follows new ones. */
function useScrollManager(
  conversationId: string,
  messages: MessageLike[],
  thread: ReturnType<typeof useThread>,
) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const restore = useRef<number | null>(null);
  const initialised = useRef<string | null>(null);
  const lastId = messages[messages.length - 1]?.id;
  const firstId = messages[0]?.id;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !thread.isSuccess) return;
    if (initialised.current !== conversationId) {
      initialised.current = conversationId;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (restore.current !== null) {
      el.scrollTop = el.scrollHeight - restore.current;
      restore.current = null;
      return;
    }
    const mine = messages[messages.length - 1]?.senderType === "staff";
    if (atBottom.current || mine) el.scrollTop = el.scrollHeight;
    // Only a new first or last message moves the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, lastId, firstId, thread.isSuccess]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 80 && thread.hasNextPage && !thread.isFetchingNextPage) {
      restore.current = el.scrollHeight - el.scrollTop;
      void thread.fetchNextPage();
    }
  };
  return { ref, onScroll };
}

function ThreadGhost() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[60, 40, 52, 30].map((w, i) => (
        <div
          key={i}
          className={cn("h-10 animate-pulse rounded-2xl bg-secondary", i % 2 ? "self-end" : "")}
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function MessageText({
  text,
  bookingLink,
  businessName,
  mine,
}: {
  text: string;
  bookingLink: string | null;
  businessName: string;
  mine: boolean;
}) {
  const parts = text.split(URL_RE);
  return (
    <span className="break-words whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (bookingLink && part.replace(/\/$/, "") === bookingLink) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "mx-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-[12.5px] font-bold no-underline",
                mine ? "bg-white/15 dark:bg-[#10172a]/10" : "bg-panel",
              )}
            >
              <Link2 className="size-3.5" /> Book with {businessName}
            </a>
          );
        }
        return (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="underline">
            {part}
          </a>
        );
      })}
    </span>
  );
}

function Bubble({
  message,
  mine,
  showMeta,
  sender,
  timezone,
  phone,
  bookingLink,
  businessName,
  conversationId,
}: {
  message: MessageLike;
  mine: boolean;
  showMeta: boolean;
  sender: string;
  timezone: string;
  phone: boolean;
  bookingLink: string | null;
  businessName: string;
  conversationId: string;
}) {
  const status = messageStatus(message);
  const retry = useSendConversationMessage(conversationId);
  const email = message.channel === "email";
  return (
    <li className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      {email || message.isAnnouncement ? (
        <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
          {email ? <Mail className="size-3" aria-hidden /> : null}
          {message.isAnnouncement ? "Announcement" : "Email"}
        </span>
      ) : null}
      <div
        aria-label={bubbleLabel(message, sender, timezone, status)}
        className={cn(
          "px-[13px] py-[9px] text-[14px] leading-5",
          phone ? "max-w-[82%]" : "max-w-[68%]",
          mine
            ? "rounded-[16px_16px_4px_16px] bg-[#10172a] text-white dark:bg-[#6ee7b0] dark:text-[#10172a]"
            : "rounded-[16px_16px_16px_4px] bg-secondary text-foreground",
        )}
      >
        {email && message.subject ? (
          <strong className="mb-0.5 block font-bold">{message.subject}</strong>
        ) : null}
        <MessageText
          text={message.body}
          bookingLink={bookingLink}
          businessName={businessName}
          mine={mine}
        />
      </div>
      {showMeta || status?.tone === "error" ? (
        <span aria-hidden className="mt-1 text-[11.5px] text-muted-foreground">
          {timeInTz(message.createdAt, timezone)}
          {message.channel === "sms" && mine ? " · Text" : ""}
          {status && status.tone === "muted" ? ` · ${status.text}` : null}
          {status && status.tone === "error" ? (
            <>
              {" · "}
              <span className="font-semibold text-destructive" title={status.reason}>
                Not delivered
              </span>
              {" · "}
              <button
                type="button"
                disabled={retry.isPending}
                onClick={() =>
                  retry.mutate({
                    body: message.body,
                    channel: message.channel ?? "in_app",
                    subject: message.subject ?? null,
                  })
                }
                className="cursor-pointer font-semibold text-destructive underline"
                aria-label={`Retry sending: ${status.reason}`}
              >
                Retry
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

function EventPill({ event, timezone }: { event: EventLine; timezone: string }) {
  const n = event.notification;
  const label = [event.label, event.channel].filter(Boolean).join(" ");
  const pill = (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[12px] font-semibold text-foreground/70">
      <MailOpen className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {label} · {timeInTz(event.at, timezone)}
      </span>
    </span>
  );
  return (
    <li className="flex justify-center py-1">
      {n ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="max-w-full cursor-pointer"
              aria-label={`${label}, ${timeInTz(event.at, timezone)}. Show what was sent`}
            >
              {pill}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 text-[13px]">
            <p className="text-[11.5px] font-bold text-muted-foreground">
              Sent {event.channel || "in their account"} ·{" "}
              {formatInTz(event.at, timezone, { dateStyle: "medium", timeStyle: "short" })}
            </p>
            {n.subject ? <p className="mt-1.5 font-bold">{n.subject}</p> : null}
            <p className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap text-foreground/85">
              {n.body}
            </p>
          </PopoverContent>
        </Popover>
      ) : (
        pill
      )}
    </li>
  );
}

function ConversationMenu({
  phone,
  needsReply,
  muteEvents,
  blocked,
  canWrite,
  canBook,
  onViewProfile,
  onNewBooking,
  onMarkDone,
  onMarkUnread,
  onToggleMute,
  onBlock,
  onUnblock,
}: {
  phone: boolean;
  needsReply: boolean;
  muteEvents: boolean;
  blocked: boolean;
  canWrite: boolean;
  canBook: boolean;
  onViewProfile: () => void;
  onNewBooking: () => void;
  onMarkDone: () => void;
  onMarkUnread: () => void;
  onToggleMute: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant={phone ? "ghost" : "outline"}
          className={phone ? "size-11" : "size-8"}
          aria-label="More actions"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {phone && canWrite && needsReply ? (
          <DropdownMenuItem onSelect={onMarkDone}>
            <Check className="size-4" /> Mark as done
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onViewProfile}>
          <UserRound className="size-4" /> View profile
        </DropdownMenuItem>
        {canBook ? (
          <DropdownMenuItem onSelect={onNewBooking}>
            <CalendarPlus className="size-4" /> New booking
          </DropdownMenuItem>
        ) : null}
        {canWrite ? (
          <DropdownMenuItem onSelect={onMarkUnread}>
            <Mail className="size-4" /> Mark as unread
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onToggleMute}>
          <BellOff className="size-4" />
          {muteEvents ? "Show automatic message lines" : "Mute automatic message lines"}
        </DropdownMenuItem>
        {canWrite ? (
          <>
            <DropdownMenuSeparator />
            {blocked ? (
              <DropdownMenuItem onSelect={onUnblock}>
                <ShieldBan className="size-4" /> Unblock client
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={onBlock}
                className="text-destructive focus:text-destructive"
              >
                <ShieldBan className="size-4" /> Block client
              </DropdownMenuItem>
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
