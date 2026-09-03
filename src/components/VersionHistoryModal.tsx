"use client";

import { useEffect, useState } from "react";
import { listS3Versions } from "@/lib/storage";
import type { WorkflowVersionEntry } from "@/lib/types";

interface VersionHistoryModalProps {
  workflowId: string;
  /** Restores one past save. The editor owns the confirmation and the write,
   * so this only has to list what is there. */
  onRestore: (entry: WorkflowVersionEntry) => void;
  onClose: () => void;
}

function formatSavedAt(savedAt: string): string {
  if (!savedAt) return "日時不明";
  const d = new Date(savedAt);
  return Number.isNaN(d.getTime()) ? "日時不明" : d.toLocaleString("ja-JP");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function VersionHistoryModal({
  workflowId,
  onRestore,
  onClose,
}: VersionHistoryModalProps) {
  const [entries, setEntries] = useState<WorkflowVersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listS3Versions(workflowId)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [workflowId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-[460px] flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">保存履歴</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && <p className="px-2 py-4 text-sm text-zinc-500">読み込み中...</p>}
          {error && <p className="px-2 py-4 text-sm text-red-600">エラー: {error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="px-2 py-4 text-sm text-zinc-500">
              このフローの履歴はまだありません。次に「保存」したときから記録されます。
            </p>
          )}
          {entries.map((entry, index) => (
            <div
              key={entry.versionId}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-zinc-50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-800">
                  {formatSavedAt(entry.savedAt)}
                  {index === 0 && (
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
                      最新の保存
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-400">{formatSize(entry.size)}</div>
              </div>
              <button
                onClick={() => onRestore(entry)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                この版に戻す
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
          保存するたびに記録し、新しいものから30件を残します。戻した時点の内容も履歴に残るので、
          戻しすぎたときはさらに戻せます。
        </div>
      </div>
    </div>
  );
}
