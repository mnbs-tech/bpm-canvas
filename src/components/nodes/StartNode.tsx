"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import DetailBadge from "./DetailBadge";
import { rotatedPosition, useOrientation } from "@/lib/orientation";
import type { WorkflowNode } from "@/lib/types";

export default function StartNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const orientation = useOrientation();
  return (
    <div
      className={`flex h-16 w-16 items-center justify-center rounded-full border-2 bg-emerald-500 text-center text-xs font-semibold text-white shadow-sm ${
        selected ? "border-emerald-800 ring-2 ring-emerald-300" : "border-emerald-700"
      }`}
    >
      <DetailBadge data={data} />
      <EditableLabel nodeId={id} value={data.label} className="px-1" />
      <Handle type="source" position={rotatedPosition(Position.Bottom, orientation)} className="!bg-emerald-700" />
    </div>
  );
}
