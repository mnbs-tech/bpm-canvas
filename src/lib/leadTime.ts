import { DURATION_UNITS } from "./types";
import type { DurationUnit, FlowGraph, WorkflowDocument, WorkflowNode } from "./types";
import { subflowLabelMap } from "./validateWorkflow";

/**
 * 所要時間's only shape since NodeDetailsPanel.tsx's picker replaced free
 * text: "<number><unit>" for one of DURATION_UNITS, e.g. "3営業日"/"2.5時間".
 * Built from DURATION_UNITS rather than hand-listing the units again, so the
 * picker and the parser can't drift apart.
 *
 * 営業日 and 日 both count as one calendar day (24h) - this app has no
 * calendar, so a business-day-to-work-hours conversion would imply a
 * precision (skipping weekends/holidays) nothing here actually models. 年/月
 * are nominal (365日/30日) for the same reason - there is no real calendar to
 * anchor them to.
 */
const DURATION_PATTERN = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${DURATION_UNITS.join("|")})$`);
const HOURS_PER_UNIT: Record<DurationUnit, number> = {
  分: 1 / 60,
  時間: 1,
  日: 24,
  営業日: 24,
  月: 24 * 30,
  年: 24 * 365,
};

/** Splits "3営業日" into { value: 3, unit: "営業日" } - used both by the hour
 * parser below and by NodeDetailsPanel.tsx's picker to redisplay a saved
 * value as a number + unit pair. */
export function parseDurationParts(text: string | undefined): { value: number; unit: DurationUnit } | null {
  if (!text) return null;
  const m = DURATION_PATTERN.exec(text.trim());
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: m[2] as DurationUnit };
}

export function parseDurationHours(text: string | undefined): number | null {
  const parts = parseDurationParts(text);
  return parts ? parts.value * HOURS_PER_UNIT[parts.unit] : null;
}

/** "3日4時間" / "2時間" / "0時間" - always at least one part. */
export function formatLeadTimeHours(hours: number): string {
  if (hours <= 0) return "0時間";
  const days = Math.floor(hours / 24 + 1e-9);
  const remHours = Math.round((hours - days * 24) * 10) / 10;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}日`);
  if (remHours > 0 || parts.length === 0) parts.push(`${remHours}時間`);
  return parts.join("");
}

export interface LeadTimeResult {
  /** "root" or a subflow id - same shape as ValidationIssue.flowId. */
  flowId: string;
  flowLabel: string;
  /** Longest 開始→終了 path total, in hours. Null when it can't be computed. */
  totalHours: number | null;
  /** Human reason totalHours is null (no start/end, no path between them, a
   * cycle) or why the fields below should be read with that in mind. */
  reason: string | null;
  /** Node ids on the winning (longest-duration) path, start to end. */
  pathNodeIds: string[];
  /** True when the flow had more than one 開始→終了 route to choose from -
   * the total is the longest of them, not the only possible answer. */
  branched: boolean;
  /** Nodes on the winning path whose 所要時間 is set but didn't match a
   * recognized pattern - totalHours does not count these, so it undercounts
   * whenever this is non-empty. */
  unparsedNodeIds: string[];
}

const isProcessNode = (n: WorkflowNode) => n.type !== "memo";

function computeFlowLeadTime(flowId: string, flowLabel: string, graph: FlowGraph): LeadTimeResult {
  const empty: LeadTimeResult = {
    flowId,
    flowLabel,
    totalHours: null,
    reason: null,
    pathNodeIds: [],
    branched: false,
    unparsedNodeIds: [],
  };

  const nodes = (graph.nodes ?? []).filter(isProcessNode);
  const edges = graph.edges ?? [];
  if (nodes.length === 0) return empty;

  const starts = nodes.filter((n) => n.type === "start");
  const ends = nodes.filter((n) => n.type === "end");
  if (starts.length === 0 || ends.length === 0) {
    return { ...empty, reason: "開始・終了ノードが無いため計算できません" };
  }

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

  // Kahn's algorithm for a topological order; anything left over marks a cycle.
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, incoming.get(n.id)!.length]));
  const order: string[] = [];
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of out.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  if (order.length < nodes.length) {
    return { ...empty, reason: "循環があるため計算できません" };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const weight = new Map<string, number>();
  const unparsed = new Set<string>();
  for (const n of nodes) {
    const text = typeof n.data?.duration === "string" ? n.data.duration.trim() : "";
    if (!text) {
      weight.set(n.id, 0);
      continue;
    }
    const hours = parseDurationHours(text);
    if (hours === null) {
      weight.set(n.id, 0);
      unparsed.add(n.id);
    } else {
      weight.set(n.id, hours);
    }
  }

  // Longest path (by summed duration) from any 開始 node to each node,
  // walked in topological order so every predecessor is settled first.
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  for (const id of order) {
    const node = byId.get(id)!;
    if (node.type === "start") {
      dist.set(id, weight.get(id)!);
      continue;
    }
    let best: number | undefined;
    let bestPrev: string | undefined;
    for (const p of incoming.get(id) ?? []) {
      const pd = dist.get(p);
      if (pd === undefined) continue;
      const candidate = pd + weight.get(id)!;
      if (best === undefined || candidate > best) {
        best = candidate;
        bestPrev = p;
      }
    }
    if (best !== undefined) {
      dist.set(id, best);
      if (bestPrev) prev.set(id, bestPrev);
    }
  }

  let bestEnd: WorkflowNode | undefined;
  let bestVal = -Infinity;
  for (const e of ends) {
    const v = dist.get(e.id);
    if (v !== undefined && v > bestVal) {
      bestVal = v;
      bestEnd = e;
    }
  }
  if (!bestEnd) {
    return { ...empty, reason: "開始から終了へ辿り着けないため計算できません" };
  }

  const path: string[] = [];
  for (let cur: string | undefined = bestEnd.id; cur; cur = prev.get(cur)) path.push(cur);
  path.reverse();

  // Branching = more than one 開始→終了 route existed, independent of which
  // one turned out longest: any node that both a 開始 can reach and that can
  // itself reach a 終了, with more than one such neighbour, is a fork the
  // total had to choose between.
  const reachableFromStart = reachableForward(starts.map((n) => n.id), out);
  const canReachEnd = reachableForward(ends.map((n) => n.id), incoming);
  const onSomePath = new Set([...reachableFromStart].filter((id) => canReachEnd.has(id)));
  const branched = [...onSomePath].some(
    (id) => (out.get(id) ?? []).filter((t) => onSomePath.has(t)).length > 1
  );

  return {
    flowId,
    flowLabel,
    totalHours: bestVal,
    reason: null,
    pathNodeIds: path,
    branched,
    unparsedNodeIds: path.filter((id) => unparsed.has(id)),
  };
}

function reachableForward(starts: string[], adjacency: Map<string, string[]>): Set<string> {
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

/** Root flow and every subflow's lead time, in that order. Pure and
 * synchronous, like validateWorkflow - cheap enough to recompute on demand. */
export function computeLeadTime(doc: WorkflowDocument): LeadTimeResult[] {
  const labels = subflowLabelMap(doc);
  const results: LeadTimeResult[] = [
    computeFlowLeadTime("root", "ルート", { nodes: doc.nodes ?? [], edges: doc.edges ?? [] }),
  ];
  for (const [subflowId, graph] of Object.entries(doc.subflows ?? {})) {
    results.push(computeFlowLeadTime(subflowId, labels.get(subflowId) ?? "サブフロー", graph));
  }
  return results;
}
