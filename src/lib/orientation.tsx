"use client";

import { createContext, useContext } from "react";
import { Position } from "@xyflow/react";
import type { LaneOrientation } from "./types";

export const OrientationContext = createContext<LaneOrientation>("horizontal");

export function useOrientation() {
  return useContext(OrientationContext);
}

/**
 * Node handles are authored for "vertical" orientation (flow top→bottom).
 * In "horizontal" orientation the whole diagram is rotated 90° counter-
 * clockwise, so every handle's side rotates with it: Top→Left, Left→Bottom,
 * Bottom→Right, Right→Top.
 */
export function rotatedPosition(base: Position, orientation: LaneOrientation): Position {
  if (orientation === "vertical") return base;
  switch (base) {
    case Position.Top:
      return Position.Left;
    case Position.Left:
      return Position.Bottom;
    case Position.Bottom:
      return Position.Right;
    case Position.Right:
      return Position.Top;
    default:
      return base;
  }
}
