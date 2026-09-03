"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import DetailBadge from "./DetailBadge";
import { rotatedPosition, useOrientation } from "@/lib/orientation";
import type { WorkflowNode } from "@/lib/types";

export default function EndNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const orientation = useOrientation();
  return (
    <div
      className={`flex h-16 w-16 items-center justify-center rounded-full border-2 bg-rose-500 text-center text-xs font-semibold text-white shadow-sm ${
        selected ? "border-rose-800 ring-2 ring-rose-300" : "border-rose-700"
      }`}
    >
      <DetailBadge data={data} />
      <Handle type="target" position={rotatedPosition(Position.Top, orientation)} className="!bg-rose-700" />
      <EditableLabel nodeId={id} value={data.label} className="px-1" />
    </div>
  );
}
