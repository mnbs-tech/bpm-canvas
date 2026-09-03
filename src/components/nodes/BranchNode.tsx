"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import DetailBadge from "./DetailBadge";
import { rotatedPosition, useOrientation } from "@/lib/orientation";
import type { WorkflowNode } from "@/lib/types";

export default function BranchNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const orientation = useOrientation();
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <DetailBadge data={data} />
      <div
        className={`absolute inset-0 rotate-45 rounded-md border-2 bg-violet-100 ${
          selected ? "border-violet-700 ring-2 ring-violet-300" : "border-violet-500"
        }`}
      />
      <Handle type="target" position={rotatedPosition(Position.Top, orientation)} className="!bg-violet-600" />
      <div className="relative z-10 px-4 text-center text-xs font-medium text-violet-900">
        <EditableLabel nodeId={id} value={data.label} />
      </div>
      <Handle
        type="source"
        position={rotatedPosition(Position.Left, orientation)}
        id="no"
        className="!bg-violet-600"
      />
      <Handle
        type="source"
        position={rotatedPosition(Position.Right, orientation)}
        id="yes"
        className="!bg-violet-600"
      />
      <Handle
        type="source"
        position={rotatedPosition(Position.Bottom, orientation)}
        id="default"
        className="!bg-violet-600"
      />
    </div>
  );
}
