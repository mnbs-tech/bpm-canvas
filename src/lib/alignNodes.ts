import type { WorkflowNode } from "./types";

export type AlignMode = "left" | "right" | "top" | "bottom" | "center-x" | "center-y";
export type DistributeMode = "horizontal" | "vertical";

/** Used only until React Flow has measured a node (`measured` is filled in
 * right after mount); alignment happens on nodes the user can see, so this is
 * a fallback, not the normal path. */
const FALLBACK_SIZE = { width: 140, height: 60 };

function sizeOf(node: WorkflowNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? FALLBACK_SIZE.width,
    height: node.measured?.height ?? FALLBACK_SIZE.height,
  };
}

/**
 * Aligns the selected nodes against the bounding box of the selection itself
 * (not the lane, not the canvas): "左揃え" puts every selected node at the
 * leftmost selected node's x, and so on. `node.position` is the top-left
 * corner, so the far edge and centre cases have to account for each node's
 * own footprint.
 *
 * Nodes that are not selected are returned untouched, so the result can be
 * handed straight back to setNodes.
 */
export function alignSelectedNodes(nodes: WorkflowNode[], mode: AlignMode): WorkflowNode[] {
  const selected = nodes.filter((n) => n.selected);
  if (selected.length < 2) return nodes;

  const left = Math.min(...selected.map((n) => n.position.x));
  const right = Math.max(...selected.map((n) => n.position.x + sizeOf(n).width));
  const top = Math.min(...selected.map((n) => n.position.y));
  const bottom = Math.max(...selected.map((n) => n.position.y + sizeOf(n).height));

  return nodes.map((n) => {
    if (!n.selected) return n;
    const { width, height } = sizeOf(n);
    const position = { ...n.position };
    switch (mode) {
      case "left":
        position.x = left;
        break;
      case "right":
        position.x = right - width;
        break;
      case "center-x":
        position.x = (left + right) / 2 - width / 2;
        break;
      case "top":
        position.y = top;
        break;
      case "bottom":
        position.y = bottom - height;
        break;
      case "center-y":
        position.y = (top + bottom) / 2 - height / 2;
        break;
    }
    return { ...n, position };
  });
}

/**
 * Spaces the selected nodes evenly between the two outermost ones, by centre
 * distance. The first and last stay put - they define the span - so repeating
 * it is idempotent. Needs at least three nodes to mean anything.
 */
export function distributeSelectedNodes(
  nodes: WorkflowNode[],
  mode: DistributeMode
): WorkflowNode[] {
  const selected = nodes.filter((n) => n.selected);
  if (selected.length < 3) return nodes;

  const centreOf = (n: WorkflowNode) =>
    mode === "horizontal"
      ? n.position.x + sizeOf(n).width / 2
      : n.position.y + sizeOf(n).height / 2;

  const ordered = [...selected].sort((a, b) => centreOf(a) - centreOf(b));
  const first = centreOf(ordered[0]);
  const last = centreOf(ordered[ordered.length - 1]);
  const step = (last - first) / (ordered.length - 1);

  const moved = new Map<string, { x: number; y: number }>();
  ordered.forEach((n, index) => {
    if (index === 0 || index === ordered.length - 1) return;
    const centre = first + step * index;
    moved.set(
      n.id,
      mode === "horizontal"
        ? { x: centre - sizeOf(n).width / 2, y: n.position.y }
        : { x: n.position.x, y: centre - sizeOf(n).height / 2 }
    );
  });

  return nodes.map((n) => {
    const position = moved.get(n.id);
    return position ? { ...n, position } : n;
  });
}
