"use client";

import { useViewport } from "@xyflow/react";
import type { LaneData, LaneOrientation } from "@/lib/types";
import { LANE_WIDTH } from "@/lib/types";

const LANE_COLORS = [
  "rgba(15, 23, 42, 0.03)",
  "rgba(15, 23, 42, 0.06)",
];

const LANE_START = -5000;
const LANE_SPAN = 12000;
const HEADER_THICKNESS = 32;

export default function LaneBackground({
  lanes,
  orientation,
}: {
  lanes: LaneData[];
  orientation: LaneOrientation;
}) {
  const { x, y, zoom } = useViewport();
  const isVertical = orientation === "vertical";

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {lanes.map((lane, i) =>
          isVertical ? (
            <div
              key={lane.id}
              style={{
                position: "absolute",
                left: i * LANE_WIDTH,
                top: LANE_START,
                width: LANE_WIDTH,
                height: LANE_SPAN,
                background: LANE_COLORS[i % LANE_COLORS.length],
                borderRight: "1px dashed #d4d4d8",
              }}
            />
          ) : (
            <div
              key={lane.id}
              style={{
                position: "absolute",
                top: i * LANE_WIDTH,
                left: LANE_START,
                height: LANE_WIDTH,
                width: LANE_SPAN,
                background: LANE_COLORS[i % LANE_COLORS.length],
                borderBottom: "1px dashed #d4d4d8",
              }}
            />
          )
        )}
      </div>

      {lanes.map((lane, i) =>
        isVertical ? (
          <div
            key={lane.id}
            className="absolute top-0 flex items-center justify-center overflow-hidden border-b border-r border-zinc-300 bg-white/90 text-xs font-semibold text-zinc-600 backdrop-blur-sm"
            style={{
              left: i * LANE_WIDTH * zoom + x,
              width: LANE_WIDTH * zoom,
              height: HEADER_THICKNESS,
            }}
          >
            <span className="truncate px-1">{lane.name}</span>
          </div>
        ) : (
          <div
            key={lane.id}
            className="absolute left-0 overflow-hidden border-b border-r border-zinc-300 bg-white/90 text-xs font-semibold text-zinc-600 backdrop-blur-sm"
            style={{
              top: i * LANE_WIDTH * zoom + y,
              height: LANE_WIDTH * zoom,
              width: HEADER_THICKNESS,
            }}
          >
            {/* Absolutely positioned and rotated, rather than laid out with
                writing-mode: as a flex item the vertical line box collapsed
                to ~9px and the characters printed on top of each other (on
                screen and in exports alike). Taking the text out of flow
                leaves it free to size itself. */}
            <span
              className="absolute whitespace-nowrap"
              style={{
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%) rotate(-90deg)",
              }}
            >
              {lane.name}
            </span>
          </div>
        )
      )}
    </div>
  );
}
