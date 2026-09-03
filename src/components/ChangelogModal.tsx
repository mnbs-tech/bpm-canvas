"use client";

import { CHANGELOG } from "@/lib/changelog";

interface ChangelogModalProps {
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "日時不明";
  return d.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

/** The app's release history. A flow's own save history is a different thing,
 * in a different dialog - see VersionHistoryModal. */
export default function ChangelogModal({ onClose }: ChangelogModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex max-h-[75vh] w-[640px] max-w-[92vw] flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">変更履歴</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <ol className="flex-1 overflow-y-auto px-2 py-2">
          {CHANGELOG.map((entry) => (
            <li
              key={entry.commit ?? `${entry.version}-${entry.date}`}
              className="flex gap-3 rounded-md px-2 py-2 hover:bg-zinc-50"
            >
              <div className="w-28 shrink-0 pt-0.5">
                {entry.version ? (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-semibold text-white">
                    v{entry.version}
                  </span>
                ) : (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
                    版数なし
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-800">{entry.title}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {formatDate(entry.date)}
                  {entry.commit && <span className="ml-2 font-mono">{entry.commit}</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
          「版数なし」の項目は、バージョン管理を始める前（2026年9月1日 深夜のv1.2.0より前）の変更、
          またはバージョンを上げずに入った変更です。日時で識別してください。
          編集中のフロー自体の保存履歴は「保存」の <span className="font-mono">▾</span> →
          「保存履歴…」から見られます。
        </div>
      </div>
    </div>
  );
}
