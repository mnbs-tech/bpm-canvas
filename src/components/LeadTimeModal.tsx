"use client";

import { formatLeadTimeHours, type LeadTimeResult } from "@/lib/leadTime";

interface LeadTimeModalProps {
  results: LeadTimeResult[];
  /** Jumps to the flow and selects the winning path's nodes, same as
   * clicking a 検証 issue. */
  onFocusPath: (flowId: string, flowLabel: string, nodeIds: string[]) => void;
  onClose: () => void;
}

export default function LeadTimeModal({ results, onFocusPath, onClose }: LeadTimeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-[520px] flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">リードタイム集計</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {results.map((r) => (
            <div key={r.flowId} className="rounded-md px-2 py-2 hover:bg-zinc-50">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm text-zinc-800">
                  {r.flowId === "root" ? "ルート" : `サブフロー「${r.flowLabel}」`}
                </div>
                {r.totalHours !== null && (
                  <button
                    onClick={() => onFocusPath(r.flowId, r.flowLabel, r.pathNodeIds)}
                    className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    title="開始から終了までの最長経路を選択して表示します"
                  >
                    経路を表示
                  </button>
                )}
              </div>
              {r.totalHours === null ? (
                <p className="mt-1 text-xs text-zinc-400">{r.reason ?? "計算できません"}</p>
              ) : (
                <div className="mt-1 text-xs text-zinc-500">
                  <span className="text-base font-semibold text-zinc-800">
                    {formatLeadTimeHours(r.totalHours)}
                  </span>
                  {r.branched && (
                    <span className="ml-2 text-amber-700">分岐あり・最長の経路を採用</span>
                  )}
                  {r.unparsedNodeIds.length > 0 && (
                    <span className="ml-2 text-amber-700">
                      未計上 {r.unparsedNodeIds.length}件（所要時間を解釈できませんでした）
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-200 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          各ノードの「所要時間」欄のうち、<code className="text-[11px]">3営業日</code> ・
          <code className="text-[11px]">2時間</code> ・<code className="text-[11px]">1日</code>{" "}
          のような書き方だけを解釈し、開始から終了までの最長経路を合計します（営業日は1日として扱います）。
          それ以外の書き方は「未計上」として件数のみ表示し、合計には含みません。
        </div>
      </div>
    </div>
  );
}
