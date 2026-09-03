"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import DetailBadge from "./DetailBadge";
import { rotatedPosition, useOrientation } from "@/lib/orientation";
import type { WorkflowNode } from "@/lib/types";

export default function DocumentNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const orientation = useOrientation();
  return (
    <div className="relative min-w-[140px]">
      <DetailBadge data={data} />
      <Handle type="target" position={rotatedPosition(Position.Top, orientation)} className="!bg-slate-600" />
      <div
        className={`flex min-h-[70px] items-center justify-center gap-2 rounded-md border-2 bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-800 shadow-sm ${
          selected ? "border-slate-700 ring-2 ring-slate-300" : "border-slate-400"
        }`}
      >
        <span aria-hidden className="text-slate-600">📄</span>
        <EditableLabel nodeId={id} value={data.label} />
      </div>
      <Handle type="source" position={rotatedPosition(Position.Bottom, orientation)} className="!bg-slate-600" />
      <Handle type="target" position={rotatedPosition(Position.Left, orientation)} id="left" className="!bg-slate-600" />
      <Handle type="source" position={rotatedPosition(Position.Right, orientation)} id="right" className="!bg-slate-600" />
    </div>
  );
}
