"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  /** Shows a transient message. Non-blocking by design: nothing waits for it,
   * and nothing depends on it having been read. Anything the user must act on
   * belongs in a dialog (`useDialog`), not here. */
  show: (message: string, kind?: ToastKind) => void;
}

/** Long enough to read a failure message and its cause, short enough that a
 * success note doesn't linger over the canvas. */
const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  success: 3500,
  info: 4000,
  error: 9000,
};

const STYLES: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-zinc-200 bg-white text-zinc-800",
};

const ICONS: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

// A no-op default so a component rendered outside the provider (a test
// harness, a future page) doesn't crash on a notification.
const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS[kind]);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Bottom centre: the bottom-right corner is taken by the minimap and
          the AI chat panel's send button, and a toast there would sit on top
          of them. Above the library modal (z-50) so a failure raised from
          inside it is not hidden behind it. */}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-lg ${STYLES[t.kind]}`}
          >
            <span aria-hidden className="mt-0.5 font-bold">
              {ICONS[t.kind]}
            </span>
            <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="-mr-1 px-1 text-current opacity-50 hover:opacity-100"
              title="閉じる"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
