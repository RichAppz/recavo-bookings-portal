import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Fetches the next page as soon as the end of the list scrolls into view, so a
 * long list reads as one list rather than 25 rows and a button. The button is
 * kept as a fallback for anyone whose browser never fires the observer.
 */
export function LoadMoreSentinel({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      // Start the fetch a little before the person reaches the bottom.
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  if (!hasNextPage) return null;

  return (
    <div ref={ref} className="flex items-center justify-center border-t p-4">
      {isFetchingNextPage ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading more…
        </span>
      ) : (
        <Button variant="ghost" size="sm" onClick={onLoadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
