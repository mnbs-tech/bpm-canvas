"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { v4 as uuidv4 } from "uuid";

import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";
import ChatPanel from "./ChatPanel";
import LaneBackground from "./LaneBackground";
import WorkflowLibraryModal from "./WorkflowLibraryModal";
import VersionHistoryModal from "./VersionHistoryModal";
import LeadTimeModal from "./LeadTimeModal";
import NodeDetailsPanel from "./NodeDetailsPanel";
import ProposalBanner from "./ProposalBanner";
import FlowContextMenu, { type ContextMenuItem } from "./FlowContextMenu";
import { nodeTypes } from "./nodes";
import { NODE_PALETTE, DRAG_DATA_FORMAT } from "@/lib/nodeDefs";
import { OrientationContext } from "@/lib/orientation";
import { SubflowNavContext } from "@/lib/subflowNav";
import {
  createS3Workflow,
  downloadWorkflow,
  loadS3Version,
  updateS3Workflow,
} from "@/lib/storage";
import { autoLayoutNodes } from "@/lib/autoLayout";
import { moveLane } from "@/lib/reorderLanes";
import { applyProposal, type ProposalResult } from "@/lib/applyProposal";
import { describeIssues, parseWorkflowDocument } from "@/lib/workflowSchema";
import type { WorkflowProposal } from "@/lib/proposalSchema";
import { useEditorHistory, type EditorSnapshot } from "@/lib/editorHistory";
import { validateWorkflow, type ValidationIssue } from "@/lib/validateWorkflow";
import { computeLeadTime } from "@/lib/leadTime";
import { captureSelection, cloneSelection, type Selection } from "@/lib/cloneSelection";
import {
  alignSelectedNodes,
  distributeSelectedNodes,
  type AlignMode,
  type DistributeMode,
} from "@/lib/alignNodes";
import { clearDraft, readDraft, writeDraft, type StoredDraft } from "@/lib/draftStorage";
import {
  captureFlowImage,
  copyFlowImageToClipboard,
  exportPagesToPdf,
  type PdfPage,
} from "@/lib/exportImage";
import { exportPagesToExcel, type ExcelPage } from "@/lib/exportExcel";
import { WORKFLOW_TEMPLATES } from "@/lib/templates";
import { useDialog } from "@/lib/dialog";
import { useToast } from "@/lib/toast";
import {
  BRANCH_HANDLE_LABELS,
  CURRENT_FORMAT_VERSION,
  DEFAULT_LANE_COLOR,
  DEFAULT_ORIENTATION,
  EDGE_STYLE,
} from "@/lib/types";
import type {
  FlowGraph,
  LaneData,
  LaneOrientation,
  NodeDetailKey,
  WorkflowDocument,
  WorkflowNode,
  WorkflowVersionEntry,
} from "@/lib/types";

const DEFAULT_LANES: LaneData[] = [
  { id: uuidv4(), name: "担当A", color: DEFAULT_LANE_COLOR },
  { id: uuidv4(), name: "担当B", color: DEFAULT_LANE_COLOR },
  { id: uuidv4(), name: "担当C", color: DEFAULT_LANE_COLOR },
];

// Authored for DEFAULT_ORIENTATION ("horizontal"): both nodes sit in lane 0,
// spaced along the left→right flow axis.
function makeDefaultFlowGraph(): FlowGraph {
  return {
    nodes: [
      { id: uuidv4(), type: "start", position: { x: 60, y: 100 }, data: { label: "開始" } },
      { id: uuidv4(), type: "end", position: { x: 360, y: 100 }, data: { label: "終了" } },
    ],
    edges: [],
  };
}

const initialFlowGraph = makeDefaultFlowGraph();

/** Long enough that typing a label isn't a write per keystroke, short enough
 * that little is lost if the tab dies mid-thought. */
const DRAFT_DEBOUNCE_MS = 2000;

interface BreadcrumbItem {
  id: string;
  label: string;
}

/** What the open right-click menu was opened on. The elements themselves are
 * not stored - only their ids - so the entries are always built against the
 * current nodes/edges rather than a copy taken when the menu opened. */
type ContextMenuTarget =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "pane" };

interface EdgeLabelEdit {
  edgeId: string;
  /** Position within the canvas wrapper; the input is centred on it. */
  x: number;
  y: number;
  value: string;
}

/**
 * An AI proposal (§3.20) put on the canvas but not yet accepted. The editor is
 * showing `result.preview` - the proposed document with the removals still in
 * it and every touched element marked - and holds on to the state it replaced
 * so that discarding leaves no trace and accepting has something for undo to
 * go back to.
 */
interface ProposalPreview {
  result: ProposalResult;
  before: EditorSnapshot;
  /** The dirty flag as it was, restored when the proposal is discarded. */
  wasDirty: boolean;
  /** The flow the preview opened on - where the change actually is, which is
   * not necessarily where the user was standing. Accepting keeps them there. */
  shown: { flowId: string; breadcrumb: BreadcrumbItem[] };
}

interface ContextMenuState {
  /** Position within the canvas wrapper, not the viewport. */
  x: number;
  y: number;
  target: ContextMenuTarget;
}

interface FlowPage {
  id: string;
  /** Breadcrumb-style heading, e.g. "見積フロー › 再見積". */
  title: string;
  graph: FlowGraph;
}

/**
 * Every flow the document contains, in reading order: the root first, then
 * each subflow at the point its node appears, depth first. A subflow reached
 * twice (the same subflowId set on two nodes - undefined behaviour per SPEC
 * §3.6) is emitted once, which also stops a self-referencing document from
 * looping forever. Subflows no node points at are skipped: they are
 * unreachable in the editor too.
 */
function collectFlowPages(
  rootTitle: string,
  root: FlowGraph,
  subflows: Record<string, FlowGraph>
): FlowPage[] {
  const pages: FlowPage[] = [{ id: "root", title: rootTitle, graph: root }];
  const visited = new Set<string>();

  const walk = (graph: FlowGraph, path: string) => {
    for (const node of graph.nodes) {
      const subflowId = node.data?.subflowId;
      if (typeof subflowId !== "string" || visited.has(subflowId)) continue;
      const sub = subflows[subflowId];
      if (!sub) continue;
      visited.add(subflowId);
      const title = `${path} › ${node.data.label || "サブフロー"}`;
      pages.push({ id: subflowId, title, graph: sub });
      walk(sub, title);
    }
  };

  walk(root, rootTitle);
  return pages;
}

