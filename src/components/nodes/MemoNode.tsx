"use client";

import { type NodeProps } from "@xyflow/react";
import EditableLabel from "./EditableLabel";
import type { WorkflowNode } from "@/lib/types";

export default function MemoNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  return (
    <div
      className={`min-h-[80px] w-[160px] rounded-sm border bg-yellow-100 p-3 text-sm text-yellow-900 shadow-md ${
        selected ? "border-yellow-600 ring-2 ring-yellow-300" : "border-yellow-300"
      }`}
      style={{ transform: "rotate(-1deg)" }}
    >
      <EditableLabel
        nodeId={id}
        value={data.label}
        multiline
        className="whitespace-pre-wrap break-words"
        inputClassName="w-full h-full resize-none"
      />
    </div>
  );
}
