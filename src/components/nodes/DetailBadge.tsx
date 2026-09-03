"use client";

import { hasNodeDetails } from "@/lib/types";
import type { WorkflowNodeData } from "@/lib/types";

/**
 * Marks a node whose details panel has been filled in. Deliberately just a
 * dot: the attributes are for reading in the panel (and in the saved JSON),
 * not for crowding the diagram.
 *
 * Positioned against the React Flow node wrapper, which is absolutely
 * positioned, so it sits at the node's corner whether or not the node's own
 * root element establishes a containing block.
 */
export default function DetailBadge({ data }: { data: WorkflowNodeData }) {
  if (!hasNodeDetails(data)) return null;
  return (
    <span
      className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full border border-white bg-zinc-500"
      title="詳細が入力されています"
    />
  );
}
