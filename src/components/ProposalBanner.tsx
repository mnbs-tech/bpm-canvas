"use client";

import type { ProposalEntry } from "@/lib/applyProposal";

interface ProposalBannerProps {
  /** The AI's own one-line description of what it is proposing. */
  summary: string;
  entries: ProposalEntry[];
  /** Operations that could not be applied, already phrased for the user. */
  skipped: string[];
  counts: { added: number; updated: number; removed: number };
  onApply: () => void;
  onCancel: () => void;
}

const CHANGE_STYLE: Record<ProposalEntry["change"], string> = {
  add: "text-emerald-700",
  update: "text-amber-700",
  remove: "text-red-700 line-through decoration-red-400",
};

const CHANGE_DOT: Record<ProposalEntry["change"], string> = {
  add: "bg-emerald-600",
  update: "bg-amber-500",
  remove: "bg-red-600",
};

/**
 * Shown while an AI proposal is being reviewed. The canvas behind it already
 * shows the change (green/red/amber markers); this says what the change *is*,
 * including the parts that live in a subflow the user is not looking at, and
 * holds the only two ways out - apply or discard.
 */
export default function ProposalBanner({
  summary,
  entries,
  skipped,
  counts,
  onApply,
  onCancel,
}: ProposalBannerProps) {
  return (
    <div className="flex flex-wrap items-start gap-4 border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-950">
      <div className="min-w-56 flex-1">
        <p className="font-semibold">AIの提案をプレビュー中</p>
        {summary && <p className="mt-0.5 text-xs text-indigo-900">{summary}</p>}
        <p className="mt-1 text-xs text-indigo-700">
          追加 {counts.added} / 変更 {counts.updated} / 削除 {counts.removed} ・
          反映するまで図は変わりません（キャンバスは編集できません）
        </p>
      </div>

      <ul className="max-h-28 min-w-64 flex-1 overflow-y-auto rounded border border-indigo-200 bg-white px-2 py-1 text-xs">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-1.5 py-0.5">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${CHANGE_DOT[entry.change]}`} />
            <span className={CHANGE_STYLE[entry.change]}>{entry.text}</span>
            <span className="ml-auto shrink-0 pl-2 text-zinc-400">{entry.flowLabel}</span>
          </li>
        ))}
        {skipped.map((text, i) => (
          <li key={`skipped-${i}`} className="py-0.5 text-zinc-500">
            取り込めなかった指示: {text}
          </li>
        ))}
      </ul>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onApply}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          title="この内容で図を書き換えます（Ctrl+Z で元に戻せます）"
        >
          この内容で反映
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
        >
          取り消す
        </button>
      </div>
    </div>
  );
}
