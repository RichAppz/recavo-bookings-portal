import type { ReactNode } from "react";
import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import {
  BellRing,
  CalendarPlus,
  ChevronLeft,
  Copy,
  FileText,
  Hourglass,
  MessageSquare,
  MoreHorizontal,
  Package,
  Phone,
  Plus,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { CustomerAvatar } from "@/components/CustomerAvatar";
import { AVATAR_TINTS, TONE_TEXT, TonePill } from "@/components/client-profile/parts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { customerDisplayName, type Customer } from "@/lib/api/types";
import {
  isMaskedContact,
  longDate,
  monthYear,
  PROFILE_PILL_LABELS,
  PROFILE_PILL_TONES,
  type ProfilePillKind,
  type Tone,
} from "@/lib/client-profile";
import { avatarTintIndex } from "@/lib/clients-list";
import { cn } from "@/lib/utils";

/** "‹ Clients": real Back when there's in-app history, otherwise the Clients list. */
export function ProfileBackLink({ className }: { className?: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const cls = cn(
    "inline-flex w-fit cursor-pointer items-center gap-0.5 text-[13.5px] font-bold text-foreground/70 hover:text-foreground",
    className,
  );
  if (canGoBack) {
    return (
      <button type="button" onClick={() => router.history.back()} className={cls}>
        <ChevronLeft className="size-4" /> Clients
      </button>
    );
  }
  return (
    <Link to="/clients" className={cls}>
      <ChevronLeft className="size-4" /> Clients
    </Link>
  );
}

export type HeaderActions = {
  /** Undefined hides the item (no permission, or nothing to act on). */
  message?: () => void;
  newBooking?: () => void;
  sellPackage?: () => void;
  addToWaitlist?: () => void;
  setReminder?: () => void;
  newInvoice?: () => void;
  archive?: () => void;
  reactivate?: () => void;
};

const copy = (value: string, what: string) => {
  void navigator.clipboard.writeText(value);
  toast.success(`${what} copied`);
};

function MoreMenu({
  client,
  actions,
  trigger,
}: {
  client: Customer;
  actions: HeaderActions;
  trigger: ReactNode;
}) {
  const email =
    client.emailDisplay && !isMaskedContact(client.emailDisplay) ? client.emailDisplay : null;
  const phone =
    client.phoneDisplay && !isMaskedContact(client.phoneDisplay) ? client.phoneDisplay : null;
  const main = [
    actions.sellPackage && (
      <DropdownMenuItem key="pkg" onSelect={actions.sellPackage}>
        <Package className="size-4" /> Sell package
      </DropdownMenuItem>
    ),
    actions.addToWaitlist && (
      <DropdownMenuItem key="wl" onSelect={actions.addToWaitlist}>
        <Hourglass className="size-4" /> Add to waitlist
      </DropdownMenuItem>
    ),
    actions.setReminder && (
      <DropdownMenuItem key="rem" onSelect={actions.setReminder}>
        <BellRing className="size-4" /> Set a reminder
      </DropdownMenuItem>
    ),
    actions.newInvoice && (
      <DropdownMenuItem key="inv" onSelect={actions.newInvoice}>
        <FileText className="size-4" /> New invoice
      </DropdownMenuItem>
    ),
  ].filter(Boolean);
  const copies = [
    email && (
      <DropdownMenuItem key="ce" onSelect={() => copy(email, "Email")}>
        <Copy className="size-4" /> Copy email
      </DropdownMenuItem>
    ),
    phone && (
      <DropdownMenuItem key="cp" onSelect={() => copy(phone, "Phone number")}>
        <Copy className="size-4" /> Copy phone
      </DropdownMenuItem>
    ),
  ].filter(Boolean);
  const status = actions.archive ? (
    <DropdownMenuItem key="arch" onSelect={actions.archive}>
      <ShieldOff className="size-4" /> Archive client
    </DropdownMenuItem>
  ) : actions.reactivate ? (
    <DropdownMenuItem key="react" onSelect={actions.reactivate}>
      <ShieldOff className="size-4" /> Reactivate
    </DropdownMenuItem>
  ) : null;
  if (main.length === 0 && copies.length === 0 && !status) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {main}
        {main.length > 0 && copies.length > 0 ? <DropdownMenuSeparator /> : null}
        {copies}
        {status && main.length + copies.length > 0 ? <DropdownMenuSeparator /> : null}
        {status}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContactLine({ client, timezone }: { client: Customer; timezone: string }) {
  const parts: ReactNode[] = [
    client.emailDisplay ? (
      <span key="e">{client.emailDisplay}</span>
    ) : (
      <span key="e" className="italic">
        No email
      </span>
    ),
    client.phoneDisplay ? (
      <span key="p">{client.phoneDisplay}</span>
    ) : (
      <span key="p" className="italic">
        No mobile
      </span>
    ),
    <span key="s">Client since {longDate(client.createdAt, timezone)}</span>,
  ];
  if (client.userId) parts.push(<span key="u">Portal account</span>);
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? " · " : null}
          {p}
        </span>
      ))}
    </p>
  );
}

