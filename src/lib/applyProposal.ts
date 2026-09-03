import type { Edge } from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";
import { laneIndexOfNode, nodeFootprint, MARGIN, NODE_GAP, RANK_GAP } from "./autoLayout";
import { subflowLabelMap } from "./validateWorkflow";
import { BRANCH_HANDLE_LABELS, EDGE_STYLE, LANE_WIDTH } from "./types";
import type {
  FlowGraph,
  LaneOrientation,
  WorkflowDocument,
  WorkflowNode,
} from "./types";
import type { NodeDetailPatch, WorkflowProposal } from "./proposalSchema";

/**
 * Applies an AI proposal (see proposalSchema.ts) to a document, purely: it
 * returns new documents and touches nothing on screen.
 *
 * Two documents come back, because the user has to see the change before
 * agreeing to it:
 * - `doc` is the result - what is saved if they accept.
 * - `preview` is the same thing with the removals *still in it*, and every
 *   touched element carrying a marker class, so the canvas can show additions
 *   in green and deletions in red. It is never saved.
 *
 * An operation that cannot be applied (an id that is in no flow, an edge with
 * no endpoint) is skipped and reported rather than failing the whole proposal:
 * the preview shows exactly what will happen either way, so dropping the one
 * bad line is more useful than throwing away nine good ones.
 */

/** Marker classes, also styled in globals.css. */
export const PROPOSAL_ADD_CLASS = "proposal-add";
export const PROPOSAL_UPDATE_CLASS = "proposal-update";
export const PROPOSAL_REMOVE_CLASS = "proposal-remove";

const ADDED_EDGE_STYLE = { stroke: "#059669", strokeWidth: 2 };
const REMOVED_EDGE_STYLE = { stroke: "#dc2626", strokeWidth: 2, strokeDasharray: "6 4" };

export type ProposalChange = "add" | "update" | "remove";

export interface ProposalEntry {
  /** Stable within one result; a React key. */
  id: string;
  change: ProposalChange;
  target: "node" | "edge";
  /** "root" or a subflow id - which flow it happens in. */
  flowId: string;
  /** That flow's name (the document's, or the subflow node's label). */
  flowLabel: string;
  text: string;
}

export interface ProposalResult {
  /** The AI's own description of the proposal, carried through for the banner. */
  summary: string;
  /** The document as it would be after applying. */
  doc: WorkflowDocument;
  /** The same document with removals kept and everything marked, for display. */
  preview: WorkflowDocument;
  entries: ProposalEntry[];
  /** Operations that could not be applied, in plain Japanese. */
  skipped: string[];
  counts: { added: number; updated: number; removed: number };
}

type FlowMap = Record<string, FlowGraph>;

/** The root flow and every subflow in one map, keyed the way a proposal's
 * `flowId` refers to them. Arrays are copied: nothing here mutates the input. */
function toFlowMap(doc: WorkflowDocument): FlowMap {
  const map: FlowMap = { root: { nodes: [...(doc.nodes ?? [])], edges: [...(doc.edges ?? [])] } };
  for (const [id, graph] of Object.entries(doc.subflows ?? {})) {
    map[id] = { nodes: [...(graph.nodes ?? [])], edges: [...(graph.edges ?? [])] };
  }
  return map;
}

function fromFlowMap(doc: WorkflowDocument, map: FlowMap): WorkflowDocument {
  const { root, ...subflows } = map;
  return {
    ...doc,
    nodes: root?.nodes ?? [],
    edges: root?.edges ?? [],
    subflows,
  };
}

/** Which flow holds this node: the one the operation named, then anywhere.
 * Models forget `flowId` on a document that has subflows, and an id is unique
 * across the whole document in practice, so searching is a better answer than
 * refusing the operation. */
function locateNode(flows: FlowMap, id: string, preferred: string): string | null {
  if (flows[preferred]?.nodes.some((n) => n.id === id)) return preferred;
  for (const [flowId, graph] of Object.entries(flows)) {
    if (graph.nodes.some((n) => n.id === id)) return flowId;
  }
  return null;
}

function locateEdge(flows: FlowMap, id: string, preferred: string): string | null {
  if (flows[preferred]?.edges.some((e) => e.id === id)) return preferred;
  for (const [flowId, graph] of Object.entries(flows)) {
    if (graph.edges.some((e) => e.id === id)) return flowId;
  }
  return null;
}

/** Empty means "not set" here exactly as it does in the details panel: the key
 * is dropped rather than stored as "". */
