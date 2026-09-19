import { useEffect, useState, type ReactNode } from "react";
import { Wordmark } from "@/components/Wordmark";
import { consumeNativeReturn } from "@/lib/native-return";

/**
 * When this page has been opened inside the mobile app's browser sheet at the
 * end of a hosted Stripe flow (see lib/native-return.ts), hands the URL back
 * to the app instead of rendering — the session lives in the app, not here.
 * Everywhere else it renders its children untouched.
 */
export function NativeReturnGate({ children }: { children: ReactNode }) {
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    const target = consumeNativeReturn();
    if (!target) return;
    setLink(target);
    window.location.replace(target);
  }, []);

  if (!link) return children;

  return (
    <div className="screen-center bg-background px-safe-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Returning to the app…</h1>
          <p className="text-sm text-muted-foreground">
            If nothing happens, tap the button below to carry on in the RECAVO app.
          </p>
        </div>
        <a
          href={link}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          Open RECAVO
        </a>
      </div>
    </div>
  );
}
