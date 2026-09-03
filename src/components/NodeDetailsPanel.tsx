"use client";

import { useEffect, useRef, useState } from "react";
import { DURATION_UNITS, NODE_DETAIL_FIELDS } from "@/lib/types";
import { NODE_PALETTE } from "@/lib/nodeDefs";
import { parseDurationParts } from "@/lib/leadTime";
import type { DurationUnit, NodeDetailKey, WorkflowNode } from "@/lib/types";

interface NodeDetailsPanelProps {
  node: WorkflowNode;
  onChange: (nodeId: string, key: NodeDetailKey | "label", value: string) => void;
  onClose: () => void;
}

/**
 * Shown while exactly one node is selected. Everything here is free text kept
 * on the node's `data` and saved with the document - the diagram stays
 * readable (only a badge appears on the node itself) while the detail that
 * makes it a usable business document lives one click away.
 */
export default function NodeDetailsPanel({ node, onChange, onClose }: NodeDetailsPanelProps) {
  const kindLabel = NODE_PALETTE.find((p) => p.kind === node.type)?.label ?? node.type;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          詳細
          <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium normal-case text-zinc-600">
            {kindLabel}
          </span>
        </h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
          title="選択を解除して閉じる"
        >
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">名前</span>
          <input
            value={node.data.label}
            onChange={(e) => onChange(node.id, "label", e.target.value)}
            className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
          />
        </label>

        {NODE_DETAIL_FIELDS.map((field) => {
          const value = typeof node.data[field.key] === "string" ? (node.data[field.key] as string) : "";
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500">{field.label}</span>
              {field.key === "duration" ? (
                <DurationField value={value} onChange={(v) => onChange(node.id, field.key, v)} />
              ) : field.multiline ? (
                <textarea
                  value={value}
                  onChange={(e) => onChange(node.id, field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  className="resize-none rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
                />
              ) : (
                <input
                  value={value}
                  onChange={(e) => onChange(node.id, field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
                />
              )}
            </label>
          );
        })}
      </div>

      <p className="border-t border-zinc-200 px-3 py-2 text-[10px] leading-relaxed text-zinc-400">
        入力した内容は図の上には出ず、ノードの右上に印が付きます。フローと一緒に保存され、
        AIに相談するときも渡されます。
      </p>
    </aside>
  );
}

/**
 * 所要時間's input: a number plus a fixed unit picker (DURATION_UNITS),
 * composed into the same "<number><unit>" string leadTime.ts parses (e.g.
 * "3営業日") rather than free text - constraining entry this way is what
 * lets リードタイム集計 read it without an "未計上" bucket for typos/variant
 * phrasing.
 *
 * Number and unit are local state, not derived straight from `value` on
 * every render: the moment the number is cleared to retype it, `value`
 * becomes "" (see WorkflowEditor.tsx's handleNodeDetailChange - empty means
 * "not set"), and a purely-derived unit would snap back to the default
 * before the user finishes typing. `lastCommitted` distinguishes that
 * self-caused round trip from a genuine external change (undo/redo) to the
 * same node's duration, which does need to resync the picker.
 */
function DurationField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const initial = parseDurationParts(value);
  const [numberText, setNumberText] = useState(initial ? String(initial.value) : "");
  const [unit, setUnit] = useState<DurationUnit>(initial?.unit ?? "日");
  const lastCommitted = useRef(value);

  useEffect(() => {
    if (value === lastCommitted.current) return;
    const parsed = parseDurationParts(value);
    setNumberText(parsed ? String(parsed.value) : "");
    setUnit(parsed?.unit ?? "日");
    lastCommitted.current = value;
  }, [value]);

  const commit = (nextNumberText: string, nextUnit: DurationUnit) => {
    const trimmed = nextNumberText.trim();
    if (trimmed !== "" && !Number.isFinite(Number(trimmed))) return;
    const composed = trimmed === "" ? "" : `${trimmed}${nextUnit}`;
    lastCommitted.current = composed;
    onChange(composed);
  };

  return (
    <div className="flex gap-2">
      <input
        type="number"
        min="0"
        step="0.5"
        inputMode="decimal"
        value={numberText}
        onChange={(e) => {
          setNumberText(e.target.value);
          commit(e.target.value, unit);
        }}
        className="w-20 rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
      />
      <select
        value={unit}
        onChange={(e) => {
          const nextUnit = e.target.value as DurationUnit;
          setUnit(nextUnit);
          commit(numberText, nextUnit);
        }}
        className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
      >
        {DURATION_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}