export function ProfileHeader({
  client,
  pill,
  timezone,
  actions,
  isPhone,
}: {
  client: Customer;
  pill: ProfilePillKind | null;
  timezone: string;
  actions: HeaderActions;
  isPhone: boolean;
}) {
  const anonymised = client.status === "anonymised";
  const name = anonymised ? "Anonymised client" : customerDisplayName(client);
  const tint = AVATAR_TINTS[avatarTintIndex(client.id)];
  const pillEl = pill ? (
    <TonePill tone={PROFILE_PILL_TONES[pill]}>{PROFILE_PILL_LABELS[pill]}</TonePill>
  ) : null;
  const canCall =
    Boolean(client.phoneDisplay) && !isMaskedContact(client.phoneDisplay) && !anonymised;

  if (isPhone) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div className="flex items-center justify-between">
          <ProfileBackLink />
          {anonymised ? null : (
            <MoreMenu
              client={client}
              actions={actions}
              trigger={
                <Button variant="ghost" size="icon" className="size-11" aria-label="More actions">
                  <MoreHorizontal className="size-5" />
                </Button>
              }
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <CustomerAvatar
            customer={client}
            size={52}
            editable
            badge
            initialsClassName={cn(tint, "text-base font-extrabold")}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] leading-tight font-extrabold">{name}</h1>
              {pillEl}
            </div>
            {anonymised ? null : (
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {[client.nickname?.trim(), `client since ${monthYear(client.createdAt, timezone)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
        {anonymised ? null : (
          <div className="flex gap-2">
            {actions.newBooking ? (
              <Button className="h-11 min-w-0 flex-[1.6] px-3" onClick={actions.newBooking}>
                <CalendarPlus className="size-4" /> Book
              </Button>
            ) : null}
            {actions.message ? (
              <Button
                variant="outline"
                className="h-11 min-w-0 flex-1 px-3"
                onClick={actions.message}
              >
                <MessageSquare className="size-4" /> Message
              </Button>
            ) : null}
            {canCall ? (
              <Button variant="outline" className="h-11 min-w-0 flex-1 px-3" asChild>
                <a href={`tel:${client.phoneDisplay}`}>
                  <Phone className="size-4" /> Call
                </a>
              </Button>
            ) : null}
            <MoreMenu
              client={client}
              actions={{ ...actions, archive: actions.archive, reactivate: actions.reactivate }}
              trigger={
                <Button variant="outline" className="h-11 min-w-0 flex-1 px-3">
                  More
                </Button>
              }
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-[18px]">
      <ProfileBackLink />
      <div className="flex items-start gap-4">
        <CustomerAvatar
          customer={client}
          size={64}
          editable
          badge
          initialsClassName={cn(tint, "text-lg font-extrabold")}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[30px] leading-tight font-extrabold tracking-tight">{name}</h1>
            {client.nickname && !anonymised ? (
              <span className="rounded-lg bg-secondary px-2 py-0.5 text-[12.5px] font-semibold text-secondary-foreground">
                Known as {client.nickname}
              </span>
            ) : null}
            {pillEl}
          </div>
          {anonymised ? null : <ContactLine client={client} timezone={timezone} />}
        </div>
        {anonymised ? null : (
          <div className="flex shrink-0 items-center gap-2">
            {actions.message ? (
              <Button variant="outline" onClick={actions.message}>
                <MessageSquare className="size-4" /> Message
              </Button>
            ) : null}
            <MoreMenu
              client={client}
              actions={actions}
              trigger={
                <Button
                  variant="outline"
                  size="icon"
                  className="size-[38px]"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            {actions.newBooking ? (
              <Button onClick={actions.newBooking}>
                <Plus className="size-4" /> New booking
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusBanner({
  tone,
  children,
  action,
}: {
  tone: "grey" | "red";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm",
        tone === "red"
          ? "bg-[#fdeaea] text-[#8c1d22] dark:bg-[rgba(229,72,77,0.16)] dark:text-[#f5b3b5]"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}

export type StripCell = {
  key: string;
  label: string;
  value: string;
  sub: ReactNode;
  subTone?: Tone;
  /** Full sentence for screen readers. */
  aria: string;
  onClick?: () => void;
};

export function SummaryStrip({ cells, isPhone }: { cells: StripCell[]; isPhone: boolean }) {
  if (isPhone) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            aria-label={c.aria}
            className="min-w-0 cursor-pointer rounded-xl border bg-card px-2 py-2 text-left"
          >
            <span className="block truncate text-[11px] font-semibold text-muted-foreground">
              {c.label}
            </span>
            <span className="block truncate text-sm font-extrabold tracking-tight">{c.value}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div
      className="grid divide-x overflow-hidden rounded-2xl border bg-secondary/40 dark:bg-secondary/20"
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onClick}
          aria-label={c.aria}
          className="min-w-0 cursor-pointer px-4 py-3 text-left transition-colors hover:bg-secondary/60"
        >
          <span className="block text-[12.5px] font-semibold text-muted-foreground">{c.label}</span>
          <span className="mt-0.5 block truncate text-[19px] font-extrabold">{c.value}</span>
          <span
            className={cn(
              "mt-0.5 block truncate text-xs",
              c.subTone ? TONE_TEXT[c.subTone] : "text-muted-foreground",
            )}
          >
            {c.sub}
          </span>
        </button>
      ))}
    </div>
  );
}
