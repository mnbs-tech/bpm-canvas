"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Gap kept between a dropdown and the window edge. */
const EDGE_MARGIN = 8;

/**
 * Keeps a dropdown inside the window.
 *
 * The toolbar wraps onto several rows on a narrow screen, which moves its
 * buttons to positions the CSS alignment was never chosen for: a `right-0`
 * menu hanging off a button that is now at the left edge extends past x=0 and
 * is simply not there to read (the ⚙️ menu on a phone), and a `left-0` one on
 * a button at the right edge runs off the other side. Nothing clips or
 * scrolls it back into view, so the menu reads as broken rather than
 * misplaced.
 *
 * So the anchor and the window are measured on open and the menu is shifted
 * back inside. `align` is the placement to try first - the one the layout
 * wants when there is room - and the clamp only takes over when there isn't.
 *
 * Returned refs: `anchorRef` on the `relative` wrapper (which is also the
 * menu's offset parent, so the computed shift is relative to it), `menuRef`
 * on the menu itself. Spread `style` onto the menu; until the first
 * measurement it carries no offset, leaving the element's own `left-0` /
 * `right-0` class in charge - and that measurement happens before paint, so
 * nothing is drawn in the wrong place first.
 */
export function useDropdownPlacement(open: boolean, align: "left" | "right") {
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ shift: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    // A closed menu keeps its last placement rather than clearing it: it is
    // unmounted, and the next open re-measures here before anything paints.
    if (!open) return;

    const place = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;

      const box = anchor.getBoundingClientRect();
      // Already capped by the maxWidth below, so a menu wider than the phone
      // measures as the phone's width rather than overflowing it.
      const width = menu.offsetWidth;
      const wanted = align === "right" ? box.right - width : box.left;
      const rightmost = window.innerWidth - width - EDGE_MARGIN;
      // max() last so that a menu too wide to fit anywhere still starts at the
      // left margin instead of off-screen.
      const left = Math.max(EDGE_MARGIN, Math.min(wanted, rightmost));

      setPlacement({
        shift: left - box.left,
        maxHeight: window.innerHeight - box.bottom - EDGE_MARGIN,
      });
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, align]);

  return {
    anchorRef,
    menuRef,
    style: {
      left: placement?.shift,
      right: placement ? "auto" : undefined,
      maxWidth: `calc(100vw - ${EDGE_MARGIN * 2}px)`,
      maxHeight: placement?.maxHeight,
      overflowY: "auto",
    } satisfies React.CSSProperties,
  };
}
