"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  /** Destructive entry - drawn in red. */
  danger?: boolean;
}

interface FlowContextMenuProps {
  /** Where the menu opens, in pixels within its offset parent (the canvas
   * wrapper), i.e. clientX/Y minus that element's bounding rect. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * The right-click menu over the canvas. Deliberately dumb: the caller decides
 * what the entries are for the thing that was clicked (see
 * `WorkflowEditor`'s `menuItems`), this only places it and dismisses it.
 */
export default function FlowContextMenu({ x, y, items, onClose }: FlowContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the menu inside the canvas when it opens near the right/bottom edge.
  // Written straight to the node's style rather than held in state: the
  // correction depends on the rendered size, so it can only be computed after
  // the first paint-blocking layout, and re-rendering for it would be a
  // set-state-in-effect round trip for something no other code reads.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    el.style.left = `${Math.max(0, Math.min(x, parent.clientWidth - el.offsetWidth - 4))}px`;
    el.style.top = `${Math.max(0, Math.min(y, parent.clientHeight - el.offsetHeight - 4))}px`;
  }, [x, y]);

  useEffect(() => {
    // Registered after the click that opened the menu has already been
    // dispatched, so it never closes itself on the way up.
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute z-30 min-w-[180px] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={`block w-full px-3 py-1.5 text-left hover:bg-slate-100 ${
            item.danger ? "text-red-700" : "text-slate-700"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
