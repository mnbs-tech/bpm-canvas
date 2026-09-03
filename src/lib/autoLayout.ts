import type { Edge } from "@xyflow/react";
import { LANE_WIDTH } from "./types";
import type { LaneData, LaneOrientation, WorkflowNode } from "./types";

export const MARGIN = 80;
/** Distance between consecutive steps along the process axis. Exported so
 * that code inserting a node into an existing diagram (applyProposal.ts) puts
 * it the same distance from its neighbours that 自動整列 would. */
export const RANK_GAP = 220;
/** Distance between nodes that share a lane and a rank, along the lane axis. */
export const NODE_GAP = 110;

// Approximate on-screen footprint per node kind (see src/components/nodes/).
// node.position is the node's top-left corner, not its center, so centering
// a node within its lane requires knowing roughly how tall/wide it is.
// Pixel-perfect accuracy isn't the goal - just close enough that nodes read
// as centered in their lane band instead of hugging its top/left edge.
const NODE_SIZE: Record<string, { width: number; height: number }> = {
  start: { width: 64, height: 64 },
  end: { width: 64, height: 64 },
  task: { width: 140, height: 52 },
  approval: { width: 150, height: 52 },
  document: { width: 150, height: 74 },
  notification: { width: 150, height: 52 },
  wait: { width: 150, height: 52 },
  database: { width: 140, height: 90 },
  branch: { width: 112, height: 112 },
  subflow: { width: 150, height: 120 },
};
const DEFAULT_SIZE = { width: 140, height: 60 };

export function nodeFootprint(kind: string | undefined): { width: number; height: number } {
  return (kind && NODE_SIZE[kind]) || DEFAULT_SIZE;
}

/**
 * Which lane a node currently sits in, by its *center* rather than its
 * top-left corner - that is what the user sees as "in this lane". Shared with
 * applyProposal.ts so an inserted node inherits its neighbour's lane the same
 * way 自動整列 reads it.
 */
export function laneIndexOfNode(
  node: WorkflowNode,
  laneCount: number,
  orientation: LaneOrientation
): number {
  const laneAxis: "x" | "y" = orientation === "vertical" ? "x" : "y";
  const size = nodeFootprint(node.type);
  const laneDim = laneAxis === "x" ? size.width : size.height;
  const center = node.position[laneAxis] + laneDim / 2;
  return Math.min(Math.max(Math.floor(center / LANE_WIDTH), 0), Math.max(laneCount, 1) - 1);
}

/**
 * Re-flows nodes along the process axis while keeping each node's current
 * lane. Rank = longest-path distance from a source node (Kahn's topological
 * sort with relaxation); any node left over from a cycle is appended at the
 * end instead of looping forever, so a bad graph degrades gracefully rather
 * than hanging or throwing.
 */
export function autoLayoutNodes(
  nodes: WorkflowNode[],
  edges: Edge[],
  lanes: LaneData[],
  orientation: LaneOrientation
): WorkflowNode[] {
  const laneAxis: "x" | "y" = orientation === "vertical" ? "x" : "y";
  const flowAxis: "x" | "y" = orientation === "vertical" ? "y" : "x";

  const layoutable = nodes.filter((n) => n.type !== "memo");
  const fixed = nodes.filter((n) => n.type === "memo");
  const layoutIds = new Set(layoutable.map((n) => n.id));

  const rank = computeRanks(layoutable, edges, layoutIds);

  const laneCount = Math.max(lanes.length, 1);
  const laneIndexOf = (n: WorkflowNode) => laneIndexOfNode(n, laneCount, orientation);

  const buckets = new Map<string, WorkflowNode[]>();
  for (const n of layoutable) {
    const key = `${laneIndexOf(n)}:${rank.get(n.id) ?? 0}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(n);
    else buckets.set(key, [n]);
  }

  const positioned = new Map<string, { x: number; y: number }>();
  for (const [key, group] of buckets) {
    const [laneIndexStr] = key.split(":");
    const laneIndex = Number(laneIndexStr);
    const groupRank = rank.get(group[0].id) ?? 0;
    const laneCenter = laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
    const flowCenter = MARGIN + groupRank * RANK_GAP;
    group.forEach((n, i) => {
      const size = nodeFootprint(n.type);
      const laneDim = laneAxis === "x" ? size.width : size.height;
      const flowDim = flowAxis === "x" ? size.width : size.height;
      // laneCenterTarget/flowCenter are where the node's *center* should
      // land; subtract half its own extent to get the top-left corner
      // node.position expects.
      const laneCenterTarget = laneCenter + (i - (group.length - 1) / 2) * NODE_GAP;
      const perp = laneCenterTarget - laneDim / 2;
      const flowPos = flowCenter - flowDim / 2;
      positioned.set(n.id, {
        x: flowAxis === "x" ? flowPos : perp,
        y: flowAxis === "y" ? flowPos : perp,
      });
    });
  }

  const laid = layoutable.map((n) => {
    const pos = positioned.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });

  return [...laid, ...fixed];
}

/** Exported alongside nodeFootprint/laneIndexOfNode for exportExcel.ts: the
 * companion node table there orders rows the same way 自動整列 orders columns. */
export function computeRanks(
  nodes: WorkflowNode[],
  edges: Edge[],
  layoutIds: Set<string>
): Map<string, number> {
  const relevant = edges.filter((e) => layoutIds.has(e.source) && layoutIds.has(e.target));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) {
    indegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const e of relevant) {
    adjacency.get(e.source)?.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) {
      rank.set(id, 0);
      queue.push(id);
    }
  }

  const remainingIndegree = new Map(indegree);
  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    processed += 1;
    const r = rank.get(id) ?? 0;
    for (const next of adjacency.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, r + 1));
      const remaining = (remainingIndegree.get(next) ?? 0) - 1;
      remainingIndegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  // Cycle fallback: anything never dequeued gets appended after the rest
  // rather than looping forever.
  if (processed < nodes.length) {
    const maxRank = Math.max(0, ...Array.from(rank.values()));
    let overflow = maxRank + 1;
    for (const n of nodes) {
      if (!rank.has(n.id)) {
        rank.set(n.id, overflow);
        overflow += 1;
      }
    }
  }

  return rank;
}
