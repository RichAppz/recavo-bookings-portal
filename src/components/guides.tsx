import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Maximize2 } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ALL_VERTICALS,
  imageSrc,
  type Copy,
  type Guide,
  type GuideImage as GuideImageRef,
} from "@/lib/guides";
import { useGuideCopy } from "@/lib/use-guides";
import { VERTICALS, type VerticalKey } from "@/lib/verticals";
import { cn } from "@/lib/utils";

export function VerticalSwitch({
  value,
  onChange,
}: {
  value: VerticalKey;
  onChange: (v: VerticalKey) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5 text-xs">
      {ALL_VERTICALS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors",
            v === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {VERTICALS[v].label}
        </button>
      ))}
    </div>
  );
}

export function GuideCard({
  guide,
  vertical,
  compact = false,
}: {
  guide: Guide;
  vertical: VerticalKey;
  compact?: boolean;
}) {
  const t = useGuideCopy(vertical);
  return (
    <Link
      to="/support/guides/$slug"
      params={{ slug: guide.slug }}
      className={cn(
        "group flex flex-col gap-1.5 rounded-xl border bg-card transition-colors hover:border-primary/40 hover:bg-secondary/40",
        compact ? "px-3.5 py-3" : "p-4",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className={cn("font-medium", compact ? "text-sm" : "text-[15px]")}>
          {t(guide.title)}
        </span>
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </span>
      {!compact ? (
        <span className="line-clamp-2 text-sm text-muted-foreground">{t(guide.summary)}</span>
      ) : null}
      <span className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted-foreground">
        <Clock className="size-3" /> {guide.minutes} min · {guide.steps.length} steps
      </span>
    </Link>
  );
}

/**
 * A step's screenshot: the phone capture on phones, the desktop capture on wider
 * screens, so what the reader sees matches what their own screen looks like.
 * Tap to see it full size.
 */
export function GuideImage({
  guide,
  image,
  vertical,
  className,
}: {
  guide: Guide;
  image: GuideImageRef;
  vertical: VerticalKey;
  className?: string;
}) {
  const t = useGuideCopy(vertical);
  const [open, setOpen] = useState(false);
  const desktop = imageSrc(guide, image, vertical, "desktop");
  const mobile = imageSrc(guide, image, vertical, "mobile");
  const alt = t(image.alt);
  const picture = (full: boolean) => (
    <picture>
      <source media="(max-width: 767px)" srcSet={mobile} />
      <img
        src={desktop}
        alt={alt}
        loading={full ? "eager" : "lazy"}
        decoding="async"
        className={cn(
          "w-full",
          full ? "max-h-[85vh] object-contain" : "bg-secondary/40 object-cover object-top",
        )}
      />
    </picture>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${alt} — view full size`}
        className={cn(
          "group relative block w-full overflow-hidden rounded-xl border bg-secondary/40 text-left shadow-sm transition-shadow hover:shadow-md",
          className,
        )}
      >
        {picture(false)}
        <span className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-md bg-background/85 text-muted-foreground opacity-0 shadow transition-opacity group-hover:opacity-100">
          <Maximize2 className="size-3.5" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(96vw,1200px)] p-2 sm:p-3">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {picture(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Step body: short markdown with the business's own words filled in. */
export function GuideBody({
  value,
  vertical,
  className,
}: {
  value: Copy;
  vertical: VerticalKey;
  className?: string;
}) {
  const t = useGuideCopy(vertical);
  return <Markdown className={cn("text-muted-foreground", className)}>{t(value)}</Markdown>;
}