function applyDetails(data: WorkflowNode["data"], details: NodeDetailPatch | undefined) {
  if (!details) return data;
  const next = { ...data };
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue;
    if (value.trim() === "") delete next[key];
    else next[key] = value;
  }
  return next;
}

/** Every subflow reachable from these nodes, following nesting. Guards against
 * a self-referencing document by never visiting an id twice. */
function reachableSubflows(nodes: WorkflowNode[], flows: FlowMap, seen = new Set<string>()): Set<string> {
  for (const node of nodes) {
    const id = node.data?.subflowId;
    if (typeof id !== "string" || seen.has(id)) continue;
    const graph = flows[id];
    if (!graph) continue;
    seen.add(id);
    reachableSubflows(graph.nodes, flows, seen);
  }
  return seen;
}

export function applyProposal(doc: WorkflowDocument, proposal: WorkflowProposal): ProposalResult {
  const flows = toFlowMap(doc);
  const labels = subflowLabelMap(doc);
  const flowLabel = (id: string) =>
    id === "root" ? doc.name || "ルート" : labels.get(id) ?? "サブフロー";

  const skipped: string[] = [];
  /** Ids the model invented for new nodes -> the uuid actually used. */
  const idMap = new Map<string, string>();
  const addedNodeIds = new Set<string>();
  const addedEdgeIds = new Set<string>();
  const updatedNodeIds = new Set<string>();
  const removedNodes = new Map<string, WorkflowNode[]>();
  const removedEdges = new Map<string, Edge[]>();
  /** Subflow graphs whose owning node is being removed. Dropped from `doc`,
   * kept in `preview` so the red node can still be opened while deciding. */
  const removedSubflows: FlowMap = {};
  const additions: { flowId: string; nodeId: string; lane?: number }[] = [];

  const resolve = (id: string) => idMap.get(id) ?? id;
  const recordRemoved = <T,>(map: Map<string, T[]>, flowId: string, item: T) => {
    const list = map.get(flowId);
    if (list) list.push(item);
    else map.set(flowId, [item]);
  };

  // Pass 1: create the new nodes, so an addEdge naming one of them (in any
  // order) already has something to point at.
  for (const op of proposal.operations) {
    if (op.op !== "addNode") continue;
    const flowId = op.flowId ?? "root";
    if (!flows[flowId]) {
      skipped.push(`「${op.label}」の追加: フロー ${flowId} が見つかりません`);
      continue;
    }
    const newId = uuidv4();
    idMap.set(op.id, newId);
    flows[flowId].nodes.push({
      id: newId,
      type: op.kind,
      position: { x: 0, y: 0 }, // real coordinates come from placeAddedNodes below
      data: applyDetails({ label: op.label }, op.details),
    });
    addedNodeIds.add(newId);
    additions.push({ flowId, nodeId: newId, lane: op.lane });
  }

  // Pass 2: everything else, in the order the model gave it.
  for (const op of proposal.operations) {
    switch (op.op) {
      case "addNode":
        break;

      case "updateNode": {
        const id = resolve(op.id);
        const flowId = locateNode(flows, id, op.flowId ?? "root");
        if (!flowId) {
          skipped.push(`ノード ${op.id} の変更: 見つかりません`);
          break;
        }
        flows[flowId].nodes = flows[flowId].nodes.map((n) => {
          if (n.id !== id) return n;
          const data = applyDetails(n.data, op.details);
          return { ...n, data: op.label === undefined ? data : { ...data, label: op.label } };
        });
        // A node this proposal just added is "new", not "changed" - saying
        // both about one node would double-count it in the summary.
        if (!addedNodeIds.has(id)) updatedNodeIds.add(id);
        break;
      }

      case "removeNode": {
        const id = resolve(op.id);
        const flowId = locateNode(flows, id, op.flowId ?? "root");
        if (!flowId) {
          skipped.push(`ノード ${op.id} の削除: 見つかりません`);
          break;
        }
        const graph = flows[flowId];
        const node = graph.nodes.find((n) => n.id === id)!;
        graph.nodes = graph.nodes.filter((n) => n.id !== id);
        recordRemoved(removedNodes, flowId, node);
        // A node's edges cannot outlive it: React Flow drops an edge with a
        // missing endpoint silently, leaving something in the file that is on
        // no screen.
        for (const edge of graph.edges.filter((e) => e.source === id || e.target === id)) {
          recordRemoved(removedEdges, flowId, edge);
        }
        graph.edges = graph.edges.filter((e) => e.source !== id && e.target !== id);
        // Same as deleting a subflow node by hand: its contents go with it.
        for (const subflowId of reachableSubflows([node], flows)) {
          removedSubflows[subflowId] = flows[subflowId];
          delete flows[subflowId];
        }
        break;
      }

      case "addEdge": {
        const source = resolve(op.source);
        const target = resolve(op.target);
        const preferred = op.flowId ?? "root";
        const flowId = locateNode(flows, source, preferred) ?? locateNode(flows, target, preferred);
        if (!flowId) {
          skipped.push(`線の追加: ${op.source} → ${op.target} の両端が見つかりません`);
          break;
        }
        const graph = flows[flowId];
        const hasSource = graph.nodes.some((n) => n.id === source);
        const hasTarget = graph.nodes.some((n) => n.id === target);
        if (!hasSource || !hasTarget) {
          skipped.push(
            `線の追加: ${op.source} → ${op.target} は同じフロー内のノードではありません`
          );
          break;
        }
        const newId = uuidv4();
        graph.edges.push({
          id: newId,
          source,
          target,
          sourceHandle: op.sourceHandle,
          // Same seeding as drawing out of a branch handle by hand (§3.3).
          label: op.label ?? (op.sourceHandle ? BRANCH_HANDLE_LABELS[op.sourceHandle] : undefined),
          type: "smoothstep",
          style: EDGE_STYLE,
        });
        addedEdgeIds.add(newId);
        break;
      }

      case "removeEdge": {
        const flowId = locateEdge(flows, op.id, op.flowId ?? "root");
        if (!flowId) {
          skipped.push(`線 ${op.id} の削除: 見つかりません`);
          break;
        }
        const graph = flows[flowId];
        const edge = graph.edges.find((e) => e.id === op.id)!;
        graph.edges = graph.edges.filter((e) => e.id !== op.id);
        recordRemoved(removedEdges, flowId, edge);
        break;
      }
    }
  }

  // An edge added to a node that a later operation removed would be left
  // dangling; drop it rather than writing a broken document.
  for (const [flowId, graph] of Object.entries(flows)) {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const dangling = graph.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target));
    if (dangling.length === 0) continue;
    graph.edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    for (const edge of dangling) {
      if (addedEdgeIds.delete(edge.id)) {
        skipped.push(`線の追加: 接続先のノードが削除されたため取り消しました（${flowLabel(flowId)}）`);
      }
    }
  }

  placeAddedNodes(flows, additions, doc.lanes?.length ?? 0, doc.orientation);

  const result = fromFlowMap(doc, flows);
  const entries = describeChanges(
    flows,
    { removedNodes, removedEdges },
    { addedNodeIds, addedEdgeIds, updatedNodeIds },
    flowLabel
  );

  return {
    summary: proposal.summary,
    doc: result,
    preview: buildPreview(result, flows, {
      addedNodeIds,
      addedEdgeIds,
      updatedNodeIds,
      removedNodes,
      removedEdges,
      removedSubflows,
    }),
    entries,
    skipped,
    counts: {
      added: addedNodeIds.size + addedEdgeIds.size,
      updated: updatedNodeIds.size,
      removed:
        [...removedNodes.values()].reduce((n, list) => n + list.length, 0) +
        [...removedEdges.values()].reduce((n, list) => n + list.length, 0),
    },
  };
}

