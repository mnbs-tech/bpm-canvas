import { computeRanks, laneIndexOfNode } from "./autoLayout";
import { buildFlowDrawingXml } from "./excelDrawing";
import { NODE_PALETTE } from "./nodeDefs";
import { hasNodeDetails, NODE_DETAIL_FIELDS } from "./types";
import type { FlowGraph, LaneData, LaneOrientation, NodeKind } from "./types";

/** One flow's worksheet: the title shown on the sheet and in the drawing,
 * plus the graph both the drawing and the 詳細 sheet are built from. No
 * bitmap is involved any more - see the note on exportPagesToExcel. */
export interface ExcelPage {
  title: string;
  graph: FlowGraph;
}

const KIND_LABEL: Partial<Record<NodeKind, string>> = Object.fromEntries(
  NODE_PALETTE.map((p) => [p.kind, p.label])
);

/** Suffix for a flow's companion table sheet. */
const DETAIL_SUFFIX = "_詳細";

/**
 * Writes one sheet per flow (root first, then every subflow - the same set
 * collectFlowPages in WorkflowEditor.tsx builds for PDF export), each holding
 * the flow drawn as **native Excel shapes**: vertical lanes as columns, one
 * preset flowchart shape per step, and a connector per edge. Only the step
 * name and the flow name are written into the drawing.
 *
 * This used to paste the canvas capture as a picture. A picture cannot be
 * edited by whoever receives the file - they could not move a step, retype a
 * name, or extend the flow - so the diagram is now rebuilt from the graph as
 * real shapes. Consequences worth knowing:
 *
 * - No capture is needed, so the export no longer swaps each flow into the
 *   live canvas and waits for it to settle. It is a pure data transform.
 * - Edge routing is straight lines between shape borders rather than the
 *   canvas's bezier curves (see connectorPoints in excelDrawing.ts).
 * - exceljs has no shape API, so the drawing XML is injected into the
 *   workbook it produces (injectDrawings below).
 *
 * A flow whose nodes carry 詳細 (SPEC §3.13) also gets a "<name>_詳細" sheet
 * with the node table; a flow with no details filled in gets only its diagram.
 *
 * Vertical orientation only - lanes are columns there, which is what makes
 * "one flow, one readable sheet" a natural fit. Callers gate the button on
 * `doc.orientation === "vertical"`; this function trusts that gate.
 */
export async function exportPagesToExcel(
  pages: ExcelPage[],
  lanes: LaneData[],
  orientation: LaneOrientation,
  fileName: string
): Promise<void> {
  const buffer = await buildWorkbookBuffer(pages, lanes, orientation);
  downloadBuffer(buffer, `${fileName || "workflow"}.xlsx`);
}

/**
 * The whole workbook as bytes, with no browser APIs involved - everything
 * exportPagesToExcel does except handing the file to the user. Split out so
 * the .xlsx can be generated and opened outside a browser when checking that
 * Excel accepts the shapes (this repo has no test runner; see CLAUDE.md).
 */
