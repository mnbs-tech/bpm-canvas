import { getNodesBounds, getViewportForBounds, useReactFlow, type Edge, type Viewport } from "@xyflow/react";
import type { WorkflowNode } from "./types";

// @xyflow/react doesn't export the ReactFlowInstance type from its public
// entrypoint, so derive it from the hook that returns it.
type ReactFlowInstance = ReturnType<typeof useReactFlow<WorkflowNode, Edge>>;

// getViewportForBounds's padding treats a bare number as a *fraction* of
// the viewport (padding=60 means ~4900% - i.e. almost the entire frame -
// not 60px), which crushed the computed zoom to near-zero and produced a
// tiny, mostly-blank capture. A "px" string is required for an actual
// fixed-pixel margin.
const PADDING = "60px";

/**
 * Snaps the live canvas to a viewport that frames every node (not just what
 * currently happens to be on screen), captures it as a PNG blob, then
 * restores the original viewport. LaneBackground reads the same live
 * useViewport() the canvas uses, so it stays aligned with the nodes in the
 * capture without any separate handling.
 */
export async function captureFlowImage(
  wrapperEl: HTMLElement,
  nodes: WorkflowNode[],
  flow: ReactFlowInstance
): Promise<Blob> {
  const { toBlob } = await import("html-to-image");

  const bounds = getNodesBounds(nodes);
  const rect = wrapperEl.getBoundingClientRect();
  const targetViewport: Viewport = getViewportForBounds(
    bounds,
    rect.width,
    rect.height,
    0.1,
    2,
    PADDING
  );

  const originalViewport = flow.getViewport();
  flow.setViewport(targetViewport, { duration: 0 });
  // Hides the zoom buttons, minimap and attribution for the capture only -
  // see the .exporting rules in globals.css.
  wrapperEl.classList.add("exporting");
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    const blob = await toBlob(wrapperEl, { backgroundColor: "#ffffff", pixelRatio: 2 });
    if (!blob) throw new Error("画像の生成に失敗しました");
    return blob;
  } finally {
    wrapperEl.classList.remove("exporting");
    flow.setViewport(originalViewport, { duration: 0 });
  }
}

/** One captured flow: the image plus the heading to print above it. */
export interface PdfPage {
  /** e.g. "見積フロー" or "見積フロー › 再見積" */
  title: string;
  blob: Blob;
}

const TITLE_STRIP_HEIGHT = 64;

/**
 * Renders the page heading through a canvas rather than jsPDF's text API.
 * jsPDF's built-in fonts are Latin-only, so Japanese titles come out as
 * garbage; the browser can draw them, and the result composites into the
 * page like any other image.
 */
function renderTitleStrip(title: string, width: number): string {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = TITLE_STRIP_HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, TITLE_STRIP_HEIGHT);
  ctx.fillStyle = "#18181b";
  ctx.font = '600 22px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText(title, 24, TITLE_STRIP_HEIGHT / 2, width - 48);
  ctx.strokeStyle = "#e4e4e7";
  ctx.beginPath();
  ctx.moveTo(0, TITLE_STRIP_HEIGHT - 1);
  ctx.lineTo(width, TITLE_STRIP_HEIGHT - 1);
  ctx.stroke();
  return canvas.toDataURL("image/png");
}

/**
 * Writes one page per captured flow - the root flow first, then every
 * subflow. Capturing a subflow means loading it into the live canvas, which
 * only the editor can do, so the caller hands over already-captured pages.
 *
 * Page size follows the first page's image; the rest are scaled to fit it, so
 * a document of differently-shaped flows still prints as one consistent PDF.
 */
export async function exportPagesToPdf(pages: PdfPage[], fileName: string): Promise<void> {
  if (pages.length === 0) throw new Error("出力する図がありません");

  const images = await Promise.all(
    pages.map(async (page) => {
      const dataUrl = await blobToDataUrl(page.blob);
      return { ...page, dataUrl, dims: await imageDimensions(dataUrl) };
    })
  );

  const pageWidth = images[0].dims.width;
  const pageHeight = images[0].dims.height + TITLE_STRIP_HEIGHT;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: pageWidth >= pageHeight ? "landscape" : "portrait",
    unit: "px",
    format: [pageWidth, pageHeight],
  });

  images.forEach((image, index) => {
    if (index > 0) doc.addPage([pageWidth, pageHeight], pageWidth >= pageHeight ? "landscape" : "portrait");

    const strip = renderTitleStrip(image.title, pageWidth);
    if (strip) doc.addImage(strip, "PNG", 0, 0, pageWidth, TITLE_STRIP_HEIGHT);

    // Fit inside the remaining area without distorting the diagram.
    const areaHeight = pageHeight - TITLE_STRIP_HEIGHT;
    const scale = Math.min(pageWidth / image.dims.width, areaHeight / image.dims.height);
    const drawWidth = image.dims.width * scale;
    const drawHeight = image.dims.height * scale;
    doc.addImage(
      image.dataUrl,
      "PNG",
      (pageWidth - drawWidth) / 2,
      TITLE_STRIP_HEIGHT + (areaHeight - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  });

  doc.save(`${fileName || "workflow"}.pdf`);
}

export async function copyFlowImageToClipboard(
  wrapperEl: HTMLElement,
  nodes: WorkflowNode[],
  flow: ReactFlowInstance
): Promise<"copied" | "downloaded"> {
  const blob = await captureFlowImage(wrapperEl, nodes, flow);

  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      throw new Error("Clipboard API unsupported");
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copied";
  } catch {
    downloadBlob(blob, "workflow.png");
    return "downloaded";
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exported for exportExcel.ts, which embeds the same captured PNGs as
 * pictures on their flow's sheet and needs their pixel size to place them. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
}

export function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("画像サイズの取得に失敗しました"));
    img.src = dataUrl;
  });
}
