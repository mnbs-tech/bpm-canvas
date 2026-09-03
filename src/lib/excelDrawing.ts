import { nodeFootprint } from "./autoLayout";
import { LANE_WIDTH } from "./types";
import type { Edge } from "@xyflow/react";
import type { FlowGraph, LaneData, NodeKind, WorkflowNode } from "./types";

/**
 * Builds the DrawingML (`xl/drawings/drawingN.xml`) for one flow: the lane
 * columns, one native Excel shape per node, and a connector per edge.
 *
 * Why this exists rather than pasting the canvas as a picture: a picture is
 * one flat object nobody can edit downstream. Recipients asked to be able to
 * move a step, retype a name, or extend the flow in Excel itself, which needs
 * every part to be a real shape (`xdr:sp` / `xdr:cxnSp`) with a preset
 * flowchart geometry.
 *
 * exceljs cannot write shapes - only images - so this module deliberately
 * produces raw XML that exportExcel.ts injects into the finished workbook.
 * Nothing here touches the DOM or exceljs, which keeps it a pure
 * graph -> string function that can be run (and eyeballed) outside a browser.
 */

/** Excel measures drawings in EMU; 914400 per inch / 96 px per inch. */
const EMU_PER_PX = 9525;

/** Canvas px -> sheet px. 1:1 keeps a node the same size it is on screen,
 * which is what makes the exported lanes line up with LANE_WIDTH below. */
const SCALE = 1;

const TITLE_HEIGHT = 34;
const LANE_HEADER_HEIGHT = 34;
/** Breathing room between the lane header and the first node, and around the
 * whole drawing. */
const PAD = 28;

/** Line thickness for shape outlines and connectors, in EMU (1pt = 12700). */
const LINE_WEIGHT = 12700;

/**
 * How each node kind is drawn in Excel. `prst` values are the standard
 * flowchart preset geometries every Excel build ships with ("基本図形" /
 * "フローチャート" in the shape gallery), so the result is a diagram a user
 * could have drawn by hand - not a bespoke freeform.
 *
 * Sizes are the shape's own footprint, which is *not* always the canvas
 * footprint from autoLayout (a diamond or a document needs more room for the
 * same text). Shapes are centred on the node's canvas centre, so a bigger
 * Excel shape grows around the same point and the layout still reads the
 * same. Fills mirror the on-screen colour per kind (src/components/nodes/),
 * because the colour *is* how a reader tells the kinds apart.
 */
interface ShapeSpec {
  prst: string;
  width: number;
  height: number;
  fill: string;
  line: string;
  text: string;
  bold?: boolean;
  /** Memo is prose, not a step label; everything else is centred. */
  align?: "ctr" | "l";
}

const SHAPES: Record<NodeKind, ShapeSpec> = {
  start: { prst: "flowChartTerminator", width: 130, height: 56, fill: "10B981", line: "059669", text: "FFFFFF", bold: true },
  end: { prst: "flowChartTerminator", width: 130, height: 56, fill: "F43F5E", line: "E11D48", text: "FFFFFF", bold: true },
  task: { prst: "flowChartProcess", width: 165, height: 64, fill: "E0F2FE", line: "0EA5E9", text: "0C4A6E" },
  approval: { prst: "flowChartManualOperation", width: 180, height: 66, fill: "CCFBF1", line: "0D9488", text: "134E4A" },
  document: { prst: "flowChartDocument", width: 165, height: 80, fill: "F1F5F9", line: "64748B", text: "1E293B" },
  notification: { prst: "roundRect", width: 165, height: 64, fill: "E0E7FF", line: "6366F1", text: "312E81" },
  wait: { prst: "flowChartDelay", width: 160, height: 64, fill: "FFEDD5", line: "F97316", text: "7C2D12" },
  database: { prst: "flowChartMagneticDisk", width: 150, height: 88, fill: "FEF3C7", line: "D97706", text: "78350F" },
  branch: { prst: "flowChartDecision", width: 180, height: 104, fill: "EDE9FE", line: "8B5CF6", text: "4C1D95" },
  subflow: { prst: "flowChartPredefinedProcess", width: 180, height: 78, fill: "EDE9FE", line: "8B5CF6", text: "4C1D95" },
  memo: { prst: "rect", width: 170, height: 82, fill: "FEF9C3", line: "FDE047", text: "713F12", align: "l" },
};

