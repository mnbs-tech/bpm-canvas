import type { Edge } from "@xyflow/react";
import type { FlowGraph, WorkflowDocument, WorkflowNode } from "./types";

/**
 * "error" は業務フローとして成立していないもの（開始・終了が無い）、
 * "warning" は成立はするが指摘したいもの、"info" は判断材料として出すだけのもの。
 */
export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  /** Stable within one validation pass; used as a React key. */
  id: string;
  severity: IssueSeverity;
  message: string;
  /** "root" or a subflow id - where the offending nodes live. */
  flowId: string;
  /** Human-facing name of that flow ("ルート" or the subflow node's label). */
  flowLabel: string;
  /** Nodes to select when the issue is clicked. May be empty (flow-level issue). */
  nodeIds: string[];
}

/** Notes and comments don't participate in the process, so no rule applies to them. */
const isProcessNode = (n: WorkflowNode) => n.type !== "memo";

function neighbours(nodes: WorkflowNode[], edges: Edge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const n of nodes) {
    out.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    out.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
  }
  return { out, incoming };
}

function reachableFrom(starts: string[], adjacency: Map<string, string[]>): Set<string> {
  const seen = new Set<string>(starts);
  const stack = [...starts];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const next of adjacency.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

/** Kahn's algorithm; anything left undequeued is part of (or downstream of) a cycle. */
function hasCycle(nodes: WorkflowNode[], out: Map<string, string[]>): boolean {
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const [, targets] of out) {
    for (const t of targets) indegree.set(t, (indegree.get(t) ?? 0) + 1);
  }
  const queue = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    processed += 1;
    for (const next of out.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  return processed < nodes.length;
}

function validateFlow(
  flowId: string,
  flowLabel: string,
  graph: FlowGraph,
  issues: ValidationIssue[]
): void {
  const nodes = (graph.nodes ?? []).filter(isProcessNode);
  const edges = graph.edges ?? [];
  const push = (severity: IssueSeverity, key: string, message: string, nodeIds: string[] = []) =>
    issues.push({ id: `${flowId}:${key}`, severity, message, flowId, flowLabel, nodeIds });

  // An empty flow is a flow nobody has drawn yet, not a broken one.
  if (nodes.length === 0) return;

  const starts = nodes.filter((n) => n.type === "start");
  const ends = nodes.filter((n) => n.type === "end");
  const { out, incoming } = neighbours(nodes, edges);

  if (starts.length === 0) push("error", "no-start", "開始ノードがありません");
  if (ends.length === 0) push("error", "no-end", "終了ノードがありません");
  if (starts.length > 1)
    push("warning", "many-starts", `開始ノードが${starts.length}個あります`, starts.map((n) => n.id));

  // A node with no edges at all is reported once, as "isolated". Without
  // this it would also count as unreachable *and* as unable to reach an end,
  // and the panel would say the same thing about the same node three times.
  const isolated = nodes.filter(
    (n) => (out.get(n.id)?.length ?? 0) === 0 && (incoming.get(n.id)?.length ?? 0) === 0
  );
  const isolatedIds = new Set(isolated.map((n) => n.id));

  if (starts.length > 0) {
    const reachable = reachableFrom(starts.map((n) => n.id), out);
    const unreachable = nodes.filter((n) => !reachable.has(n.id) && !isolatedIds.has(n.id));
    if (unreachable.length > 0)
      push(
        "warning",
        "unreachable",
        `開始から到達できないノードが${unreachable.length}個あります`,
        unreachable.map((n) => n.id)
      );
  }

  if (ends.length > 0) {
    // Walk the edges backwards: what can reach an end node?
    const canReachEnd = reachableFrom(ends.map((n) => n.id), incoming);
    const dead = nodes.filter((n) => !canReachEnd.has(n.id) && !isolatedIds.has(n.id));
    if (dead.length > 0)
      push(
        "warning",
        "no-path-to-end",
        `終了へ辿り着けないノードが${dead.length}個あります`,
        dead.map((n) => n.id)
      );
  }

  const openBranches = nodes.filter((n) => n.type === "branch" && (out.get(n.id)?.length ?? 0) < 2);
  if (openBranches.length > 0)
    push(
      "warning",
      "branch-outputs",
      `出口が2本に満たない分岐が${openBranches.length}個あります`,
      openBranches.map((n) => n.id)
    );

  if (isolated.length > 0)
    push(
      "warning",
      "isolated",
      `線が1本も繋がっていないノードが${isolated.length}個あります`,
      isolated.map((n) => n.id)
    );

  if (hasCycle(nodes, out))
    push("info", "cycle", "フローに循環があります（差戻しなら問題ありません）");
}

/**
 * subflowId -> the label of the node that owns it, wherever that node lives.
 * A subflow has no name of its own; it is named after the node you open it
 * from, both in the validation panel and in the proposal preview.
 */
export function subflowLabelMap(doc: WorkflowDocument): Map<string, string> {
  const labels = new Map<string, string>();
  const allFlows: FlowGraph[] = [
    { nodes: doc.nodes ?? [], edges: doc.edges ?? [] },
    ...Object.values(doc.subflows ?? {}),
  ];
  for (const flow of allFlows) {
    for (const n of flow.nodes ?? []) {
      const subflowId = n.data?.subflowId;
      if (typeof subflowId === "string") labels.set(subflowId, n.data.label);
    }
  }
  return labels;
}

/**
 * Checks the document's root flow and every subflow. Pure and synchronous -
 * cheap enough to re-run on each edit, and unit-testable without a DOM.
 *
 * Deliberately not checked: whether an edge's direction makes business sense,
 * whether lane assignment is right, or anything else that needs judgement.
 * That is what the AI chat panel is for.
 */
export function validateWorkflow(doc: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const subflowLabels = subflowLabelMap(doc);

  validateFlow("root", "ルート", { nodes: doc.nodes ?? [], edges: doc.edges ?? [] }, issues);
  for (const [id, graph] of Object.entries(doc.subflows ?? {})) {
    validateFlow(id, subflowLabels.get(id) ?? "サブフロー", graph, issues);
  }

  const order: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
