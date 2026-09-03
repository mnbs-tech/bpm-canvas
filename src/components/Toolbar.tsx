"use client";

import { useEffect, useRef, useState } from "react";
import AppInfoMenu from "./AppInfoMenu";
import { useDropdownPlacement } from "@/lib/dropdownPlacement";
import { WORKFLOW_TEMPLATES } from "@/lib/templates";
import type { AlignMode, DistributeMode } from "@/lib/alignNodes";
import type { LaneOrientation } from "@/lib/types";

interface BreadcrumbItem {
  id: string;
  label: string;
}

interface ToolbarProps {
  name: string;
  onNameChange: (name: string) => void;
  orientation: LaneOrientation;
  onToggleOrientation: () => void;
  breadcrumb: BreadcrumbItem[];
  onBreadcrumbClick: (index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAutoLayout: () => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (mode: DistributeMode) => void;
  /** Drives which entries of the 整列 menu are usable: aligning needs two
   * nodes, spacing them evenly needs three. */
  selectedNodeCount: number;
  onSelectTemplate: (id: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  saving: boolean;
  onDownload: () => void;
  onOpenLibrary: () => void;
  onOpenHistory: () => void;
  /** False until the flow has been saved once - there is no history to show
   * for something that has never reached S3. */
  canOpenHistory: boolean;
  onOpenLeadTime: () => void;
  onExportPdf: () => void;
  /** Progress of a running PDF export, or null when idle. */
  exporting: { done: number; total: number } | null;
  onExportExcel: () => void;
  /** True while the Excel file is being built. No page counter, unlike PDF:
   * the shapes are written straight from the graph, with no per-flow capture
   * to count through. */
  excelExporting: boolean;
  /** False when orientation is not "vertical" - lanes need to be columns for
   * a flow to line up on a sheet as one flow, one readable sheet. */
  canExportExcel: boolean;
  onCopyImage: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  onClear: () => void;
  /** True while an AI proposal is being previewed. Everything that would edit,
   * save or export the document is disabled: what is on the canvas then is a
   * marked-up copy, not the user's document (§3.20). */
  previewing: boolean;
}

export default function Toolbar({
  name,
  onNameChange,
  orientation,
  onToggleOrientation,
  breadcrumb,
  onBreadcrumbClick,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAutoLayout,
  onAlign,
  onDistribute,
  selectedNodeCount,
  onSelectTemplate,
  onSave,
  onSaveAs,
  saving,
  onDownload,
  onOpenLibrary,
  onOpenHistory,
  canOpenHistory,
  onOpenLeadTime,
  onExportPdf,
  exporting,
  onExportExcel,
  excelExporting,
  canExportExcel,
  onCopyImage,
  onDeleteSelected,
  hasSelection,
  onClear,
  previewing,
}: ToolbarProps) {
  const [openMenu, setOpenMenu] = useState<"save" | "align" | null>(null);
  // Both menus hang off buttons that move as the toolbar wraps on a narrow
  // screen, so each is kept inside the window rather than trusting its class.
  // Destructured rather than held as objects: reading `menu.anchorRef` in the
  // JSX counts as accessing a ref during render (react-hooks/refs).
  const {
    anchorRef: alignAnchorRef,
    menuRef: alignMenuRef,
    style: alignMenuStyle,
  } = useDropdownPlacement(openMenu === "align", "left");
  const {
    anchorRef: saveAnchorRef,
    menuRef: saveMenuRef,
    style: saveMenuStyle,
  } = useDropdownPlacement(openMenu === "save", "right");
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    // Capture phase: React Flow's pane stops mousedown from propagating (it
    // drives panning with it), so a bubble-phase listener on window never
    // sees clicks on the canvas and the menu would stay open over the canvas.
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [openMenu]);

  const alignEntries: { label: string; run: () => void; needs: number }[] = [
    { label: "左揃え", run: () => onAlign("left"), needs: 2 },
    { label: "右揃え", run: () => onAlign("right"), needs: 2 },
    { label: "上揃え", run: () => onAlign("top"), needs: 2 },
    { label: "下揃え", run: () => onAlign("bottom"), needs: 2 },
    { label: "左右中央に揃える", run: () => onAlign("center-x"), needs: 2 },
    { label: "上下中央に揃える", run: () => onAlign("center-y"), needs: 2 },
    { label: "横に等間隔", run: () => onDistribute("horizontal"), needs: 3 },
    { label: "縦に等間隔", run: () => onDistribute("vertical"), needs: 3 },
  ];

  return (
    <header
      ref={headerRef}
      className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2"
    >
      <h1 className="mr-2 text-sm font-semibold text-zinc-800">ワークフロービルダー</h1>
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={previewing}
        className="min-w-32 flex-1 rounded border border-zinc-200 px-2 py-1 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
        placeholder="ワークフロー名"
      />

      {breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-zinc-500">
          <button onClick={() => onBreadcrumbClick(-1)} className="hover:underline">
            ルート
          </button>
          {breadcrumb.map((b, i) => (
            <span key={b.id} className="flex items-center gap-1">
              <span>›</span>
              <button
                onClick={() => onBreadcrumbClick(i)}
                className={i === breadcrumb.length - 1 ? "font-semibold text-zinc-800" : "hover:underline"}
              >
                {b.label}
              </button>
            </span>
          ))}
        </nav>
      )}

      <fieldset disabled={previewing} className="contents">
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded border border-zinc-300 text-sm font-medium">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent"
              title="元に戻す (Ctrl+Z)"
            >
              ↶
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="border-l border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent"
              title="やり直す (Ctrl+Shift+Z)"
            >
              ↷
            </button>
          </div>

          <div className="flex items-center overflow-hidden rounded border border-zinc-300 text-sm font-medium">
            <button
              onClick={() => orientation !== "horizontal" && onToggleOrientation()}
              className={`px-3 py-1.5 ${
                orientation === "horizontal"
                  ? "bg-zinc-800 text-white"
                  : "bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
              title="レーンを横長の帯として上下に並べ、工程を左→右に流す"
            >
              横
            </button>
            <button
              onClick={() => orientation !== "vertical" && onToggleOrientation()}
              className={`border-l border-zinc-300 px-3 py-1.5 ${
                orientation === "vertical"
                  ? "bg-zinc-800 text-white"
                  : "bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
              title="レーンを縦長の帯として左右に並べ、工程を上→下に流す"
            >
              縦
            </button>
          </div>

          <button
            onClick={onAutoLayout}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            title="レーンは維持したまま、工程の流れに沿って自動整列する"
          >
            自動整列
          </button>

          <div ref={alignAnchorRef} className="relative flex items-center">
            <button
              onClick={() => setOpenMenu((v) => (v === "align" ? null : "align"))}
              disabled={selectedNodeCount < 2}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent"
              title="選択した2つ以上の部品の位置を揃える／等間隔に並べる"
              aria-expanded={openMenu === "align"}
            >
              整列▾
            </button>
            {openMenu === "align" && (
              <div
                ref={alignMenuRef}
                style={alignMenuStyle}
                className="absolute left-0 top-full z-20 mt-1 w-48 rounded border border-zinc-200 bg-white py-1 shadow-lg"
              >
                {alignEntries.map((entry) => (
                  <button
                    key={entry.label}
                    onClick={() => {
                      setOpenMenu(null);
                      entry.run();
                    }}
                    disabled={selectedNodeCount < entry.needs}
                    className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent"
                    title={
                      selectedNodeCount < entry.needs
                        ? `部品を${entry.needs}つ以上選んでください`
                        : undefined
                    }
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onSelectTemplate(e.target.value);
              e.target.value = "";
            }}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700"
            title="定型フローから作成"
          >
            <option value="" disabled>
              テンプレート▾
            </option>
            {WORKFLOW_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id} title={t.description}>
                {t.name}
              </option>
            ))}
          </select>

          <div ref={saveAnchorRef} className="relative flex items-center">
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-l bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              title="同じフローに上書き保存する (Ctrl+S)"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              onClick={() => setOpenMenu((v) => (v === "save" ? null : "save"))}
              disabled={saving}
              className="rounded-r border-l border-emerald-700 bg-emerald-600 px-2 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              title="保存の種類を選ぶ"
              aria-expanded={openMenu === "save"}
            >
              ▾
            </button>
            {openMenu === "save" && (
              <div
                ref={saveMenuRef}
                style={saveMenuStyle}
                className="absolute right-0 top-full z-20 mt-1 w-56 rounded border border-zinc-200 bg-white py-1 shadow-lg"
              >
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onSaveAs();
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                >
                  名前を付けて保存…
                  <span className="block text-xs text-zinc-400">別のフローとして新しく保存します</span>
                </button>
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenHistory();
                  }}
                  disabled={!canOpenHistory}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  title={canOpenHistory ? undefined : "一度保存すると履歴が残ります"}
                >
                  保存履歴…
                  <span className="block text-xs text-zinc-400">過去の保存内容に戻せます</span>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onOpenLibrary}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            開く
          </button>
          <button
            onClick={onOpenLeadTime}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            title="所要時間欄から、開始から終了までのリードタイムを集計します"
          >
            リードタイム
          </button>
          <button
            onClick={onDownload}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            title="現在のワークフローをJSONファイルとしてローカルに保存"
          >
            ローカル保存
          </button>
          <button
            onClick={onExportPdf}
            disabled={exporting !== null}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
            title="ルートフローとすべてのサブフローを、1ページずつPDFに書き出す"
          >
            {exporting ? `PDF出力中… ${exporting.done}/${exporting.total}` : "PDF出力"}
          </button>
          <button
            onClick={onExportExcel}
            disabled={excelExporting || !canExportExcel}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
            title={
              canExportExcel
                ? "ルートフローとすべてのサブフローを、Excelの図形（縦レーン＋基本図形）としてシート1枚ずつ書き出す"
                : "レーンが「縦」のときだけ書き出せます（ツールバーの 横／縦 で切り替え）"
            }
          >
            {excelExporting ? "Excel出力中…" : "Excel出力"}
          </button>
          <button
            onClick={onCopyImage}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            画像コピー
          </button>
          <button
            onClick={onDeleteSelected}
            disabled={!hasSelection}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-700"
            title="選択した部品・線を削除（部品・線を右クリック、またはBackspace/Deleteキーでも削除できます）"
          >
            選択削除
          </button>
          <button
            onClick={onClear}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600"
          >
            クリア
          </button>
        </div>
      </fieldset>

      <AppInfoMenu onOpen={() => setOpenMenu(null)} />
    </header>
  );
}