const FALLBACK_SHAPE: ShapeSpec = SHAPES.task;

const LANE_BAND_FILLS = ["FFFFFF", "F8FAFC"];
const LANE_BAND_LINE = "D4D4D8";
const LANE_HEADER_FILL = "E2E8F0";
const LANE_HEADER_LINE = "94A3B8";
const LANE_HEADER_TEXT = "334155";
const TITLE_TEXT = "0F172A";
const CONNECTOR_COLOR = "94A3B8";
const EDGE_LABEL_TEXT = "475569";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything one sheet's drawing needs. Kept separate from ExcelPage so this
 * module never sees a Blob or an exceljs worksheet. */
export interface DrawingInput {
  /** The flow's name, written as the drawing's title (and nowhere else). */
  title: string;
  graph: FlowGraph;
  lanes: LaneData[];
}

export function buildFlowDrawingXml({ title, graph, lanes }: DrawingInput): string {
  const nodes = graph.nodes ?? [];
  const laneCount = Math.max(lanes.length, 1);

  // Where each node's shape lands, in canvas coordinates, before the whole
  // drawing is translated below the title/lane headers.
  const placed = new Map<string, { rect: Rect; node: WorkflowNode; spec: ShapeSpec }>();
  for (const node of nodes) {
    const spec = SHAPES[node.type as NodeKind] ?? FALLBACK_SHAPE;
    const footprint = nodeFootprint(node.type);
    const centerX = node.position.x + footprint.width / 2;
    const centerY = node.position.y + footprint.height / 2;
    placed.set(node.id, {
      node,
      spec,
      rect: {
        x: centerX - spec.width / 2,
        y: centerY - spec.height / 2,
        width: spec.width,
        height: spec.height,
      },
    });
  }

  const rects = [...placed.values()].map((p) => p.rect);
  // A flow with no nodes still gets its lanes and title, so fall back to the
  // lane band's own extent rather than Infinity.
  const minX = rects.length ? Math.min(0, ...rects.map((r) => r.x)) : 0;
  const maxX = rects.length
    ? Math.max(laneCount * LANE_WIDTH, ...rects.map((r) => r.x + r.width))
    : laneCount * LANE_WIDTH;
  const minY = rects.length ? Math.min(...rects.map((r) => r.y)) : 0;
  const maxY = rects.length ? Math.max(...rects.map((r) => r.y + r.height)) : 200;

  const headerTop = TITLE_HEIGHT + 10;
  const bandTop = headerTop + LANE_HEADER_HEIGHT;
  const bandHeight = maxY - minY + PAD * 2;

  // Translation from canvas space to drawing space: x only shifts when a node
  // sits left of lane 0 (dragged out of the bands), y always shifts so the
  // topmost node clears the lane header.
  const tx = PAD - minX;
  const ty = bandTop + PAD - minY;

  const parts: string[] = [];
  let nextId = 2; // Excel numbers its own shapes from 2; keep out of its way.
  const id = () => nextId++;

  // Order is z-order: bands, then headers, then connectors, then nodes on
  // top of the lines they join, then labels, then the title.
  lanes.forEach((lane, i) => {
    parts.push(
      shapeXml({
        id: id(),
        name: `レーン背景 ${i + 1}`,
        prst: "rect",
        rect: { x: tx + i * LANE_WIDTH, y: bandTop, width: LANE_WIDTH, height: bandHeight },
        fill: LANE_BAND_FILLS[i % LANE_BAND_FILLS.length],
        line: LANE_BAND_LINE,
      })
    );
  });

  lanes.forEach((lane, i) => {
    parts.push(
      shapeXml({
        id: id(),
        name: `レーン見出し ${i + 1}`,
        prst: "rect",
        rect: { x: tx + i * LANE_WIDTH, y: headerTop, width: LANE_WIDTH, height: LANE_HEADER_HEIGHT },
        fill: LANE_HEADER_FILL,
        line: LANE_HEADER_LINE,
        text: lane.name,
        textColor: LANE_HEADER_TEXT,
        bold: true,
        fontSize: 1000,
      })
    );
  });

  for (const edge of graph.edges ?? []) {
    const from = placed.get(edge.source);
    const to = placed.get(edge.target);
    if (!from || !to) continue;
    parts.push(
      connectorXml({
        id: id(),
        name: `コネクタ ${edge.id}`,
        route: translateRoute(connectorPoints(from.rect, to.rect), tx, ty),
      })
    );
  }

  for (const { node, spec, rect } of placed.values()) {
    parts.push(
      shapeXml({
        id: id(),
        name: shapeName(`${node.data?.label || node.type || "図形"}`),
        prst: spec.prst,
        rect: { ...rect, x: rect.x + tx, y: rect.y + ty },
        fill: spec.fill,
        line: spec.line,
        // Only the step name goes in the shape - the details (担当者/所要時間…)
        // live on the companion 詳細 sheet, not inside the diagram.
        text: typeof node.data?.label === "string" ? node.data.label : "",
        textColor: spec.text,
        bold: spec.bold,
        align: spec.align,
        fontSize: 1000,
      })
    );
  }

  for (const edge of graph.edges ?? []) {
    const label = edgeLabel(edge);
    if (!label) continue;
    const from = placed.get(edge.source);
    const to = placed.get(edge.target);
    if (!from || !to) continue;
    const { start, end } = connectorPoints(from.rect, to.rect);
    const width = 78;
    const height = 22;
    parts.push(
      shapeXml({
        id: id(),
        name: `分岐ラベル ${edge.id}`,
        prst: "rect",
        rect: {
          x: (start.x + end.x) / 2 - width / 2 + tx,
          y: (start.y + end.y) / 2 - height / 2 + ty,
          width,
          height,
        },
        // A label sitting on top of its own line needs an opaque backing, but
        // a border would read as another box in the flow.
        fill: "FFFFFF",
        line: null,
        text: label,
        textColor: EDGE_LABEL_TEXT,
        fontSize: 900,
      })
    );
  }

  parts.push(
    shapeXml({
      id: id(),
      name: "フロー名",
      prst: "rect",
      rect: { x: tx, y: 0, width: Math.max(320, maxX - minX), height: TITLE_HEIGHT },
      fill: null,
      line: null,
      text: title,
      textColor: TITLE_TEXT,
      bold: true,
      fontSize: 1400,
      align: "l",
      textBox: true,
    })
  );

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    parts.join("") +
    "</xdr:wsDr>"
  );
}

