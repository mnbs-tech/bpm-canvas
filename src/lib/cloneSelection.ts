import type { Edge } from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";
import type { FlowGraph, WorkflowNode } from "./types";

export interface Selection {
  nodes: WorkflowNode[];
  /** Only the edges whose *both* ends are in `nodes` - a dangling half-edge
   * would point at something the copy doesn't contain. */
  edges: Edge[];
  /** The subflow graphs the copied nodes reach, keyed by subflowId. Snapshotted
   * with the copy so editing (or deleting) the original afterwards doesn't
   * change what gets pasted. */
  subflows: Record<string, FlowGraph>;
}

/** Every subflow id reachable from `nodes`, following nested subflows. Guards
 * against a self-referencing document (SPEC §3.6 leaves that undefined) by
 * never visiting an id twice. */
function reachableSubflowIds(
  nodes: WorkflowNode[],
  pool: Record<string, FlowGraph>,
  seen = new Set<string>()
): Set<string> {
  for (const node of nodes) {
    const id = node.data?.subflowId;
    if (typeof id !== "string" || seen.has(id)) continue;
    const graph = pool[id];
    if (!graph) continue;
    seen.add(id);
    reachableSubflowIds(graph.nodes, pool, seen);
  }
  return seen;
}

/** Takes the selected nodes plus the whole subflow subtree under them, as a
 * standalone snapshot that stays valid however the document changes later. */
export function captureSelection(
  nodes: WorkflowNode[],
  edges: Edge[],
  subflows: Record<string, FlowGraph>
): Selection | null {
  const selected = nodes.filter((n) => n.selected);
  if (selected.length === 0) return null;
  const ids = new Set(selected.map((n) => n.id));
  const captured: Record<string, FlowGraph> = {};
  for (const id of reachableSubflowIds(selected, subflows)) captured[id] = subflows[id];
  return {
    nodes: selected.map((n) => ({ ...n, data: { ...n.data } })),
    edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    subflows: captured,
  };
}

/** A subflow graph copied wholesale: fresh node/edge ids so it can live next
 * to the original, and any subflow it contains cloned in turn. */
function cloneGraph(
  graph: FlowGraph,
  source: Record<string, FlowGraph>,
  into: Record<string, FlowGraph>
): FlowGraph {
  const idMap = new Map(graph.nodes.map((n) => [n.id, uuidv4()]));
  return {
    nodes: graph.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id) as string,
      data: cloneData(n, source, into),
    })),
    edges: graph.edges.map((e) => ({
      ...e,
      id: uuidv4(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    })),
  };
}

/** Copies a node's data, giving a subflow node a private copy of its nested
 * flow. Two nodes sharing one subflowId is undefined behaviour (SPEC §3.6),
 * and it would also mean editing the copy edits the original. */
function cloneData(
  node: WorkflowNode,
  source: Record<string, FlowGraph>,
  into: Record<string, FlowGraph>
): WorkflowNode["data"] {
  const subflowId = node.data?.subflowId;
  if (typeof subflowId !== "string") return { ...node.data };
  const graph = source[subflowId];
  if (!graph) return { ...node.data };
  const newId = uuidv4();
  into[newId] = cloneGraph(graph, source, into);
  return { ...node.data, subflowId: newId };
}

export interface ClonedSelection {
  nodes: WorkflowNode[];
  edges: Edge[];
  /** New subflow graphs to merge into the document's `subflows` map. */
  subflows: Record<string, FlowGraph>;
}

/**
 * Materialises a captured selection as new elements, shifted by `offset` so
 * the copy doesn't land exactly on top of what it came from. Everything comes
 * back selected, which is what makes a paste immediately draggable - and what
 * lets a second Ctrl+D duplicate the duplicate.
 */
export function cloneSelection(selection: Selection, offset: { x: number; y: number }): ClonedSelection {
  const idMap = new Map(selection.nodes.map((n) => [n.id, uuidv4()]));
  const subflows: Record<string, FlowGraph> = {};
  const nodes = selection.nodes.map((n) => ({
    ...n,
    id: idMap.get(n.id) as string,
    position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
    data: cloneData(n, selection.subflows, subflows),
    selected: true,
    dragging: false,
  }));
  const edges = selection.edges.map((e) => ({
    ...e,
    id: uuidv4(),
    source: idMap.get(e.source) as string,
    target: idMap.get(e.target) as string,
    selected: false,
  }));
  return { nodes, edges, subflows };
}