/**
 * Gives each new node a position, keeping the rest of the diagram exactly
 * where the user put it: one step downstream of whatever it comes after (or
 * upstream of what it leads to), in the lane the model asked for - or its
 * neighbour's lane when it didn't say. Nodes that would land on top of
 * something already there are nudged along the lane axis, the same way
 * 自動整列 spreads a crowded rank.
 *
 * Deliberately not a call to autoLayoutNodes: re-flowing the whole graph would
 * move nodes the proposal never mentioned, which is the opposite of what a
 * reviewable diff should do. 自動整列 is one click away if the user wants it.
 */
function placeAddedNodes(
  flows: FlowMap,
  additions: { flowId: string; nodeId: string; lane?: number }[],
  laneCount: number,
  orientation: LaneOrientation
): void {
  if (additions.length === 0) return;
  const laneAxis: "x" | "y" = orientation === "vertical" ? "x" : "y";
  const flowAxis: "x" | "y" = orientation === "vertical" ? "y" : "x";
  const lanes = Math.max(laneCount, 1);

  const byFlow = new Map<string, typeof additions>();
  for (const add of additions) {
    const list = byFlow.get(add.flowId);
    if (list) list.push(add);
    else byFlow.set(add.flowId, [add]);
  }

  for (const [flowId, adds] of byFlow) {
    const graph = flows[flowId];
    if (!graph) continue;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const pendingIds = new Set(adds.map((a) => a.nodeId));
    const placed = graph.nodes.filter((n) => !pendingIds.has(n.id));

    const center = (n: WorkflowNode, axis: "x" | "y") => {
      const size = nodeFootprint(n.type);
      return n.position[axis] + (axis === "x" ? size.width : size.height) / 2;
    };
    const overlaps = (a: WorkflowNode, b: WorkflowNode) => {
      const sa = nodeFootprint(a.type);
      const sb = nodeFootprint(b.type);
      const gap = 16;
      return (
        Math.abs(center(a, "x") - center(b, "x")) < (sa.width + sb.width) / 2 + gap &&
        Math.abs(center(a, "y") - center(b, "y")) < (sa.height + sb.height) / 2 + gap
      );
    };

    const place = (add: (typeof adds)[number], fallback: boolean): boolean => {
      const node = byId.get(add.nodeId);
      if (!node) return true;
      const placedIds = new Set(placed.map((n) => n.id));
      const before = graph.edges
        .filter((e) => e.target === node.id && placedIds.has(e.source))
        .map((e) => byId.get(e.source)!)
        .filter(Boolean);
      const after = graph.edges
        .filter((e) => e.source === node.id && placedIds.has(e.target))
        .map((e) => byId.get(e.target)!)
        .filter(Boolean);

      let flowCenter: number;
      if (before.length > 0) {
        flowCenter = Math.max(...before.map((n) => center(n, flowAxis))) + RANK_GAP;
      } else if (after.length > 0) {
        flowCenter = Math.min(...after.map((n) => center(n, flowAxis))) - RANK_GAP;
      } else if (fallback) {
        // Nothing to hang it off: park it after everything else, where it is
        // visible rather than buried under the diagram.
        flowCenter =
          placed.length > 0
            ? Math.max(...placed.map((n) => center(n, flowAxis))) + RANK_GAP
            : MARGIN;
      } else {
        return false; // try again once a neighbour has been placed
      }

      const neighbour = before[0] ?? after[0];
      const laneIndex = Math.min(
        Math.max(add.lane ?? (neighbour ? laneIndexOfNode(neighbour, lanes, orientation) : 0), 0),
        lanes - 1
      );
      const laneCenter = laneIndex * LANE_WIDTH + LANE_WIDTH / 2;

      const size = nodeFootprint(node.type);
      const laneDim = laneAxis === "x" ? size.width : size.height;
      const flowDim = flowAxis === "x" ? size.width : size.height;
      // 0, +1, -1, +2, -2 ... lane-axis steps until the slot is free.
      for (let step = 0; step < 8; step += 1) {
        const shift = Math.ceil(step / 2) * (step % 2 === 0 ? -1 : 1) * NODE_GAP;
        node.position = {
          [laneAxis]: laneCenter + shift - laneDim / 2,
          [flowAxis]: flowCenter - flowDim / 2,
        } as { x: number; y: number };
        if (!placed.some((other) => overlaps(node, other))) break;
      }
      placed.push(node);
      return true;
    };

    let remaining = adds;
    let progress = true;
    while (remaining.length > 0 && progress) {
      const next = remaining.filter((add) => !place(add, false));
      progress = next.length < remaining.length;
      remaining = next;
    }
    // Whatever is left connects to nothing already placed (or to another new
    // node in a cycle): place it unconditionally so the loop always ends.
    for (const add of remaining) place(add, true);
  }
}

