"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  createS3Workflow,
  deleteS3Workflow,
  listS3Workflows,
  loadS3Workflow,
  readWorkflowFile,
} from "@/lib/storage";
import { useDialog } from "@/lib/dialog";
import { useToast } from "@/lib/toast";
import type { WorkflowDocument, WorkflowIndexEntry } from "@/lib/types";

interface WorkflowLibraryModalProps {
  onClose: () => void;
  onSelect: (doc: WorkflowDocument) => void;
}

export default function WorkflowLibraryModal({ onClose, onSelect }: WorkflowLibraryModalProps) {
  const [entries, setEntries] = useState<WorkflowIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  const dialog = useDialog();

  useEffect(() => {
    listS3Workflows()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleOpen = async (id: string) => {
    try {
      const doc = await loadS3Workflow(id);
      onSelect(doc);
    } catch (err) {
      toast.show(`読み込みに失敗しました: ${err instanceof Error ? err.message : err}`, "error");
    }
  };

  /** Copies the stored workflow into a new one without touching the editor,
   * so an existing flow can be used as the starting point for a variant. */
  const handleDuplicate = async (id: string, name: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const doc = await loadS3Workflow(id);
      const copy = await createS3Workflow({ ...doc, id: undefined, name: `${name} のコピー` });
      toast.show(`「${copy.name}」として複製しました`, "success");
      setEntries((prev) => [
        {
          id: copy.id as string,
          name: copy.name,
          orientation: copy.orientation,
          updatedAt: copy.updatedAt,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.show(`複製に失敗しました: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await dialog.confirm({
      title: `「${name}」を削除しますか？`,
      message: "S3から消えます。この操作は元に戻せません。",
      confirmLabel: "削除する",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteS3Workflow(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.show(`「${name}」を削除しました`, "success");
    } catch (err) {
      toast.show(`削除に失敗しました: ${err instanceof Error ? err.message : err}`, "error");
    }
  };

  const handleLocalFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readWorkflowFile(file)
      .then(onSelect)
      .catch((err) =>
        toast.show(`読み込みに失敗しました: ${err instanceof Error ? err.message : err}`, "error")
      );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-[min(680px,calc(100vw-2rem))] flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">保存済みフローを開く</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && <p className="px-2 py-4 text-sm text-zinc-500">読み込み中...</p>}
          {error && <p className="px-2 py-4 text-sm text-red-600">エラー: {error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="px-2 py-4 text-sm text-zinc-500">保存済みのフローはありません。</p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-zinc-50"
            >
              <button
                onClick={() => handleOpen(entry.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div
                  className="line-clamp-2 break-all text-sm font-medium text-zinc-800"
                  title={entry.name}
                >
                  {entry.name}
                </div>
                <div className="text-xs text-zinc-400">
                  {new Date(entry.updatedAt).toLocaleString("ja-JP")}
                </div>
              </button>
              <button
                onClick={() => handleDuplicate(entry.id, entry.name)}
                disabled={busyId !== null}
                className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
                title="複製"
              >
                {busyId === entry.id ? "…" : "⧉"}
              </button>
              <button
                onClick={() => handleDelete(entry.id, entry.name)}
                className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600"
                title="削除"
              >
                🗑
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-200 px-4 py-3">
          <label className="cursor-pointer text-xs text-zinc-500 underline hover:text-zinc-800">
            ローカルJSONファイルを読み込む
            <input type="file" accept="application/json" className="hidden" onChange={handleLocalFile} />
          </label>
        </div>
      </div>
    </div>
  );
}
