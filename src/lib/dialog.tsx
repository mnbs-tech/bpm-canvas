"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ConfirmOptions {
  title: string;
  /** Optional second line: the consequence, not a restatement of the title. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Draws the confirm button in red, for anything that destroys work. */
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface DialogApi {
  /** Resolves true when confirmed, false when cancelled or dismissed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves the entered text, or null when cancelled - same contract as
   * `window.prompt`, so callers keep their `=== null` guard. */
  prompt: (options: PromptOptions) => Promise<string | null>;
}

type Pending =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

// Resolving to "cancelled" is the safe default outside the provider: nothing
// destructive proceeds just because the host forgot to mount it.
const DialogContext = createContext<DialogApi>({
  confirm: async () => false,
  prompt: async () => null,
});

export function useDialog(): DialogApi {
  return useContext(DialogContext);
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks whether the mousedown that preceded a backdrop "click" also
  // started on the backdrop. A click's target is the nearest common ancestor
  // of its mousedown/mouseup targets, not necessarily where either occurred -
  // so dragging a text selection inside the input and releasing past the
  // dialog's edge fires a click whose target is this backdrop, closing the
  // dialog mid-edit unless we also require the press to have started here.
  const backdropMouseDownRef = useRef(false);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ kind: "confirm", options, resolve })),
    []
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setDraft(options.defaultValue ?? "");
        setPending({ kind: "prompt", options, resolve });
      }),
    []
  );

  const settle = useCallback(
    (accepted: boolean) => {
      if (!pending) return;
      if (pending.kind === "confirm") pending.resolve(accepted);
      else pending.resolve(accepted ? draft : null);
      setPending(null);
    },
    [pending, draft]
  );

  useEffect(() => {
    if (!pending) return;
    if (pending.kind === "prompt") {
      // Not select(): a suggested name is usually edited in place (fix a
      // word, add a suffix), and select-all makes the first keystroke of any
      // such edit wipe the whole value instead.
      const length = inputRef.current?.value.length ?? 0;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(length, length);
    }
    // Escape cancels from anywhere, including with the input focused. Captured
    // so the editor's own Escape/undo shortcuts don't act on the canvas behind
    // a dialog the user is still answering.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      settle(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [pending, settle]);

  const api = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40"
          onMouseDown={(e) => {
            backdropMouseDownRef.current = e.target === e.currentTarget;
          }}
          onClick={() => {
            if (backdropMouseDownRef.current) settle(false);
          }}
        >
          <form
            className="w-[min(34rem,calc(100vw-2rem))] rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              settle(true);
            }}
          >
            <h2 className="text-sm font-semibold text-zinc-800">{pending.options.title}</h2>
            {pending.options.message && (
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-zinc-500">
                {pending.options.message}
              </p>
            )}
            {pending.kind === "prompt" && (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={pending.options.placeholder}
                className="mt-3 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                {(pending.kind === "confirm" && pending.options.cancelLabel) || "キャンセル"}
              </button>
              <button
                type="submit"
                className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
                  pending.kind === "confirm" && pending.options.danger
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {pending.options.confirmLabel ?? "OK"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DialogContext.Provider>
  );
}
