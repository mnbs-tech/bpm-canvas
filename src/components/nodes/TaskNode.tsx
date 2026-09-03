"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import DetailBadge from "./DetailBadge";
import { rotatedPosition, useOrientation } from "@/lib/orientation";
import type { WorkflowNode } from "@/lib/types";

export default function TaskNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const orientation = useOrientation();
  return (
    <div
      className={`min-w-[140px] rounded-md border-2 bg-sky-100 px-4 py-3 text-center text-sm font-medium text-sky-900 shadow-sm ${
        selected ? "border-sky-700 ring-2 ring-sky-300" : "border-sky-500"
      }`}
    >
      <DetailBadge data={data} />
      <Handle type="target" position={rotatedPosition(Position.Top, orientation)} className="!bg-sky-600" />
      <EditableLabel nodeId={id} value={data.label} />
      <Handle type="source" position={rotatedPosition(Position.Bottom, orientation)} className="!bg-sky-600" />
      <Handle type="target" position={rotatedPosition(Position.Left, orientation)} id="left" className="!bg-sky-600" />
      <Handle type="source" position={rotatedPosition(Position.Right, orientation)} id="right" className="!bg-sky-600" />
    </div>
  );
}
