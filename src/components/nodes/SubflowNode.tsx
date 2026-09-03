"use client";

import type { MouseEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import DetailBadge from "./DetailBadge";
import { rotatedPosition, useOrientation } from "@/lib/orientation";
import { useSubflowNav } from "@/lib/subflowNav";
import type { WorkflowNode } from "@/lib/types";

export default function SubflowNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const orientation = useOrientation();
  const nav = useSubflowNav();

  const handleOpen = (e: MouseEvent) => {
    e.stopPropagation();
    if (data.subflowId) nav.openSubflow(data.subflowId, data.label);
  };

  return (
    <div
      className={`relative min-w-[150px] rounded-lg border-2 bg-violet-100 p-1 text-center text-sm font-medium text-violet-900 shadow-sm ${
        selected ? "border-violet-700 ring-2 ring-violet-300" : "border-violet-500"
      }`}
    >
      <DetailBadge data={data} />
      <Handle type="target" position={rotatedPosition(Position.Top, orientation)} className="!bg-violet-600" />
      {/* Inner border, BPMN sub-process convention of a "boxed within a box". */}
      <div className="rounded-md border border-violet-300 px-3 py-3">
        <EditableLabel nodeId={id} value={data.label} />
        <button
          type="button"
          onClick={handleOpen}
          className="subflow-open nodrag nopan mt-2 w-full rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-500"
        >
          開く ▸
        </button>
      </div>
      {/* "+" marker, BPMN sub-process collapse indicator. */}
      <div className="absolute -bottom-2 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-sm border border-violet-500 bg-white text-[10px] font-bold text-violet-600">
        +
      </div>
      <Handle type="source" position={rotatedPosition(Position.Bottom, orientation)} className="!bg-violet-600" />
      <Handle type="target" position={rotatedPosition(Position.Left, orientation)} id="left" className="!bg-violet-600" />
      <Handle type="source" position={rotatedPosition(Position.Right, orientation)} id="right" className="!bg-violet-600" />
    </div>
  );
}
