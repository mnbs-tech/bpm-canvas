"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import DetailBadge from "./DetailBadge";
import { rotatedPosition, useOrientation } from "@/lib/orientation";
import type { WorkflowNode } from "@/lib/types";

export default function WaitNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const orientation = useOrientation();
  return (
    <div
      className={`flex min-w-[140px] items-center gap-2 rounded-lg border-2 border-dashed bg-orange-100 px-4 py-3 text-center text-sm font-medium text-orange-900 shadow-sm ${
        selected ? "border-orange-700 ring-2 ring-orange-300" : "border-orange-500"
      }`}
    >
      <DetailBadge data={data} />
      <Handle type="target" position={rotatedPosition(Position.Top, orientation)} className="!bg-orange-600" />
      <span aria-hidden className="text-orange-600">⏱</span>
      <EditableLabel nodeId={id} value={data.label} className="flex-1" />
      <Handle type="source" position={rotatedPosition(Position.Bottom, orientation)} className="!bg-orange-600" />
      <Handle type="target" position={rotatedPosition(Position.Left, orientation)} id="left" className="!bg-orange-600" />
      <Handle type="source" position={rotatedPosition(Position.Right, orientation)} id="right" className="!bg-orange-600" />
    </div>
  );
}
