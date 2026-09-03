"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import DetailBadge from "./DetailBadge";
import { rotatedPosition, useOrientation } from "@/lib/orientation";
import type { WorkflowNode } from "@/lib/types";

const WIDTH = 140;
const HEIGHT = 90;
const RX = WIDTH / 2;
const RY = 12;

// html-to-image (used for PDF export / clipboard copy) doesn't reliably
// resolve Tailwind fill-*/stroke-* classes on raw SVG elements - it falls
// back to the SVG spec defaults (fill: black, stroke: none), which is why
// this shape used to invert to solid black with no outline in exports.
// Inline styles with resolved hex values sidestep that entirely.
const AMBER = {
  fill: "#fef3c7",
  fillSelected: "#fde68a",
  stroke: "#f59e0b",
  strokeSelected: "#b45309",
};

export default function DatabaseNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const orientation = useOrientation();
  const isVertical = orientation === "vertical";
  const shapeStyle = {
    fill: selected ? AMBER.fillSelected : AMBER.fill,
    stroke: selected ? AMBER.strokeSelected : AMBER.stroke,
  };
  return (
    <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
      <DetailBadge data={data} />
      <Handle
        type="target"
        position={rotatedPosition(Position.Top, orientation)}
        className="!bg-amber-600"
        style={isVertical ? { top: RY } : undefined}
      />
      <svg width={WIDTH} height={HEIGHT} className="absolute inset-0">
        <path
          d={`M 0 ${RY}
              L 0 ${HEIGHT - RY}
              A ${RX} ${RY} 0 0 0 ${WIDTH} ${HEIGHT - RY}
              L ${WIDTH} ${RY}
              A ${RX} ${RY} 0 0 1 0 ${RY}
              Z`}
          style={shapeStyle}
          strokeWidth={2}
        />
        <ellipse
          cx={RX}
          cy={RY}
          rx={RX - 1}
          ry={RY}
          style={shapeStyle}
          strokeWidth={2}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pt-2 text-center text-sm font-medium text-amber-900">
        <EditableLabel nodeId={id} value={data.label} className="px-2" />
      </div>
      <Handle
        type="source"
        position={rotatedPosition(Position.Bottom, orientation)}
        className="!bg-amber-600"
        style={isVertical ? { bottom: RY } : undefined}
      />
    </div>
  );
}
