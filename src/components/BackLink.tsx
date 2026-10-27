import { Link, useCanGoBack, useRouter, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const linkClass =
  "inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground";

/**
 * Takes the user back to wherever they came from. With in-app history it is a real
 * "Back" (the booking, the client, the list they clicked from); on a cold load — a
 * shared link, a refresh, the desktop app opening on this page — there is nothing
 * behind it, so it falls back to the section's list page with a named label.
 */
export function BackLink({
  fallbackTo,
  fallbackLabel,
  fallbackSearch,
  className,
}: {
  fallbackTo: LinkProps["to"];
  fallbackLabel: string;
  fallbackSearch?: LinkProps["search"];
  className?: string;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  if (canGoBack) {
    return (
      <button
        type="button"
        onClick={() => router.history.back()}
        className={cn(linkClass, className)}
      >
        <ArrowLeft className="size-4" /> Back
      </button>
    );
  }
  return (
    <Link
      to={fallbackTo}
      {...(fallbackSearch !== undefined ? { search: fallbackSearch } : {})}
      className={cn(linkClass, className)}
    >
      <ArrowLeft className="size-4" /> {fallbackLabel}
    </Link>
  );
}

/** Icon-only Back for the shell header: present only when there is in-app history. */
export function HeaderBackButton({ className }: { className?: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  if (!canGoBack) return null;
  return (
    <button
      type="button"
      onClick={() => router.history.back()}
      aria-label="Back"
      title="Back"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