export async function buildWorkbookBuffer(
  pages: ExcelPage[],
  lanes: LaneData[],
  orientation: LaneOrientation
): Promise<ArrayBuffer> {
  if (pages.length === 0) throw new Error("出力する図がありません");

  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set<string>();

  /** Sheet name -> the drawing XML that sheet must end up carrying. Collected
   * here and injected after exceljs has written the file, since exceljs
   * itself cannot hold shapes. */
  const drawings = new Map<string, string>();

  for (const page of pages) {
    const sheetName = uniqueSheetName(page.title, usedNames);
    const sheet = workbook.addWorksheet(sheetName);
    // Gridlines behind a shape diagram read as graph paper; the lane bands
    // are the only structure the diagram wants.
    sheet.views = [{ showGridLines: false }];
    // Printing a swimlane chart, the one thing that must not be cut is the
    // set of lanes - so fit the width to one page and let a long flow run
    // onto further pages downwards (fitToHeight 0 = as many as it needs).
    sheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    drawings.set(sheetName, buildFlowDrawingXml({ title: page.title, graph: page.graph, lanes }));

    const rows = detailRows(page.graph, lanes, orientation);
    if (rows.length > 0) {
      const detailSheet = workbook.addWorksheet(
        uniqueSheetName(withSuffix(page.title, DETAIL_SUFFIX), usedNames)
      );
      buildNodeTable(detailSheet, rows);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return injectDrawings(buffer, drawings);
}

interface DetailRow {
  kind: string;
  lane: string;
  label: string;
  values: string[];
}

/**
 * The flow's nodes in process order, for the companion table. Row order is
 * the same rank the canvas's 自動整列 uses (autoLayout.ts's longest path), so
 * the table reads in the same order the diagram runs. Nodes with no 詳細
 * filled in are dropped: the table exists to carry what the shapes cannot,
 * and an all-blank row carries nothing.
 */
function detailRows(
  graph: FlowGraph,
  lanes: LaneData[],
  orientation: LaneOrientation
): DetailRow[] {
  const nodes = (graph.nodes ?? []).filter((n) => n.type !== "memo");
  const laneCount = Math.max(lanes.length, 1);
  const ids = new Set(nodes.map((n) => n.id));
  const rank = computeRanks(nodes, graph.edges ?? [], ids);
  const laneIndexOf = (n: (typeof nodes)[number]) => laneIndexOfNode(n, laneCount, orientation);

  return [...nodes]
    .sort((a, b) => {
      const byRank = (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
      return byRank !== 0 ? byRank : laneIndexOf(a) - laneIndexOf(b);
    })
    .filter((node) => hasNodeDetails(node.data))
    .map((node) => ({
      kind: KIND_LABEL[node.type as NodeKind] ?? node.type ?? "",
      lane: lanes[laneIndexOf(node)]?.name ?? "",
      label: node.data?.label ?? "",
      values: NODE_DETAIL_FIELDS.map((f) => {
        const v = node.data?.[f.key];
        return typeof v === "string" ? v : "";
      }),
    }));
}

function buildNodeTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exceljs's Worksheet type isn't imported statically (the module itself is dynamic-imported to stay out of the server bundle)
  sheet: any,
  rows: DetailRow[]
) {
  const headers = ["種別", "レーン", "工程名", ...NODE_DETAIL_FIELDS.map((f) => f.label)];
  const headerRow = sheet.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
  });

  rows.forEach((row, i) => {
    const target = sheet.getRow(2 + i);
    [row.kind, row.lane, row.label, ...row.values].forEach((v, ci) => {
      const cell = target.getCell(ci + 1);
      cell.value = v;
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });

  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 22;
  NODE_DETAIL_FIELDS.forEach((_, i) => {
    sheet.getColumn(4 + i).width = 26;
  });
}

/**
 * Adds the drawing parts exceljs cannot write to the workbook it just wrote.
 *
 * For each sheet that has a drawing: writes `xl/drawings/drawingN.xml`,
 * relates it from that sheet's `_rels`, adds the `<drawing r:id=…/>` element
 * to the sheet, and declares the part in `[Content_Types].xml`. Sheets are
 * located through `xl/workbook.xml` + its rels rather than by assuming
 * `sheet1.xml` is the first sheet, because that mapping is exceljs's to make.
 *
 * The XML is patched as strings: these are parts this same call generated
 * moments earlier with a known, narrow shape, so a full XML parse would buy
 * nothing. `<drawing>` goes immediately before `</worksheet>`, which is where
 * the schema puts it for a sheet with no tableParts/extLst - and exceljs
 * writes neither for the sheets built here.
 */
async function injectDrawings(
  buffer: ArrayBuffer,
  drawings: Map<string, string>
): Promise<ArrayBuffer> {
  if (drawings.size === 0) return buffer;

  const mod = await import("jszip");
  const JSZip = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const zip = await JSZip.loadAsync(buffer);

  const workbookXml = await readEntry(zip, "xl/workbook.xml");
  const workbookRels = await readEntry(zip, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRels) return buffer;

  const relTargets = new Map<string, string>();
  for (const m of workbookRels.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const relId = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (relId && target) relTargets.set(relId, target);
  }

  const contentTypeOverrides: string[] = [];
  let drawingIndex = 0;

  for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = decodeXml(attr(m[0], "name") ?? "");
    const drawingXml = drawings.get(name);
    if (!drawingXml) continue;

    const relId = attr(m[0], "r:id");
    const target = relId ? relTargets.get(relId) : undefined;
    if (!target) continue;

    // Targets are workbook-relative ("worksheets/sheet1.xml").
    const sheetPath = `xl/${target.replace(/^\/?(xl\/)?/, "")}`;
    const sheetXml = await readEntry(zip, sheetPath);
    if (!sheetXml || !sheetXml.includes("</worksheet>")) continue;

    drawingIndex += 1;
    const drawingPath = `xl/drawings/drawing${drawingIndex}.xml`;
    zip.file(drawingPath, drawingXml);
    contentTypeOverrides.push(
      `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    );

    const sheetFile = sheetPath.slice(sheetPath.lastIndexOf("/") + 1);
    const relsPath = `${sheetPath.slice(0, sheetPath.lastIndexOf("/"))}/_rels/${sheetFile}.rels`;
    const existingRels = await readEntry(zip, relsPath);
    const newRelId = nextRelId(existingRels);
    const relationship =
      `<Relationship Id="${newRelId}"` +
      ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"' +
      ` Target="../drawings/drawing${drawingIndex}.xml"/>`;
    zip.file(
      relsPath,
      existingRels
        ? existingRels.replace("</Relationships>", `${relationship}</Relationships>`)
        : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            relationship +
            "</Relationships>"
    );

    zip.file(
      sheetPath,
      sheetXml.replace("</worksheet>", `<drawing r:id="${newRelId}"/></worksheet>`)
    );
  }

  if (contentTypeOverrides.length > 0) {
    const types = await readEntry(zip, "[Content_Types].xml");
    if (types) {
      zip.file(
        "[Content_Types].xml",
        types.replace("</Types>", `${contentTypeOverrides.join("")}</Types>`)
      );
    }
  }

  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jszip is dynamic-imported, so its types aren't available statically
async function readEntry(zip: any, path: string): Promise<string | null> {
  const file = zip.file(path);
  return file ? file.async("string") : null;
}

/** Reads one attribute out of a single start tag. Names here are literals
 * ("name", "Id", "r:id") - none of them need regex escaping. */
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** A relationship id not already used in that sheet's rels part. */
function nextRelId(relsXml: string | null): string {
  if (!relsXml) return "rId1";
  const used = new Set<number>();
  for (const m of relsXml.matchAll(/Id="rId(\d+)"/g)) used.add(Number(m[1]));
  let n = 1;
  while (used.has(n)) n += 1;
  return `rId${n}`;
}

/** Excel sheet names: max 31 chars, no \ / ? * [ ] : , and unique within the
 * workbook - collectFlowPages's titles ("親 › 子") can collide once
 * truncated, hence the numeric suffix fallback. */
function sanitizeSheetName(title: string): string {
  const cleaned = title.replace(/[\\/?*[\]:]/g, " ").trim();
  return (cleaned || "シート").slice(0, 31);
}

/** Appends a suffix while staying inside Excel's 31-character sheet-name
 * limit, trimming the name rather than the suffix so "…_詳細" stays legible. */
function withSuffix(title: string, suffix: string): string {
  const base = sanitizeSheetName(title);
  return `${base.slice(0, 31 - suffix.length)}${suffix}`;
}

function uniqueSheetName(title: string, used: Set<string>): string {
  const base = sanitizeSheetName(title);
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    const marker = `_${suffix}`;
    name = `${base.slice(0, 31 - marker.length)}${marker}`;
    suffix += 1;
  }
  used.add(name);
  return name;
}

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
