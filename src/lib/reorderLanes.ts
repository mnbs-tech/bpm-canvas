import { laneIndexOfNode } from "./autoLayout";
import { LANE_WIDTH } from "./types";
import type { LaneData, LaneOrientation, WorkflowNode } from "./types";

export interface LaneMove {
  /** The reordered lane list. */
  lanes: LaneData[];
  /**
   * Carries nodes to wherever their own lane ended up. Apply this to every
   * flow in the document (root and all subflows), not just the visible one -
   * the lane list is document-wide.
   */
  shiftNodes: (nodes: WorkflowNode[]) => WorkflowNode[];
}

/**
 * Moves the lane at `from` to position `to`, and produces the node shift that
 * has to go with it.
 *
 * A node's lane is *positional*: it belongs to whichever band its centre sits
 * in (SPEC §3.1), and nothing on the node records which lane that is. So
 * reordering the list on its own would leave every node exactly where it was
 * and silently hand it to its new neighbour - the same accident SPEC §3.1
 * records for lane deletion, but applied to the whole diagram at once. Moving
 * the contents along is what makes reordering mean "move this lane" rather
 * than "relabel every lane".
 *
 * Returns `null` for a move that changes nothing, so callers can skip the
 * state update (and the undo step) entirely.
 */
export function moveLane(
  lanes: LaneData[],
  from: number,
  to: number,
  orientation: LaneOrientation
): LaneMove | null {
  if (from === to) return null;
  if (from < 0 || to < 0 || from >= lanes.length || to >= lanes.length) return null;

  const reordered = [...lanes];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);

  // Old band index -> new band index, for every lane. Only the lanes between
  // `from` and `to` move at all, but building the whole map keeps the shift
  // below a single lookup rather than a range comparison.
  const destination = new Map<number, number>();
  lanes.forEach((lane, oldIndex) => {
    destination.set(
      oldIndex,
      reordered.findIndex((l) => l.id === lane.id)
    );
  });

  const laneAxis: "x" | "y" = orientation === "vertical" ? "x" : "y";

  const shiftNodes = (nodes: WorkflowNode[]): WorkflowNode[] =>
    nodes.map((node) => {
      // Nodes outside the bands (a memo parked above the first lane, say) are
      // rounded into the nearest lane by laneIndexOfNode and travel with it,
      // which keeps them next to whatever they annotate.
      const oldIndex = laneIndexOfNode(node, lanes.length, orientation);
      const delta = ((destination.get(oldIndex) ?? oldIndex) - oldIndex) * LANE_WIDTH;
      if (delta === 0) return node;
      return {
        ...node,
        position:
          laneAxis === "x"
            ? { x: node.position.x + delta, y: node.position.y }
            : { x: node.position.x, y: node.position.y + delta },
      };
    });

  return { lanes: reordered, shiftNodes };
}