/** One line per change, in the order flows and elements appear. */
function describeChanges(
  flows: FlowMap,
  removed: { removedNodes: Map<string, WorkflowNode[]>; removedEdges: Map<string, Edge[]> },
  marks: { addedNodeIds: Set<string>; addedEdgeIds: Set<string>; updatedNodeIds: Set<string> },
  flowLabel: (id: string) => string
): ProposalEntry[] {
  // Names for both sides of an edge, including nodes that are on their way
  // out - a deleted line still has to say what it connected.
  const nodeLabels = new Map<string, string>();
  for (const graph of Object.values(flows)) {
    for (const n of graph.nodes) nodeLabels.set(n.id, n.data?.label || "(名称未設定)");
  }
  for (const list of removed.removedNodes.values()) {
    for (const n of list) nodeLabels.set(n.id, n.data?.label || "(名称未設定)");
  }
  const edgeText = (e: Edge) =>
    `${nodeLabels.get(e.source) ?? "?"} → ${nodeLabels.get(e.target) ?? "?"}` +
    (typeof e.label === "string" && e.label ? `（${e.label}）` : "");

  const entries: ProposalEntry[] = [];
  for (const [flowId, graph] of Object.entries(flows)) {
    const label = flowLabel(flowId);
    for (const n of graph.nodes) {
      if (marks.addedNodeIds.has(n.id)) {
        entries.push({
          id: `add-node-${n.id}`,
          change: "add",
          target: "node",
          flowId,
          flowLabel: label,
          text: `「${n.data?.label || "(名称未設定)"}」を追加`,
        });
      } else if (marks.updatedNodeIds.has(n.id)) {
        entries.push({
          id: `update-node-${n.id}`,
          change: "update",
          target: "node",
          flowId,
          flowLabel: label,
          text: `「${n.data?.label || "(名称未設定)"}」を変更`,
        });
      }
    }
    for (const e of graph.edges) {
      if (!marks.addedEdgeIds.has(e.id)) continue;
      entries.push({
        id: `add-edge-${e.id}`,
        change: "add",
        target: "edge",
        flowId,
        flowLabel: label,
        text: `線を追加: ${edgeText(e)}`,
      });
    }
  }
  for (const [flowId, list] of removed.removedNodes) {
    for (const n of list) {
      entries.push({
        id: `remove-node-${n.id}`,
        change: "remove",
        target: "node",
        flowId,
        flowLabel: flowLabel(flowId),
        text: `「${n.data?.label || "(名称未設定)"}」を削除`,
      });
    }
  }
  for (const [flowId, list] of removed.removedEdges) {
    for (const e of list) {
      entries.push({
        id: `remove-edge-${e.id}`,
        change: "remove",
        target: "edge",
        flowId,
        flowLabel: flowLabel(flowId),
        text: `線を削除: ${edgeText(e)}`,
      });
    }
  }
  return entries;
}

