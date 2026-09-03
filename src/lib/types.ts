import type { Edge, Node } from "@xyflow/react";

/** Every node type this app can render. Kept as a runtime array (not just a
 * union) so the schema in workflowSchema.ts validates against exactly the set
 * the canvas knows how to draw - a file naming anything else is rejected
 * rather than crashing React Flow at render time. */
export const NODE_KINDS = [
  "start",
  "end",
  "task",
  "database",
  "branch",
  "memo",
  "approval",
  "document",
  "notification",
  "wait",
  "subflow",
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export interface WorkflowNodeData {
  label: string;
  /** Only set on kind "subflow" nodes: id of the nested flow in WorkflowDocument.subflows. */
  subflowId?: string;
  /** Free-text business attributes, edited in the details panel. All optional
   * and absent until someone fills them in - see NODE_DETAIL_FIELDS. */
  description?: string;
  assignee?: string;
  duration?: string;
  system?: string;
  documents?: string;
  [key: string]: unknown;
}

/**
 * The details panel's fields, in display order. Driving the panel from this
 * list (rather than hand-writing each input) keeps the UI, the type above and
 * `public/workflow-format.md` from drifting apart when a field is added.
 *
 * "duration" is rendered specially (a number + unit picker, not a plain
 * input/textarea) - see NodeDetailsPanel.tsx's DurationField - but stays in
 * this list because everything else that reads NODE_DETAIL_FIELDS
 * (hasNodeDetails below, Excel/PDF exports) only needs key+label and stores
 * the same plain string either way.
 */
export const NODE_DETAIL_FIELDS = [
  { key: "description", label: "説明", placeholder: "この工程で何をするか", multiline: true },
  { key: "assignee", label: "担当者", placeholder: "例: 営業部 田中", multiline: false },
  { key: "duration", label: "所要時間", placeholder: "", multiline: false },
  { key: "system", label: "使用システム", placeholder: "例: 販売管理システム", multiline: false },
  { key: "documents", label: "関連書類", placeholder: "例: 見積書、注文請書", multiline: false },
] as const;

/**
 * The only units 所要時間 can be entered in (NodeDetailsPanel.tsx's picker) -
 * a plain number picked against one of these, e.g. "3営業日"/"2.5時間". This
 * is what leadTime.ts's parser recognizes; anything else (old free-text
 * values from before this picker existed) is left as-is but shows as
 * "未計上" there rather than being coerced or discarded.
 */
export const DURATION_UNITS = ["営業日", "年", "月", "日", "時間", "分"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

export type NodeDetailKey = (typeof NODE_DETAIL_FIELDS)[number]["key"];

/** True once any detail field has been filled in - drives the badge on the node. */
export function hasNodeDetails(data: WorkflowNodeData): boolean {
  return NODE_DETAIL_FIELDS.some((f) => {
    const value = data[f.key];
    return typeof value === "string" && value.trim() !== "";
  });
}

export type WorkflowNode = Node<WorkflowNodeData, NodeKind>;

export interface LaneData {
  id: string;
  name: string;
  color: string;
}

export const LANE_WIDTH = 320;

/** Lane band colour. One value, used for new lanes and as the fallback when a
 * loaded file omits it. */
export const DEFAULT_LANE_COLOR = "#e2e8f0";

/**
 * React Flow's default edge stroke comes from a CSS custom property
 * (--xy-edge-stroke-default) that html-to-image doesn't resolve when
 * capturing for PDF export/clipboard copy, leaving every edge invisible in
 * the export. Setting this explicitly on every edge (same #b1b1b7 value the
 * CSS var already resolves to - no visual change on screen) survives that.
 */
export const EDGE_STYLE = { stroke: "#b1b1b7", strokeWidth: 1 };

/**
 * Label put on an edge the moment it is drawn out of one of BranchNode's
 * named source handles, so the common yes/no case needs no typing. Only a
 * starting point - the label is editable and deletable like any other.
 */
export const BRANCH_HANDLE_LABELS: Record<string, string> = {
  yes: "はい",
  no: "いいえ",
  default: "その他",
};

/**
 * "vertical": lanes are tall columns side by side, flow runs top→bottom (the
 * app's original layout). "horizontal": lanes are wide rows stacked top to
 * bottom, flow runs left→right.
 */
export type LaneOrientation = "horizontal" | "vertical";

export const DEFAULT_ORIENTATION: LaneOrientation = "horizontal";

/** One nested flow's contents (a subflow node's "inside"). */
export interface FlowGraph {
  nodes: WorkflowNode[];
  edges: Edge[];
}

export const CURRENT_FORMAT_VERSION = 2;

export interface WorkflowDocument {
  formatVersion: number;
  /** Present once saved to S3; absent for brand-new/local-only documents. */
  id?: string;
  name: string;
  orientation: LaneOrientation;
  lanes: LaneData[];
  /** Root flow's nodes/edges. */
  nodes: WorkflowNode[];
  edges: Edge[];
  /** subflowId -> that subflow's own nodes/edges. Absent on pre-subflow (formatVersion 1) files. */
  subflows?: Record<string, FlowGraph>;
  updatedAt: string;
}

export interface WorkflowIndexEntry {
  id: string;
  name: string;
  orientation: LaneOrientation;
  updatedAt: string;
}

/** One past save of a workflow, as listed by GET /api/workflows/{id}/versions.
 * Not part of the saved document itself - the stored snapshot is a plain
 * WorkflowDocument. */
export interface WorkflowVersionEntry {
  /** Opaque, sortable id; also the object key under VERSIONS_PREFIX. */
  versionId: string;
  /** When this version was saved (ISO 8601). */
  savedAt: string;
  /** Size of the stored JSON in bytes, for a rough sense of the flow's size. */
  size: number;
}
