export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      {/* Compact hides the wordmark text, so the mark itself carries the name. */}
      <img
        src="/recavo-logo.jpg"
        alt={compact ? "RECAVO" : ""}
        className="size-9 rounded-xl object-cover"
      />
      {!compact ? (
        <span className="text-[19px] font-semibold tracking-tight text-sidebar-accent-foreground">
          RECAVO
        </span>
      ) : null}
    </span>
  );
}
