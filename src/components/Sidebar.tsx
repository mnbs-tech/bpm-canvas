"use client";

import { useState, type DragEvent } from "react";
import { NODE_PALETTE, DRAG_DATA_FORMAT } from "@/lib/nodeDefs";
import type { LaneData } from "@/lib/types";
import type { IssueSeverity, ValidationIssue } from "@/lib/validateWorkflow";

const NODE_PREVIEW_CLASS: Record<string, string> = {
  start: "rounded-full bg-emerald-500",
  end: "rounded-full bg-rose-500",
  task: "rounded-md bg-sky-100 border border-sky-500",
  approval: "rounded-md bg-teal-100 border border-teal-500",
  document: "rounded-md bg-slate-100 border border-slate-400",
  notification: "rounded-full bg-indigo-100 border border-indigo-500",
  wait: "rounded-md bg-orange-100 border border-dashed border-orange-500",
  database: "rounded-md bg-amber-100 border border-amber-500",
  branch: "rounded-md bg-violet-100 border border-violet-500 rotate-45",
  subflow: "rounded-md bg-violet-100 border-2 border-violet-500",
  memo: "rounded-sm bg-yellow-100 border border-yellow-400",
};

interface SidebarProps {
  lanes: LaneData[];
  onAddLane: () => void;
  onRenameLane: (id: string, name: string) => void;
  onRemoveLane: (id: string) => void;
  /** Moves the lane at `from` to position `to`, carrying its nodes with it. */
  onMoveLane: (from: number, to: number) => void;
  issues: ValidationIssue[];
  onFocusIssue: (issue: ValidationIssue) => void;
}

export default function Sidebar({
  lanes,
  onAddLane,
  onRenameLane,
  onRemoveLane,
  onMoveLane,
  issues,
  onFocusIssue,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Which lane is being dragged, and which row the pointer is over. Held as
  // indices rather than ids because the drop target is a position in the list.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, kind: string) => {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, kind);
    event.dataTransfer.effectAllowed = "move";
  };

  if (collapsed) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-r border-zinc-200 bg-zinc-50 py-4">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
          title="サイドバーを開く"
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setCollapsed(true)}
          className="rounded p-1 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
          title="サイドバーを折りたたむ"
        >
          « 折りたたむ
        </button>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          パーツ（ドラッグして配置）
        </h2>
        <div className="flex flex-col gap-2">
          {NODE_PALETTE.map((item) => (
            <div
              key={item.kind}
              draggable
              onDragStart={(e) => handleDragStart(e, item.kind)}
              className="flex cursor-grab items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm active:cursor-grabbing"
              title={item.description}
            >
              <span className={`h-5 w-5 shrink-0 ${NODE_PREVIEW_CLASS[item.kind]}`} />
              <span className="text-zinc-700">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            スイムレーン
          </h2>
          <button
            onClick={onAddLane}
            className="rounded bg-zinc-800 px-2 py-1 text-xs text-white hover:bg-zinc-700"
          >
            + 追加
          </button>
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-zinc-400">
          ⠿ をドラッグして並べ替え（レーン上の工程も一緒に動きます）
        </p>
        <div className="flex flex-col gap-2" onDragLeave={() => setOverIndex(null)}>
          {lanes.map((lane, index) => (
            <div
              key={lane.id}
              // The row is the drop target; only the grip below starts a drag,
              // so dragging never competes with selecting text in the name.
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverIndex(index);
              }}
              onDrop={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                onMoveLane(dragIndex, index);
                endDrag();
              }}
              className={`flex items-center gap-1 rounded ${
                dragIndex === index
                  ? "opacity-40"
                  : overIndex === index && dragIndex !== null
                    ? "ring-2 ring-emerald-400"
                    : ""
              }`}
            >
              <span
                draggable={lanes.length > 1}
                onDragStart={(e) => {
                  // Drag the whole row, not the six-dot grip: the default drag
                  // image is the dragged element, which here is 12px wide.
                  const row = e.currentTarget.parentElement;
                  if (row) e.dataTransfer.setDragImage(row, 12, row.clientHeight / 2);
                  e.dataTransfer.effectAllowed = "move";
                  // Payload is unused (dragIndex carries it) but Firefox will
                  // not start a drag unless something is set.
                  e.dataTransfer.setData("text/plain", lane.name);
                  setDragIndex(index);
                }}
                onDragEnd={endDrag}
                className={`shrink-0 select-none px-0.5 text-sm text-zinc-400 ${
                  lanes.length > 1 ? "cursor-grab hover:text-zinc-500 active:cursor-grabbing" : ""
                }`}
                title={lanes.length > 1 ? "ドラッグしてレーンを並べ替え" : undefined}
                aria-hidden
              >
                ⠿
              </span>
              <input
                value={lane.name}
                onChange={(e) => onRenameLane(lane.id, e.target.value)}
                className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
              />
              <button
                onClick={() => onRemoveLane(lane.id)}
                disabled={lanes.length <= 1}
                className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-red-600 disabled:opacity-30"
                title="レーンを削除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <ValidationPanel issues={issues} onFocusIssue={onFocusIssue} />
    </aside>
  );
}

const SEVERITY_STYLE: Record<IssueSeverity, { dot: string; text: string }> = {
  error: { dot: "bg-red-500", text: "text-red-700" },
  warning: { dot: "bg-amber-500", text: "text-amber-700" },
  info: { dot: "bg-sky-500", text: "text-sky-700" },
};

/** Deterministic checks on the current document. Judgement calls (is this the
 * right owner? is this step needed?) stay with the AI chat panel. */
function ValidationPanel({
  issues,
  onFocusIssue,
}: {
  issues: ValidationIssue[];
  onFocusIssue: (issue: ValidationIssue) => void;
}) {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        検証
        {issues.length > 0 && (
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium normal-case text-zinc-600">
            {errors > 0 ? `エラー${errors}` : `指摘${warnings}`}
          </span>
        )}
      </h2>
      {issues.length === 0 ? (
        <p className="text-xs text-zinc-400">指摘はありません。</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                onClick={() => onFocusIssue(issue)}
                className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-left text-xs hover:bg-zinc-100"
                title={issue.nodeIds.length > 0 ? "クリックで該当ノードを選択します" : undefined}
              >
                <span className="flex items-start gap-1.5">
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_STYLE[issue.severity].dot}`}
                  />
                  <span className={SEVERITY_STYLE[issue.severity].text}>{issue.message}</span>
                </span>
                {issue.flowId !== "root" && (
                  <span className="mt-0.5 block pl-3 text-[10px] text-zinc-400">
                    サブフロー「{issue.flowLabel}」
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
