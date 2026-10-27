import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useBlocker } from "@tanstack/react-router";
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
import { cn } from "@/lib/utils";

/*
 * One save model for typed fields (settings redesign spec §4): every form on a page
 * registers itself as a draft; the floating pill appears on the first change and its
 * Save button saves every dirty draft on the page. Leaving the page with drafts asks
 * "Discard changes?". Switches never go through here — they save on their own.
 */

export type SettingsDraft = {
  dirty: boolean;
  /** False while a field is invalid; the bar's Save stays disabled. */
  valid: boolean;
  saving: boolean;
  /** Saves this draft; rejects or throws when the API refuses (the bar stays up). */
  save: () => Promise<unknown> | unknown;
  discard: () => void;
};

type DraftRecord = {
  dirty: boolean;
  valid: boolean;
  saving: boolean;
  ref: MutableRefObject<SettingsDraft>;
};

type DraftsContextValue = {
  update: (id: string, record: DraftRecord) => void;
  remove: (id: string) => void;
};

const DraftsContext = createContext<DraftsContextValue | null>(null);
const DraftsStateContext = createContext<Map<string, DraftRecord>>(new Map());

export function SettingsDraftsProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Map<string, DraftRecord>>(() => new Map());

  const update = useCallback((id: string, record: DraftRecord) => {
    setDrafts((prev) => {
      const existing = prev.get(id);
      if (
        existing &&
        existing.dirty === record.dirty &&
        existing.valid === record.valid &&
        existing.saving === record.saving &&
        existing.ref === record.ref
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(id, record);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setDrafts((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ update, remove }), [update, remove]);

  return (
    <DraftsContext.Provider value={value}>
      <DraftsStateContext.Provider value={drafts}>{children}</DraftsStateContext.Provider>
    </DraftsContext.Provider>
  );
}

/**
 * Register a form with the page's save bar. Returns `managed: true` inside Settings,
 * where the form should hide its own Save button; outside (the client account page,
 * the calendar dialog) it is false and the form keeps its button.
 */
export function useSettingsDraft(draft: SettingsDraft): { managed: boolean } {
  const ctx = useContext(DraftsContext);
  const id = useId();
  const ref = useRef(draft);
  ref.current = draft;

  useEffect(() => {
    if (!ctx) return;
    ctx.update(id, { dirty: draft.dirty, valid: draft.valid, saving: draft.saving, ref });
  }, [ctx, id, draft.dirty, draft.valid, draft.saving]);

  useEffect(() => {
    if (!ctx) return;
    return () => ctx.remove(id);
  }, [ctx, id]);

  return { managed: ctx !== null };
}

/** True while any registered draft on the page has unsaved changes. */
export function useHasUnsavedDrafts(): boolean {
  const drafts = useContext(DraftsStateContext);
  for (const d of drafts.values()) if (d.dirty) return true;
  return false;
}

/** The floating pill plus the "Discard changes?" guard. Mount once in the Settings layout. */
export function SaveBar({ className }: { className?: string }) {
  const drafts = useContext(DraftsStateContext);
  const dirty = [...drafts.values()].filter((d) => d.dirty);
  const anyDirty = dirty.length > 0;
  const anyInvalid = dirty.some((d) => !d.valid);
  const anySaving = dirty.some((d) => d.saving);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(anyDirty);
  dirtyRef.current = anyDirty;

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirtyRef.current && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  const saveAll = async () => {
    setBusy(true);
    try {
      for (const d of dirty) await d.ref.current.save();
    } catch {
      // The form shows its own error (field message or toast); the bar stays up.
    } finally {
      setBusy(false);
    }
  };

  const discardAll = () => {
    for (const d of dirty) d.ref.current.discard();
  };

  return (
    <>
      <div
        aria-hidden={!anyDirty}
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-40 flex justify-center px-4 transition-all duration-200",
          anyDirty ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          className,
        )}
      >
        <div
          role="region"
          aria-label="Unsaved changes"
          className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card py-1.5 pr-1.5 pl-4 shadow-[0_8px_30px_rgba(16,23,42,0.18)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
        >
          <span className="text-sm font-medium">Unsaved changes</span>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={!anyDirty || busy || anySaving}
            onClick={discardAll}
          >
            Discard
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            disabled={!anyDirty || anyInvalid || busy || anySaving}
            onClick={() => void saveAll()}
          >
            {busy || anySaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this page. Leaving now loses them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                discardAll();
                blocker.proceed?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