/** Where a connector leaves one shape and meets the next, and which way it
 * leaves: "v" out of the top/bottom edge, "h" out of a side. The exit
 * direction decides how the elbow is drawn (see connectorXml). */
interface Route {
  start: { x: number; y: number };
  end: { x: number; y: number };
  axis: "v" | "h";
}

/**
 * The elbow's route is chosen so that `bentConnector3` can be used in its
 * native orientation, which is horizontal-vertical-horizontal: the line
 * always has to *leave and arrive sideways*.
 *
 * - The two shapes are clear of each other horizontally (any change of lane,
 *   since lanes are 320px apart and no shape is that wide): leave the source's
 *   near side, drop, and arrive at the target's facing side. This is the
 *   ordinary swimlane hand-off, and the elbow reads correctly.
 * - Otherwise they sit in the same column, so the line runs bottom to top. The
 *   preset's horizontal segments are then only as long as the small offset
 *   between the two centres - a straight drop with a slight jog, or exactly
 *   straight when the centres line up.
 *
 * Routing this way rather than rotating the connector is deliberate: a
 * rotated `bentConnector3` (the only way to get a vertical-horizontal-vertical
 * elbow out of the presets) put the lines nowhere near their shapes.
 */
function connectorPoints(from: Rect, to: Rect): Route {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  if (to.x > from.x + from.width) {
    return {
      start: { x: from.x + from.width, y: fromCenter.y },
      end: { x: to.x, y: toCenter.y },
      axis: "h",
    };
  }
  if (to.x + to.width < from.x) {
    return {
      start: { x: from.x, y: fromCenter.y },
      end: { x: to.x + to.width, y: toCenter.y },
      axis: "h",
    };
  }
  if (toCenter.y >= fromCenter.y) {
    return {
      start: { x: fromCenter.x, y: from.y + from.height },
      end: { x: toCenter.x, y: to.y },
      axis: "v",
    };
  }
  return {
    start: { x: fromCenter.x, y: from.y },
    end: { x: toCenter.x, y: to.y + to.height },
    axis: "v",
  };
}

