import type { ComponentProps, ReactNode } from "react";
import { MessagesSquare } from "lucide-react";
import { AVATAR_TINTS } from "@/components/client-profile/parts";
import { avatarTintIndex } from "@/lib/clients-list";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ClientAvatar({
  id,
  name,
  size = 36,
  className,
}: {
  id: string;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-extrabold",
        AVATAR_TINTS[avatarTintIndex(id)],
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name) || "?"}
    </span>
  );
}

/** 52px mint-tint tile with the chat icon, for empty states. */
export function ChatTile({ size = 52 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-2xl bg-primary-soft text-[#1f6b41] dark:text-mint"
      style={{ width: size, height: size }}
    >
      <MessagesSquare className="size-6" />
    </span>
  );
}

/** "Needs reply" amber tag. */
export function NeedsReplyTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full bg-[#fdf0dc] px-2 text-[11px] font-extrabold text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
        className,
      )}
    >
      Needs reply
    </span>
  );
}

export function SmallChip({
  children,
  onClick,
  className,
  ...rest
}: {
  children: ReactNode;
  onClick?: ComponentProps<"button">["onClick"];
  className?: string;
} & Omit<ComponentProps<"button">, "onClick" | "className" | "children">) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border bg-background px-3 text-[12.5px] font-semibold whitespace-nowrap text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