/**
 * The document to put on the canvas while the user decides: the result, plus
 * the removed elements put back so they can be seen going, with a marker class
 * on everything the proposal touched. Never saved - `doc` is what gets
 * committed.
 */
function buildPreview(
  result: WorkflowDocument,
  flows: FlowMap,
  marks: {
    addedNodeIds: Set<string>;
    addedEdgeIds: Set<string>;
    updatedNodeIds: Set<string>;
    removedNodes: Map<string, WorkflowNode[]>;
    removedEdges: Map<string, Edge[]>;
    removedSubflows: FlowMap;
  }
): WorkflowDocument {
  const markNode = (n: WorkflowNode): WorkflowNode => {
    const cls = marks.addedNodeIds.has(n.id)
      ? PROPOSAL_ADD_CLASS
      : marks.updatedNodeIds.has(n.id)
        ? PROPOSAL_UPDATE_CLASS
        : undefined;
    // Selection rings would compete with the markers, and the canvas is
    // read-only while previewing anyway.
    return cls ? { ...n, className: cls, selected: false } : { ...n, selected: false };
  };

  const preview: FlowMap = {};
  for (const [flowId, graph] of Object.entries(flows)) {
    preview[flowId] = {
      nodes: [
        ...graph.nodes.map(markNode),
        ...(marks.removedNodes.get(flowId) ?? []).map((n) => ({
          ...n,
          className: PROPOSAL_REMOVE_CLASS,
          selected: false,
        })),
      ],
      edges: [
        ...graph.edges.map((e) =>
          marks.addedEdgeIds.has(e.id)
            ? { ...e, style: ADDED_EDGE_STYLE, animated: true, selected: false }
            : { ...e, selected: false }
        ),
        ...(marks.removedEdges.get(flowId) ?? []).map((e) => ({
          ...e,
          style: REMOVED_EDGE_STYLE,
          selected: false,
        })),
      ],
    };
  }
  // Contents of a subflow whose node is being deleted: still openable while
  // the red node is on screen.
  for (const [id, graph] of Object.entries(marks.removedSubflows)) {
    if (!preview[id]) preview[id] = graph;
  }

  return fromFlowMap(result, preview);
}