/** Moves a route from canvas space into drawing space. */
function translateRoute(route: Route, tx: number, ty: number): Route {
  return {
    start: { x: route.start.x + tx, y: route.start.y + ty },
    end: { x: route.end.x + tx, y: route.end.y + ty },
    axis: route.axis,
  };
}

function edgeLabel(edge: Edge): string {
  return typeof edge.label === "string" ? edge.label.trim() : "";
}

interface ShapeArgs {
  id: number;
  name: string;
  prst: string;
  rect: Rect;
  fill: string | null;
  line: string | null;
  text?: string;
  textColor?: string;
  bold?: boolean;
  fontSize?: number;
  align?: "ctr" | "l";
  textBox?: boolean;
}

function shapeXml(args: ShapeArgs): string {
  const { x, y, width, height } = args.rect;
  const off = `<a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(width)}" cy="${emu(height)}"/>`;
  const fill = args.fill
    ? `<a:solidFill><a:srgbClr val="${args.fill}"/></a:solidFill>`
    : "<a:noFill/>";
  const line = args.line
    ? `<a:ln w="${LINE_WEIGHT}"><a:solidFill><a:srgbClr val="${args.line}"/></a:solidFill></a:ln>`
    : "<a:ln><a:noFill/></a:ln>";

  return (
    anchorOpen(x, y, width, height) +
    '<xdr:sp macro="" textlink="">' +
    "<xdr:nvSpPr>" +
    `<xdr:cNvPr id="${args.id}" name="${escapeXml(args.name)}"/>` +
    `<xdr:cNvSpPr${args.textBox ? ' txBox="1"' : ""}/>` +
    "</xdr:nvSpPr>" +
    "<xdr:spPr>" +
    `<a:xfrm>${off}</a:xfrm>` +
    `<a:prstGeom prst="${args.prst}"><a:avLst/></a:prstGeom>` +
    fill +
    line +
    "</xdr:spPr>" +
    textBodyXml(args) +
    "</xdr:sp>" +
    "<xdr:clientData/>" +
    "</xdr:twoCellAnchor>"
  );
}

function textBodyXml(args: ShapeArgs): string {
  const align = args.align ?? "ctr";
  // Shapes are a fixed size per kind (the lane has to stay tidy), so a long
  // 工程名 is made to fit by shrinking the text rather than by overflowing the
  // shape or being cut off: normAutofit is what Excel's own
  // "図形内でテキストを自動調整" writes.
  const body =
    '<a:bodyPr vertOverflow="clip" horzOverflow="clip" wrap="square"' +
    ' lIns="45720" tIns="27432" rIns="45720" bIns="27432" rtlCol="0" anchor="ctr">' +
    "<a:normAutofit/></a:bodyPr>";
  const text = args.text ?? "";
  if (!text) {
    return `<xdr:txBody>${body}<a:lstStyle/><a:p><a:pPr algn="${align}"/><a:endParaRPr lang="ja-JP"/></a:p></xdr:txBody>`;
  }

  const rPr =
    `<a:rPr kumimoji="1" lang="ja-JP" altLang="en-US" sz="${args.fontSize ?? 1000}"` +
    `${args.bold ? ' b="1"' : ""}>` +
    `<a:solidFill><a:srgbClr val="${args.textColor ?? "000000"}"/></a:solidFill>` +
    "</a:rPr>";

  // A label can carry newlines (memo text especially); each becomes its own
  // <a:p> because DrawingML has no in-run line break element that Excel and
  // LibreOffice agree on.
  const paragraphs = text
    .split(/\r?\n/)
    .map((chunk) => `<a:p><a:pPr algn="${align}"/><a:r>${rPr}<a:t>${escapeXml(chunk)}</a:t></a:r></a:p>`)
    .join("");

  return `<xdr:txBody>${body}<a:lstStyle/>${paragraphs}</xdr:txBody>`;
}