/** Two frames plus a beat: long enough for React Flow to mount the swapped-in
 * nodes and measure them, which is what getNodesBounds needs to frame the
 * capture correctly. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setTimeout(resolve, 250))
    );
  });
}

export default function WorkflowEditor() {
  const [name, setName] = useState("新しいワークフロー");
  const [orientation, setOrientation] = useState<LaneOrientation>(DEFAULT_ORIENTATION);
  const [lanes, setLanes] = useState<LaneData[]>(DEFAULT_LANES);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialFlowGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialFlowGraph.edges);

  // Holds every flow *other* than the one currently loaded into nodes/edges
  // above ("root" or a subflow id). The active flow is synced into here the
  // moment navigation leaves it - see navigateTo.
  const [flows, setFlows] = useState<Record<string, FlowGraph>>({});
  const [currentFlowId, setCurrentFlowId] = useState("root");
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [s3Id, setS3Id] = useState<string | undefined>();
  const [showLibrary, setShowLibrary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLeadTime, setShowLeadTime] = useState(false);
  const [saving, setSaving] = useState(false);
  /** An unsaved draft found in this browser on load, waiting to be restored
   * or discarded. Never set while editing - only on mount. */
  const [pendingDraft, setPendingDraft] = useState<StoredDraft | null>(null);
  const [draftFailed, setDraftFailed] = useState(false);
  /** Non-null while a multi-page PDF is being captured; drives the button's
   * progress text and keeps a second run from starting mid-swap. */
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  /** True while the Excel workbook is being built. Unlike the PDF export it
   * carries no page counter: nothing is captured off the canvas, so there are
   * no per-flow steps to report. */
  const [excelExporting, setExcelExporting] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  /** The edge whose label is being typed on the canvas, with the position
   * (within the canvas wrapper) the input is centred on. */
  const [edgeLabelEdit, setEdgeLabelEdit] = useState<EdgeLabelEdit | null>(null);
  /** Non-null while an AI proposal is being reviewed; the canvas is read-only
   * and shows the marked-up copy until it is applied or discarded. */
  const [preview, setPreview] = useState<ProposalPreview | null>(null);
  const previewing = preview !== null;

  const toast = useToast();
  const dialog = useDialog();

  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Copy/paste buffer. Deliberately in-app rather than the system clipboard:
   * what is copied is a piece of the document (nodes, the edges between them,
   * whole subflows), not text, and it only ever means something here. */
  const clipboardRef = useRef<Selection | null>(null);
  /** How many times the current clipboard has been pasted, so repeated pastes
   * cascade instead of landing on each other. */
  const pasteCountRef = useRef(0);
  const reactFlowInstance = useReactFlow<WorkflowNode, Edge>();
  const { screenToFlowPosition, fitView } = reactFlowInstance;

  // Warns before closing/reloading the tab if there's anything since the
  // last load/save that hasn't been saved. React Flow measures each node's
  // rendered size shortly after it mounts (via ResizeObserver) and pushes
  // that back through onNodesChange, which changes the `nodes` array
  // reference just like a real edit would - so a single skip-the-next-run
  // flag isn't enough, it just catches the *first* of those and still
  // misfires on the second. suppressDirtyUntilRef instead ignores any
  // change within a short window after mount/load/clear, comfortably
  // longer than that measurement pass takes.
  const [dirty, setDirty] = useState(false);
  const suppressDirtyUntilRef = useRef(0);

  useEffect(() => {
    suppressDirtyUntilRef.current = Date.now() + 800;
  }, []);

  useEffect(() => {
    if (Date.now() < suppressDirtyUntilRef.current) return;
    setDirty(true);
  }, [nodes, edges, lanes, name, orientation, flows]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Identity changes only when one of the parts does, which is what makes it
  // usable as the history hook's change signal.
  const snapshot = useMemo<EditorSnapshot>(
    () => ({ name, orientation, lanes, nodes, edges, flows, currentFlowId, breadcrumb, s3Id }),
    [name, orientation, lanes, nodes, edges, flows, currentFlowId, breadcrumb, s3Id]
  );

  const applySnapshot = useCallback(
    (s: EditorSnapshot) => {
      setName(s.name);
      setOrientation(s.orientation);
      setLanes(s.lanes);
      setNodes(s.nodes);
      setEdges(s.edges);
      setFlows(s.flows);
      setCurrentFlowId(s.currentFlowId);
      setBreadcrumb(s.breadcrumb);
      setS3Id(s.s3Id);
    },
    [setNodes, setEdges]
  );

  const history = useEditorHistory({
    snapshot,
    apply: applySnapshot,
    suppressUntilRef: suppressDirtyUntilRef,
  });
  const { undo, redo, recordNow } = history;

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => {
        // A branch's yes/no/default handles carry their meaning already, so
        // seed the edge with the matching label instead of making the user
        // double-click and type it every time. Plain nodes' handles
        // ("left"/"right") aren't in the map and stay unlabeled.
        const label = connection.sourceHandle
          ? BRANCH_HANDLE_LABELS[connection.sourceHandle]
          : undefined;
        return addEdge({ ...connection, type: "smoothstep", style: EDGE_STYLE, label }, eds);
      }),
    [setEdges]
  );

  /** Opens the on-canvas label input for an edge, centred on the point the
   * user acted at - their double-click, or where the right-click menu was.
   * That point is on the line itself, and on the label when there is one.
   *
   * Deliberately reads no ref: this ends up in `menuItems`' dependencies, and
   * a memo that depends on a ref-reading callback counts as ref-derived, which
   * then makes reading `menuItems` during render a react-hooks/refs error. */
  const openEdgeLabelEditor = useCallback(
    (edgeId: string, at: { x: number; y: number }) => {
      if (previewing) return;
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;
      setEdgeLabelEdit({
        edgeId,
        x: at.x,
        y: at.y,
        value: typeof edge.label === "string" ? edge.label : "",
      });
    },
    [edges, previewing]
  );

  const commitEdgeLabel = useCallback(() => {
    if (!edgeLabelEdit) return;
    // Blank clears the label rather than storing "": absent and empty are the
    // same thing in the document (§3.3).
    const label = edgeLabelEdit.value.trim() || undefined;
    setEdges((eds) => eds.map((e) => (e.id === edgeLabelEdit.edgeId ? { ...e, label } : e)));
    setEdgeLabelEdit(null);
  }, [edgeLabelEdit, setEdges]);

  const onEdgeDoubleClick: EdgeMouseHandler<Edge> = useCallback(
    (event, edge) => {
      event.stopPropagation();
      const rect = wrapperRef.current?.getBoundingClientRect();
      openEdgeLabelEditor(
        edge.id,
        rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 0, y: 0 }
      );
    },
    [openEdgeLabelEditor]
  );

  const hasSelection = nodes.some((n) => n.selected) || edges.some((e) => e.selected);

  // The details panel edits one node at a time; with a multi-select there is
  // no single node to describe, so it stays closed.
  const selectedNodes = nodes.filter((n) => n.selected);
  const detailNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined;

  const handleNodeDetailChange = useCallback(
    (nodeId: string, key: NodeDetailKey | "label", value: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          // Empty means "not set": drop the key rather than saving "" into
          // the document, so absent and blank stay the same thing.
          const next = { ...n.data, [key]: value };
          if (key !== "label" && value === "") delete next[key];
          return { ...n, data: next };
        })
      );
    },
    [setNodes]
  );

  const clearNodeSelection = useCallback(() => {
    setNodes((nds) => (nds.some((n) => n.selected) ? nds.map((n) => ({ ...n, selected: false })) : nds));
  }, [setNodes]);

  const handleDeleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
    reactFlowInstance.deleteElements({ nodes: selectedNodes, edges: selectedEdges });
  }, [nodes, edges, reactFlowInstance]);

  // --- copy / paste / duplicate ------------------------------------------

  /** How far a pasted copy lands from its original, in flow units. Big enough
   * that the copy reads as a separate node, small enough to stay next to it. */
  const PASTE_OFFSET = 32;

  const insertClone = useCallback(
    (selection: Selection, step: number) => {
      const clone = cloneSelection(selection, {
        x: PASTE_OFFSET * step,
        y: PASTE_OFFSET * step,
      });
      // The copy becomes the selection: deselect everything that was selected
      // before, so the next drag (or Ctrl+D) acts on what was just pasted.
      setNodes((nds) => [...nds.map((n) => (n.selected ? { ...n, selected: false } : n)), ...clone.nodes]);
      setEdges((eds) => [...eds.map((e) => (e.selected ? { ...e, selected: false } : e)), ...clone.edges]);
      if (Object.keys(clone.subflows).length > 0) {
        setFlows((prev) => ({ ...prev, ...clone.subflows }));
      }
      return clone.nodes.length;
    },
    [setNodes, setEdges]
  );

  const handleCopy = useCallback(() => {
    const selection = captureSelection(nodes, edges, flows);
    if (!selection) return;
    clipboardRef.current = selection;
    pasteCountRef.current = 0;
    toast.show(`${selection.nodes.length}件をコピーしました`, "info");
  }, [nodes, edges, flows, toast]);

  const handlePaste = useCallback(() => {
    const selection = clipboardRef.current;
    if (!selection) return;
    pasteCountRef.current += 1;
    insertClone(selection, pasteCountRef.current);
  }, [insertClone]);

  /** Ctrl+D: copy and paste in one step, without disturbing the clipboard. */
  const handleDuplicate = useCallback(() => {
    const selection = captureSelection(nodes, edges, flows);
    if (!selection) return;
    insertClone(selection, 1);
  }, [nodes, edges, flows, insertClone]);

  // --- align / distribute --------------------------------------------------

  const handleAlign = useCallback(
    (mode: AlignMode) => setNodes((nds) => alignSelectedNodes(nds, mode)),
    [setNodes]
  );

  const handleDistribute = useCallback(
    (mode: DistributeMode) => setNodes((nds) => distributeSelectedNodes(nds, mode)),
    [setNodes]
  );

  // --- right-click menu --------------------------------------------------

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const openContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent, target: ContextMenuTarget) => {
      // Nothing in the menu is available while reviewing a proposal, and its
      // entries act on the marked-up copy rather than the real document.
      if (previewing) return;
      // Suppress the browser's own menu: the canvas has its own actions here.
      event.preventDefault();
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, target });
    },
    [previewing]
  );

  const onNodeContextMenu: NodeMouseHandler<WorkflowNode> = useCallback(
    (event, node) => {
      // Right-clicking something outside the current selection makes it the
      // selection, so the menu always acts on what was actually clicked.
      // Clicking *inside* a multi-selection leaves it intact, which is what
      // makes "選択した N 件を削除" reachable.
      if (!node.selected) {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === node.id })));
        setEdges((eds) => (eds.some((e) => e.selected) ? eds.map((e) => ({ ...e, selected: false })) : eds));
      }
      openContextMenu(event, { kind: "node", id: node.id });
    },
    [openContextMenu, setNodes, setEdges]
  );

  const onEdgeContextMenu: EdgeMouseHandler<Edge> = useCallback(
    (event, edge) => {
      if (!edge.selected) {
        setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edge.id })));
        setNodes((nds) => (nds.some((n) => n.selected) ? nds.map((n) => ({ ...n, selected: false })) : nds));
      }
      openContextMenu(event, { kind: "edge", id: edge.id });
    },
    [openContextMenu, setNodes, setEdges]
  );

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      // On empty canvas the only entry would be "delete the selection", so
      // with nothing selected there is no menu to show - leave the browser's
      // own menu alone rather than swallowing the click for an empty box.
      if (!nodes.some((n) => n.selected) && !edges.some((e) => e.selected)) {
        closeContextMenu();
        return;
      }
      openContextMenu(event, { kind: "pane" });
    },
    [nodes, edges, openContextMenu, closeContextMenu]
  );

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];
    const target = contextMenu.target;
    const selectedNodeCount = nodes.filter((n) => n.selected).length;
    const selectedEdgeCount = edges.filter((e) => e.selected).length;
    const selectionCount = selectedNodeCount + selectedEdgeCount;

    // A multi-selection is deleted as a whole - right-clicking one member of
    // it to delete only that member would be a surprising way to lose the
    // rest of the selection.
    if (target.kind === "pane" || selectionCount > 1) {
      return selectionCount > 0
        ? [{ label: `選択した${selectionCount}件を削除`, danger: true, onSelect: handleDeleteSelected }]
        : [];
    }
    if (target.kind === "node") {
      return [
        {
          label: "この部品を削除",
          danger: true,
          onSelect: () => reactFlowInstance.deleteElements({ nodes: [{ id: target.id }] }),
        },
      ];
    }
    return [
      {
        label: "この線の名称を編集",
        onSelect: () => openEdgeLabelEditor(target.id, { x: contextMenu.x, y: contextMenu.y }),
      },
      {
        label: "この線を削除",
        danger: true,
        onSelect: () => reactFlowInstance.deleteElements({ edges: [{ id: target.id }] }),
      },
    ];
  }, [contextMenu, nodes, edges, handleDeleteSelected, reactFlowInstance, openEdgeLabelEditor]);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (previewing) return;
      const kind = event.dataTransfer.getData(DRAG_DATA_FORMAT);
      const paletteItem = NODE_PALETTE.find((p) => p.kind === kind);
      if (!paletteItem) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode: WorkflowNode = {
        id: uuidv4(),
        type: paletteItem.kind,
        position,
        data: { label: paletteItem.defaultLabel },
      };
      if (paletteItem.kind === "subflow") {
        const subflowId = uuidv4();
        newNode.data.subflowId = subflowId;
        setFlows((prev) => ({ ...prev, [subflowId]: makeDefaultFlowGraph() }));
      }
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes, previewing]
  );

  const onNodesDelete = useCallback(
    (deleted: WorkflowNode[]) => {
      const orphanedSubflowIds = deleted
        .filter((n) => n.type === "subflow" && n.data.subflowId)
        .map((n) => n.data.subflowId as string);
      if (orphanedSubflowIds.length === 0) return;
      setFlows((prev) => {
        const next = { ...prev };
        for (const id of orphanedSubflowIds) delete next[id];
        return next;
      });
    },
    []
  );

  const handleAddLane = useCallback(() => {
    setLanes((prev) => [
      ...prev,
      { id: uuidv4(), name: `レーン${prev.length + 1}`, color: DEFAULT_LANE_COLOR },
    ]);
  }, []);

  const handleRenameLane = useCallback((id: string, name: string) => {
    setLanes((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
  }, []);

  const handleRemoveLane = useCallback((id: string) => {
    setLanes((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }, []);

  /**
   * Reordering the lane list alone would move the *bands* and leave the nodes
   * behind, handing each one to its new neighbour - so moveLane also returns
   * the matching node shift, which is applied to every flow (root + subflows)
   * because the lane list is document-wide. The debounced history picks this
   * up as one undo step, like any other edit.
   */
  const handleMoveLane = useCallback(
    (from: number, to: number) => {
      const move = moveLane(lanes, from, to, orientation);
      if (!move) return;
      setLanes(move.lanes);
      setNodes((nds) => move.shiftNodes(nds));
      setFlows((prev) => {
        const next: Record<string, FlowGraph> = {};
        for (const [id, g] of Object.entries(prev)) {
          next[id] = { nodes: move.shiftNodes(g.nodes), edges: g.edges };
        }
        return next;
      });
    },
    [lanes, orientation, setNodes]
  );

  // Swapping x/y is a self-inverse transform: lane membership and in-lane
  // position both transpose cleanly, and toggling back is lossless. Applies
  // to every flow (root + all subflows), not just the one on screen.
  const handleToggleOrientation = useCallback(() => {
    const transpose = (arr: WorkflowNode[]) =>
      arr.map((n) => ({ ...n, position: { x: n.position.y, y: n.position.x } }));

    setOrientation((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
    setNodes((nds) => transpose(nds));
    setFlows((prev) => {
      const next: Record<string, FlowGraph> = {};
      for (const [id, g] of Object.entries(prev)) {
        next[id] = { nodes: transpose(g.nodes), edges: g.edges };
      }
      return next;
    });
    requestAnimationFrame(() => fitView({ duration: 200 }));
  }, [setNodes, fitView]);

  const handleAutoLayout = useCallback(() => {
    setNodes((nds) => autoLayoutNodes(nds, edges, lanes, orientation));
    requestAnimationFrame(() => fitView({ duration: 300 }));
  }, [edges, lanes, orientation, setNodes, fitView]);

  // Merges the live (on-screen) flow with everything stashed in `flows` into
  // one { root, subflows } snapshot - used for saving and exporting.
  const snapshotAllFlows = useCallback((): { root: FlowGraph; subflows: Record<string, FlowGraph> } => {
    const merged: Record<string, FlowGraph> = { ...flows, [currentFlowId]: { nodes, edges } };
    const { root, ...subflows } = merged;
    return { root: root ?? { nodes: [], edges: [] }, subflows };
  }, [flows, currentFlowId, nodes, edges]);

  const navigateTo = useCallback(
    (targetId: string, newBreadcrumb: BreadcrumbItem[]) => {
      if (targetId === currentFlowId) return;
      const target =
        targetId === "root"
          ? flows["root"] ?? makeDefaultFlowGraph()
          : flows[targetId] ?? makeDefaultFlowGraph();

      setFlows((prev) => ({ ...prev, [currentFlowId]: { nodes, edges } }));
      setNodes(target.nodes);
      setEdges(target.edges);
      setCurrentFlowId(targetId);
      setBreadcrumb(newBreadcrumb);
      requestAnimationFrame(() => fitView({ duration: 200 }));
    },
    [flows, currentFlowId, nodes, edges, setNodes, setEdges, fitView]
  );

  const openSubflow = useCallback(
    (subflowId: string, label: string) => {
      navigateTo(subflowId, [...breadcrumb, { id: subflowId, label }]);
    },
    [navigateTo, breadcrumb]
  );

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      if (index < 0) {
        navigateTo("root", []);
      } else {
        navigateTo(breadcrumb[index].id, breadcrumb.slice(0, index + 1));
      }
    },
    [navigateTo, breadcrumb]
  );

  /**
   * Puts a document into the editor's state and nothing else: no history step,
   * no dirty flag, no draft. Callers decide what this particular replacement
   * means (see loadDocument below, and the proposal handlers).
   *
   * `stayOn` keeps the user on the flow they were looking at instead of
   * dropping them back at the root - what the proposal preview needs, since
   * the change it is showing may well be inside a subflow.
   */
  const putDocument = useCallback(
    (doc: WorkflowDocument, stayOn?: { flowId: string; breadcrumb: BreadcrumbItem[] }) => {
      const subflows = doc.subflows ?? {};
      setName(doc.name ?? "ワークフロー");
      setOrientation(doc.orientation ?? "vertical");
      setLanes(doc.lanes?.length ? doc.lanes : DEFAULT_LANES);
      setS3Id(doc.id);
      const stayGraph = stayOn && stayOn.flowId !== "root" ? subflows[stayOn.flowId] : undefined;
      if (stayOn && stayGraph) {
        // Same shape navigateTo leaves behind: the flow on screen lives in
        // nodes/edges, every other one (the root included) in `flows`.
        setFlows({ root: { nodes: doc.nodes ?? [], edges: doc.edges ?? [] }, ...subflows });
        setNodes(stayGraph.nodes);
        setEdges(stayGraph.edges);
        setCurrentFlowId(stayOn.flowId);
        setBreadcrumb(stayOn.breadcrumb);
      } else {
        setFlows(subflows);
        setNodes(doc.nodes ?? []);
        setEdges(doc.edges ?? []);
        setCurrentFlowId("root");
        setBreadcrumb([]);
      }
      requestAnimationFrame(() => fitView({ duration: 200 }));
    },
    [setNodes, setEdges, fitView]
  );

  const loadDocument = useCallback(
    (doc: WorkflowDocument) => {
      // Before the suppress window folds it into the baseline: keep what was
      // on screen as an undo step, so opening the wrong workflow (or a
      // template) over unsaved work is recoverable.
      recordNow();
      suppressDirtyUntilRef.current = Date.now() + 800;
      setDirty(false);
      putDocument(doc);
    },
    [putDocument, recordNow]
  );

  // The document as it stands right now. Used for saving, exporting, and
  // handed to ChatPanel so the AI sees the workflow at send-time rather than
  // a stale copy captured at mount.
  const getWorkflowSnapshot = useCallback((): WorkflowDocument => {
    const { root, subflows } = snapshotAllFlows();
    return {
      formatVersion: CURRENT_FORMAT_VERSION,
      id: s3Id,
      name,
      orientation,
      lanes,
      nodes: root.nodes,
      edges: root.edges,
      subflows,
      updatedAt: new Date().toISOString(),
    };
  }, [snapshotAllFlows, s3Id, name, orientation, lanes]);

  const handleSave = useCallback(async () => {
    // Guards the double-click case: with no id yet, two POSTs would create
    // two separate workflows out of one document.
    if (saving) return;
    setSaving(true);
    const doc = getWorkflowSnapshot();
    try {
      const saved = s3Id ? await updateS3Workflow(s3Id, doc) : await createS3Workflow(doc);
      setS3Id(saved.id);
      setDirty(false);
      // S3 is the truth again; a leftover draft would only offer to restore
      // what was just saved.
      clearDraft();
      setDraftFailed(false);
      toast.show(`保存しました: ${saved.name}`, "success");
    } catch (err) {
      toast.show(`保存に失敗しました: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setSaving(false);
    }
  }, [getWorkflowSnapshot, s3Id, saving, toast]);

  /** Always creates a new workflow, leaving the one currently open on S3
   * untouched; the editor then follows the copy. */
  const handleSaveAs = useCallback(async () => {
    if (saving) return;
    const suggested = s3Id ? `${name} のコピー` : name;
    const input = await dialog.prompt({
      title: "名前を付けて保存",
      message: "別のフローとして新しく保存します。今開いているフローはそのまま残ります。",
      defaultValue: suggested,
      confirmLabel: "保存する",
    });
    if (input === null) return;
    const newName = input.trim() || suggested;
    setSaving(true);
    // Set before awaiting: the dirty effect fires on the rename, and the
    // setDirty(false) below lands after it.
    setName(newName);
    try {
      const saved = await createS3Workflow({ ...getWorkflowSnapshot(), id: undefined, name: newName });
      setS3Id(saved.id);
      setDirty(false);
      clearDraft();
      setDraftFailed(false);
      toast.show(`「${saved.name}」として保存しました`, "success");
    } catch (err) {
      toast.show(`保存に失敗しました: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setSaving(false);
    }
  }, [getWorkflowSnapshot, name, s3Id, saving, dialog, toast]);

  /** Puts a past save back as the current document. The state it replaces was
   * itself a save, so it is already in the history - which is what makes this
   * safe to do without a second "are you really sure". */
  const handleRestoreVersion = useCallback(
    async (entry: WorkflowVersionEntry) => {
      if (!s3Id || saving) return;
      const when = entry.savedAt ? new Date(entry.savedAt).toLocaleString("ja-JP") : "この";
      try {
        const doc = await loadS3Version(s3Id, entry.versionId);
        const ok = await dialog.confirm({
          title: `${when} の版に戻しますか？`,
          message: [
            `フロー名「${doc.name}」、部品${doc.nodes?.length ?? 0}個の状態に戻します。`,
            "今保存されている内容も履歴に残るので、戻したあとでやり直せます。",
            dirty ? "※ まだ保存していない編集は失われます。" : "",
          ]
            .filter(Boolean)
            .join("\n"),
          confirmLabel: "この版に戻す",
          danger: true,
        });
        if (!ok) return;
        setSaving(true);
        const saved = await updateS3Workflow(s3Id, doc);
        loadDocument(saved);
        setShowHistory(false);
        toast.show(`${when} の版に戻しました`, "success");
      } catch (err) {
        toast.show(`版の復元に失敗しました: ${err instanceof Error ? err.message : err}`, "error");
      } finally {
        setSaving(false);
      }
    },
    [s3Id, saving, dirty, dialog, toast, loadDocument]
  );

  // --- AI proposals (§3.20) ----------------------------------------------

  /**
   * Takes the diff the AI produced, works out what the document would become,
   * and puts *that* on the canvas with everything it touches marked - without
   * committing anything. The user accepts or discards from the banner.
   *
   * The result is run through parseWorkflowDocument first, the same gate a
   * hand-written file goes through: a proposal that would produce a document
   * the app could not load is refused here rather than after it is on screen.
   */
  const handleProposal = useCallback(
    (proposal: WorkflowProposal) => {
      if (previewing) return;
      const result = applyProposal(getWorkflowSnapshot(), proposal);
      if (result.entries.length === 0) {
        toast.show(
          result.skipped.length > 0
            ? `提案を取り込めませんでした: ${result.skipped[0]}`
            : "反映できる変更がありませんでした",
          "info"
        );
        return;
      }
      const parsed = parseWorkflowDocument(result.doc);
      if (!parsed.ok) {
        toast.show(`AIの提案を取り込めませんでした: ${describeIssues(parsed.issues)}`, "error");
        return;
      }
      // Show the change, wherever it is: a proposal that only touches a
      // subflow would otherwise preview as an unchanged canvas, with the
      // banner as the only hint that anything is happening. Same move the
      // validation panel makes when an issue is clicked (§3.12).
      const changed = new Set(result.entries.map((e) => e.flowId));
      // Only move if nothing here changes; a deeply nested subflow is reached
      // by a one-level breadcrumb, as the validation panel does.
      const elsewhere = changed.has(currentFlowId) ? undefined : result.entries[0];
      const shown = !elsewhere
        ? { flowId: currentFlowId, breadcrumb }
        : elsewhere.flowId === "root"
          ? { flowId: "root", breadcrumb: [] }
          : {
              flowId: elsewhere.flowId,
              breadcrumb: [{ id: elsewhere.flowId, label: elsewhere.flowLabel }],
            };
      setPreview({ result, before: snapshot, wasDirty: dirty, shown });
      suppressDirtyUntilRef.current = Date.now() + 5000;
      putDocument(result.preview, shown);
      // putDocument fits the view on the next frame, but the banner appears in
      // the same commit and takes a strip off the top of the canvas; React
      // Flow re-measures its container a beat after that, so fit again once
      // the smaller canvas is the one being fitted to. Without this, a change
      // at the bottom of the diagram can sit just off-screen.
      setTimeout(() => fitView({ duration: 200 }), 400);
    },
    [
      previewing,
      getWorkflowSnapshot,
      snapshot,
      dirty,
      currentFlowId,
      breadcrumb,
      putDocument,
      fitView,
      toast,
    ]
  );

  // A preview lasts as long as the user takes to read it, which is far longer
  // than the fixed windows the rest of the editor uses. Holding the window
  // open keeps the marked-up copy out of the undo stack, the dirty flag and
  // the browser draft - none of which should ever see a document the user has
  // not accepted.
  useEffect(() => {
    if (!previewing) return;
    const timer = setInterval(() => {
      suppressDirtyUntilRef.current = Date.now() + 5000;
    }, 2000);
    return () => clearInterval(timer);
  }, [previewing]);

  const handleApplyProposal = useCallback(() => {
    if (!preview) return;
    const { result, before, shown } = preview;
    setPreview(null);
    // Undo has to return to the document as it was before the preview replaced
    // the canvas - not to the marked-up copy that is on screen right now.
    recordNow(before);
    suppressDirtyUntilRef.current = Date.now() + 800;
    // Stay on the flow the preview was showing: that is where the change the
    // user just accepted is.
    putDocument(result.doc, shown);
    // Explicit: the dirty effect is inside the suppress window above, and this
    // is unsaved work like any other edit.
    setDirty(true);
    const { added, updated, removed } = result.counts;
    toast.show(
      `AIの提案を反映しました（追加${added} / 変更${updated} / 削除${removed}）。Ctrl+Zで元に戻せます`,
      "success"
    );
  }, [preview, recordNow, putDocument, toast]);

  const handleDiscardProposal = useCallback(() => {
    if (!preview) return;
    const { before, wasDirty } = preview;
    setPreview(null);
    suppressDirtyUntilRef.current = Date.now() + 800;
    applySnapshot(before);
    // Discarding leaves no trace: the flag goes back to whatever it was, so a
    // rejected proposal cannot make a saved document look unsaved.
    setDirty(wasDirty);
  }, [preview, applySnapshot]);

  // While previewing, report on the document as it *would* be: the marked-up
  // copy still carries the nodes the proposal deletes, so validating that
  // would describe a document nobody is going to save.
  const issues = useMemo(
    () => validateWorkflow(preview ? preview.result.doc : getWorkflowSnapshot()),
    [preview, getWorkflowSnapshot]
  );

  // Same document choice as `issues` above, for the same reason: while
  // previewing, report on the marked-up copy that is actually on screen.
  const leadTime = useMemo(
    () => computeLeadTime(preview ? preview.result.doc : getWorkflowSnapshot()),
    [preview, getWorkflowSnapshot]
  );

  /** Switches to a flow if needed, then selects and frames the given nodes.
   * Shared by 検証 issues (whole-issue nodeIds) and リードタイム (a winning
   * path's nodeIds) - both are "jump to this flow and highlight these
   * nodes". */
  const focusInFlow = useCallback(
    (flowId: string, flowLabel: string, nodeIds: string[]) => {
      if (flowId !== currentFlowId) {
        if (flowId === "root") {
          navigateTo("root", []);
        } else {
          navigateTo(flowId, [{ id: flowId, label: flowLabel }]);
        }
      }
      if (nodeIds.length === 0) return;
      const wanted = new Set(nodeIds);
      // Queued after the navigation above: React applies these updates in
      // order, so this runs against the flow that was just loaded.
      setNodes((nds) => nds.map((n) => ({ ...n, selected: wanted.has(n.id) })));
      setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
      requestAnimationFrame(() =>
        fitView({ nodes: nodeIds.map((id) => ({ id })), duration: 300, maxZoom: 1.2 })
      );
    },
    [currentFlowId, navigateTo, setNodes, setEdges, fitView]
  );

  const handleFocusIssue = useCallback(
    (issue: ValidationIssue) => focusInFlow(issue.flowId, issue.flowLabel, issue.nodeIds),
    [focusInFlow]
  );

  // --- unsaved-work draft (localStorage) ---------------------------------
  // Only written while there are unsaved changes, so anything found on load
  // is by definition work that never reached S3.
  useEffect(() => {
    // Never draft a proposal preview: it is a marked-up copy of a document the
    // user has not accepted, and restoring it in a later session would be
    // restoring the AI's suggestion as if it were their own work.
    if (!dirty || previewing) return;
    const timer = setTimeout(() => {
      setDraftFailed(!writeDraft(getWorkflowSnapshot()));
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dirty, previewing, getWorkflowSnapshot]);

  // Read once on mount. It cannot be a lazy useState initializer: localStorage
  // doesn't exist while the page is server-rendered, and seeding the banner
  // during the client's first render would then mismatch that HTML. Reading
  // client-only storage after mount is the intended pattern here, so the
  // set-state-in-effect rule is suppressed rather than worked around.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingDraft(readDraft());
  }, []);

  const handleRestoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    loadDocument(pendingDraft.doc);
    setPendingDraft(null);
    // Restored work is still unsaved: keep warning about it, and keep the
    // draft up to date as editing continues.
    setDirty(true);
  }, [pendingDraft, loadDocument]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
    setPendingDraft(null);
  }, []);

  const handleDownload = useCallback(() => {
    downloadWorkflow(getWorkflowSnapshot());
  }, [getWorkflowSnapshot]);

  const handleLoadFromLibrary = useCallback(
    (doc: WorkflowDocument) => {
      loadDocument(doc);
      setShowLibrary(false);
    },
    [loadDocument]
  );

  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;
      const isCanvasEmpty = nodes.length === 0 && Object.keys(flows).length === 0;
      if (!isCanvasEmpty) {
        const ok = await dialog.confirm({
          title: "テンプレートを読み込みますか？",
          message: "今キャンバスにある内容は置き換わります（Ctrl+Z で元に戻せます）。",
          confirmLabel: "読み込む",
        });
        if (!ok) return;
      }
      loadDocument(template.build());
    },
    [nodes, flows, loadDocument, dialog]
  );

  const handleClear = useCallback(async () => {
    const ok = await dialog.confirm({
      title: "キャンバスをクリアしますか？",
      message: "描いてある内容をすべて消します（Ctrl+Z で元に戻せます）。",
      confirmLabel: "クリアする",
      danger: true,
    });
    if (!ok) return;
    recordNow();
    suppressDirtyUntilRef.current = Date.now() + 800;
    setDirty(false);
    setNodes([]);
    setEdges([]);
    setFlows({});
    setCurrentFlowId("root");
    setBreadcrumb([]);
    setS3Id(undefined);
  }, [setNodes, setEdges, recordNow, dialog]);

  /**
   * One page per flow. A subflow can only be captured by putting it on the
   * live canvas, so this walks every flow through the editor - swapping the
   * nodes in, letting React Flow measure them, capturing - and puts the
   * user's own flow back at the end.
   *
   * Those swaps look exactly like edits, so the suppress window is held open
   * for the whole run: no undo steps, no dirty flag, no draft writes for
   * something the user did not do.
   */
  const handleExportPdf = useCallback(async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper || exporting || excelExporting) return;

    const { root, subflows } = snapshotAllFlows();
    const pages = collectFlowPages(name || "ワークフロー", root, subflows);
    const restore = { nodes, edges };

    setExporting({ done: 0, total: pages.length });
    try {
      const captured: PdfPage[] = [];
      for (const [index, page] of pages.entries()) {
        suppressDirtyUntilRef.current = Date.now() + 10_000;
        // Selection rings belong to editing, not to the printed document.
        setNodes(page.graph.nodes.map((n) => ({ ...n, selected: false })));
        setEdges(page.graph.edges.map((e) => ({ ...e, selected: false })));
        await settle();
        // Read the nodes back from the instance: these carry the measured
        // sizes that getNodesBounds needs, which the stored graph lacks.
        const measured = reactFlowInstance.getNodes();
        captured.push({
          title: page.title,
          blob: await captureFlowImage(wrapper, measured, reactFlowInstance),
        });
        setExporting({ done: index + 1, total: pages.length });
      }
      await exportPagesToPdf(captured, name);
    } catch (err) {
      toast.show(`PDF出力に失敗しました: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      suppressDirtyUntilRef.current = Date.now() + 1500;
      setNodes(restore.nodes);
      setEdges(restore.edges);
      setExporting(null);
      requestAnimationFrame(() => fitView({ duration: 200 }));
    }
  }, [
    exporting,
    excelExporting,
    snapshotAllFlows,
    name,
    nodes,
    edges,
    setNodes,
    setEdges,
    reactFlowInstance,
    fitView,
    toast,
  ]);

  /**
   * Same per-flow walk as handleExportPdf, but nothing is captured: each
   * sheet is drawn from the graph as native Excel shapes (exportExcel.ts), so
   * the recipient can move a step or retype a name in Excel itself.
   *
   * That is why this handler no longer swaps every flow through the live
   * canvas the way handleExportPdf does - there is no image to photograph, so
   * there is no need to mount each flow, wait for it to settle, and put the
   * editor back afterwards. Vertical orientation only (§3.9's Excel note):
   * lanes are columns there, which is what makes "one flow, one sheet" line
   * up without transposing anything.
   */
  const handleExportExcel = useCallback(async () => {
    if (exporting || excelExporting || orientation !== "vertical") return;

    const { root, subflows } = snapshotAllFlows();
    const pages: ExcelPage[] = collectFlowPages(name || "ワークフロー", root, subflows).map(
      (page) => ({ title: page.title, graph: page.graph })
    );

    setExcelExporting(true);
    try {
      await exportPagesToExcel(pages, lanes, orientation, name);
    } catch (err) {
      toast.show(`Excel出力に失敗しました: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setExcelExporting(false);
    }
  }, [exporting, excelExporting, orientation, lanes, snapshotAllFlows, name, toast]);

  const handleCopyImage = useCallback(async () => {
    if (!wrapperRef.current) return;
    try {
      const result = await copyFlowImageToClipboard(wrapperRef.current, nodes, reactFlowInstance);
      if (result === "copied") {
        toast.show("クリップボードにコピーしました", "success");
      } else {
        toast.show("クリップボードにコピーできなかったため、PNGをダウンロードしました", "info");
      }
    } catch (err) {
      toast.show(`画像の生成に失敗しました: ${err instanceof Error ? err.message : err}`, "error");
    }
  }, [nodes, reactFlowInstance, toast]);

  // Editor-wide shortcuts. Registered here, below every handler it calls: the
  // dependency array is evaluated during render, so referring to a handler
  // declared further down the component would hit its temporal dead zone.
  // Arrow-key nudging is not in here - React Flow moves the selected nodes
  // itself (5px, 20px with Shift) once a node has keyboard focus, which a
  // click gives it.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      // Every one of these acts on the document; while a proposal is on screen
      // the document on screen is not the user's (§3.20).
      if (previewing) return;
      // Inside a text field (the flow name, a label being edited) the browser's
      // own undo/copy/paste belong to the text, not to the diagram behind it.
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
        return;
      switch (event.key.toLowerCase()) {
        case "z":
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          break;
        case "y":
          event.preventDefault();
          redo();
          break;
        case "s":
          event.preventDefault();
          handleSave();
          break;
        case "c":
          event.preventDefault();
          handleCopy();
          break;
        case "v":
          event.preventDefault();
          handlePaste();
          break;
        case "d":
          event.preventDefault();
          handleDuplicate();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, handleSave, handleCopy, handlePaste, handleDuplicate, previewing]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Toolbar
        name={name}
        onNameChange={setName}
        orientation={orientation}
        onToggleOrientation={handleToggleOrientation}
        breadcrumb={breadcrumb}
        onBreadcrumbClick={handleBreadcrumbClick}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onAutoLayout={handleAutoLayout}
        onAlign={handleAlign}
        onDistribute={handleDistribute}
        selectedNodeCount={selectedNodes.length}
        onSelectTemplate={handleSelectTemplate}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        saving={saving}
        onDownload={handleDownload}
        onOpenLibrary={() => setShowLibrary(true)}
        onOpenHistory={() => setShowHistory(true)}
        canOpenHistory={s3Id !== undefined}
        onOpenLeadTime={() => setShowLeadTime(true)}
        onExportPdf={handleExportPdf}
        exporting={exporting}
        onExportExcel={handleExportExcel}
        excelExporting={excelExporting}
        canExportExcel={orientation === "vertical"}
        onCopyImage={handleCopyImage}
        onDeleteSelected={handleDeleteSelected}
        hasSelection={hasSelection}
        onClear={handleClear}
        previewing={previewing}
      />
      {preview && (
        <ProposalBanner
          summary={preview.result.summary}
          entries={preview.result.entries}
          skipped={preview.result.skipped}
          counts={preview.result.counts}
          onApply={handleApplyProposal}
          onCancel={handleDiscardProposal}
        />
      )}
      {pendingDraft && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>
            保存されていない編集がこのブラウザに残っています（
            {new Date(pendingDraft.savedAt).toLocaleString("ja-JP")} 時点・
            {pendingDraft.doc.name || "名称未設定"}）。
          </span>
          <button
            onClick={handleRestoreDraft}
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
          >
            復元する
          </button>
          <button
            onClick={handleDiscardDraft}
            className="rounded border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            破棄する
          </button>
        </div>
      )}
      {draftFailed && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          このブラウザに下書きを保存できませんでした（保存領域の上限か、ブラウザの設定による制限）。
          こまめに「保存」してください。
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          lanes={lanes}
          onAddLane={handleAddLane}
          onRenameLane={handleRenameLane}
          onRemoveLane={handleRemoveLane}
          onMoveLane={handleMoveLane}
          issues={issues}
          onFocusIssue={handleFocusIssue}
        />
        <div ref={wrapperRef} className="relative min-h-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          <LaneBackground lanes={lanes} orientation={orientation} />
          <OrientationContext.Provider value={orientation}>
            <SubflowNavContext.Provider value={{ openSubflow }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodesDelete={onNodesDelete}
                onConnect={onConnect}
                onEdgeDoubleClick={onEdgeDoubleClick}
                onNodeContextMenu={onNodeContextMenu}
                onEdgeContextMenu={onEdgeContextMenu}
                onPaneContextMenu={onPaneContextMenu}
                // Panning/zooming moves the canvas out from under an open
                // menu, and neither gesture necessarily starts with a
                // pointerdown (wheel zoom doesn't), so the menu's own
                // outside-click handler can't catch these.
                onMoveStart={() => {
                  closeContextMenu();
                  commitEdgeLabel();
                }}
                onNodeDragStart={closeContextMenu}
                // Read-only while a proposal is on screen: what is drawn is a
                // marked-up copy, so an edit made now would be discarded with
                // it (§3.20).
                nodesDraggable={!previewing}
                nodesConnectable={!previewing}
                deleteKeyCode={previewing ? null : ["Backspace", "Delete"]}
                nodeTypes={nodeTypes}
                // Belt-and-suspenders alongside the explicit `style` set on
                // every edge we create (see EDGE_STYLE in lib/types.ts) -
                // see that constant's comment for why this matters for
                // PDF/clipboard export specifically.
                defaultEdgeOptions={{ style: EDGE_STYLE }}
                fitView
                className="!bg-transparent"
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </SubflowNavContext.Provider>
          </OrientationContext.Provider>
          {edgeLabelEdit && (
            <input
              autoFocus
              value={edgeLabelEdit.value}
              onChange={(e) =>
                setEdgeLabelEdit((prev) => (prev ? { ...prev, value: e.target.value } : prev))
              }
              onBlur={commitEdgeLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdgeLabel();
                if (e.key === "Escape") setEdgeLabelEdit(null);
              }}
              style={{ left: edgeLabelEdit.x, top: edgeLabelEdit.y }}
              placeholder="線の名称（空欄で削除）"
              title="Enterで確定、Escapeで取り消し"
              className="absolute z-30 w-44 -translate-x-1/2 -translate-y-1/2 rounded border border-emerald-500 bg-white px-2 py-1 text-xs text-zinc-800 shadow outline-none"
            />
          )}
          {contextMenu && menuItems.length > 0 && (
            <FlowContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={menuItems}
              onClose={closeContextMenu}
            />
          )}
        </div>
        {detailNode && !previewing && (
          <NodeDetailsPanel
            key={detailNode.id}
            node={detailNode}
            onChange={handleNodeDetailChange}
            onClose={clearNodeSelection}
          />
        )}
        <ChatPanel
          getWorkflowSnapshot={getWorkflowSnapshot}
          onProposal={handleProposal}
          previewing={previewing}
        />
      </div>
      {showLibrary && (
        <WorkflowLibraryModal onClose={() => setShowLibrary(false)} onSelect={handleLoadFromLibrary} />
      )}
      {showHistory && s3Id && (
        <VersionHistoryModal
          workflowId={s3Id}
          onRestore={handleRestoreVersion}
          onClose={() => setShowHistory(false)}
        />
      )}
      {showLeadTime && (
        <LeadTimeModal
          results={leadTime}
          onFocusPath={(flowId, flowLabel, nodeIds) => {
            setShowLeadTime(false);
            focusInFlow(flowId, flowLabel, nodeIds);
          }}
          onClose={() => setShowLeadTime(false)}
        />
      )}
    </div>
  );
}
