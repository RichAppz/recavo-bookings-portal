export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      {/* Compact hides the wordmark text, so the mark itself carries the name. */}
      {/* A proportional radius rather than a named one: the theme's --radius-xl
          is 18px, which on a 36px square rounds to a circle. A percentage keeps
          the app-icon shape whatever size the mark is drawn at. */}
      <img
        src="/recavo-logo.jpg"
        alt={compact ? "RECAVO" : ""}
        className="size-9 rounded-[22%] object-cover"
      />
      {/* Inherits its colour: the wordmark sits on the dark sidebar and on light
          public pages, and a fixed near-white made it invisible on the latter. */}
      {/* 800 to match the wordmark the emails render in their header. */}
      {!compact ? <span className="text-[19px] font-extrabold tracking-tight">RECAVO</span> : null}
    </span>
  );
}