/**
 * One elbow ("カギ線") connector, as `bentConnector3`.
 *
 * The preset's path is fixed and starts at the box's top-left: horizontally
 * to the bend, then vertically, then horizontally to the bottom-right. Every
 * other direction is a flip of that one path, so the box is just the
 * rectangle spanned by the two endpoints, flipped when the line runs right to
 * left or bottom to top. No rotation is involved - connectorPoints picks a
 * route this orientation can actually draw.
 */
function connectorXml(args: { id: number; name: string; route: Route }): string {
  const { start, end } = args.route;
  const box = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
  const flipH = end.x < start.x ? ' flipH="1"' : "";
  const flipV = end.y < start.y ? ' flipV="1"' : "";

  return (
    anchorOpen(box.x, box.y, box.width, box.height) +
    '<xdr:cxnSp macro="">' +
    "<xdr:nvCxnSpPr>" +
    `<xdr:cNvPr id="${args.id}" name="${escapeXml(shapeName(args.name))}"/>` +
    "<xdr:cNvCxnSpPr/>" +
    "</xdr:nvCxnSpPr>" +
    "<xdr:spPr>" +
    `<a:xfrm${flipH}${flipV}><a:off x="${emu(box.x)}" y="${emu(box.y)}"/>` +
    `<a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm>` +
    '<a:prstGeom prst="bentConnector3">' +
    '<a:avLst><a:gd name="adj1" fmla="val 50000"/></a:avLst>' +
    "</a:prstGeom>" +
    `<a:ln w="${LINE_WEIGHT}"><a:solidFill><a:srgbClr val="${CONNECTOR_COLOR}"/></a:solidFill>` +
    '<a:tailEnd type="triangle" w="med" len="med"/></a:ln>' +
    "</xdr:spPr>" +
    "</xdr:cxnSp>" +
    "<xdr:clientData/>" +
    "</xdr:twoCellAnchor>"
  );
}

/**
 * Default sheet grid, in px: a 15pt row is exactly 20px at 96dpi, and 8.43
 * characters (Excel's default column width for Calibri 11) is 64px. The
 * export never changes either, so these hold.
 */
const COL_PX = 64;
const ROW_PX = 20;

/**
 * Opens a twoCellAnchor spanning the shape's rectangle.
 *
 * It must be a *two*-cell anchor with real row/column indices. A oneCellAnchor
 * pinned to A1 carrying the whole position in `colOff`/`rowOff` renders
 * correctly in LibreOffice but **not in Excel**, which collapses those
 * out-of-range offsets back toward the origin: shapes keep their size but pile
 * up in the top-left corner. Excel only ever writes offsets that fall inside
 * the anchor cell, so that is what is written here.
 *
 * Sizing the shape from the anchor (rather than a fixed `ext`) also keeps the
 * drawing coherent if a reader's grid is not exactly 64x20px: positions and
 * sizes then scale together instead of drifting apart.
 */
function anchorOpen(x: number, y: number, width: number, height: number): string {
  return (
    "<xdr:twoCellAnchor>" +
    `<xdr:from>${cellRef(x, y)}</xdr:from>` +
    `<xdr:to>${cellRef(x + width, y + height)}</xdr:to>`
  );
}

/** A point in px as the cell containing it plus the offset within that cell. */
function cellRef(x: number, y: number): string {
  const col = Math.max(0, Math.floor(x / COL_PX));
  const row = Math.max(0, Math.floor(y / ROW_PX));
  return (
    `<xdr:col>${col}</xdr:col><xdr:colOff>${emu(x - col * COL_PX)}</xdr:colOff>` +
    `<xdr:row>${row}</xdr:row><xdr:rowOff>${emu(y - row * ROW_PX)}</xdr:rowOff>`
  );
}

function emu(px: number): number {
  return Math.max(0, Math.round(px * SCALE * EMU_PER_PX));
}

/**
 * A shape's `name` attribute (what Excel lists in the selection pane).
 *
 * It is built from the step's label, and a label is free text that routinely
 * contains newlines - which **made Excel offer to repair the file** on open.
 * XML normalises a raw newline inside an attribute value rather than
 * rejecting it, so the file parses and LibreOffice opens it happily; Excel
 * does not accept one here. Collapse all whitespace, drop control characters,
 * and cap the length.
 */
function shapeName(label: string): string {
  const cleaned = label
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "図形").slice(0, 200);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
