"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BASE_PATH } from "@/lib/basePath";
import type { ChatMessage } from "@/lib/chatService";
import type { WorkflowProposal } from "@/lib/proposalSchema";
import type { WorkflowDocument } from "@/lib/types";

interface ChatPanelProps {
  getWorkflowSnapshot: () => WorkflowDocument;
  /** Hands a structured diff to the editor, which previews it (§3.20). */
  onProposal: (proposal: WorkflowProposal) => void;
  /** True while a proposal is on screen awaiting apply/discard. Sending
   * anything then would show the AI the marked-up preview document, not the
   * user's flow - so the panel goes quiet until they decide. */
  previewing: boolean;
}

export default function ChatPanel({ getWorkflowSnapshot, onProposal, previewing }: ChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  /** Index of the answer currently being turned into a diff, or null. */
  const [proposing, setProposing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading || previewing) return;
    const next = [...messages, { role: "user", content: text } satisfies ChatMessage];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE_PATH}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, workflow: getWorkflowSnapshot() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `API error ${res.status}`);
      }
      const data = (await res.json()) as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  /** Second AI turn: re-reads the conversation up to this answer and asks for
   * it as a diff. Sent with the flow as it stands now, not as it stood when
   * the answer was written, so applying it late still lines up with the
   * document on screen. */
  const handlePropose = async (index: number) => {
    if (proposing !== null || loading || previewing) return;
    setProposing(index);
    setError(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/chat/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.slice(0, index + 1),
          workflow: getWorkflowSnapshot(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `API error ${res.status}`);
      }
      const data = (await res.json()) as { proposal: WorkflowProposal };
      onProposal(data.proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-l border-zinc-200 bg-zinc-50 py-4">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
          title="チャットを開く"
        >
          «
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AIに相談</h2>
        <button
          onClick={() => setCollapsed(true)}
          className="rounded p-1 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
          title="チャットを折りたたむ"
        >
          折りたたむ »
        </button>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <p className="text-xs text-zinc-400">
            今作っているワークフローについて、AIに評価や改善案を相談できます。
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex max-w-[92%] flex-col gap-1 ${m.role === "user" ? "self-end" : "self-start"}`}
          >
            <div
              className={`whitespace-pre-wrap rounded-md px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-sky-100 text-sky-900"
                  : "border border-zinc-200 bg-white text-zinc-800"
              }`}
            >
              {m.content}
            </div>
            {m.role === "assistant" && (
              <button
                onClick={() => handlePropose(i)}
                disabled={proposing !== null || loading || previewing}
                className="self-start rounded border border-indigo-300 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:bg-transparent"
                title="この回答の提案を差分に変換し、図に反映する前にプレビューします"
              >
                {proposing === i ? "差分を作成中…" : "この提案を図に反映…"}
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="self-start rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-400">
            考え中…
          </div>
        )}
        {error && (
          <div className="self-start rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 p-2">
        {previewing && (
          <p className="mb-1 text-xs text-indigo-700">
            提案のプレビュー中です。反映するか取り消すと再開できます。
          </p>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={previewing}
          placeholder="ワークフローについて質問・相談する（Cmd/Ctrl+Enterで送信）"
          rows={3}
          className="w-full resize-none rounded border border-zinc-200 bg-white px-2 py-1 text-sm disabled:bg-zinc-100"
        />
        <button
          onClick={handleSend}
          disabled={loading || previewing || !input.trim()}
          className="mt-1 w-full rounded bg-zinc-800 px-2 py-1 text-xs text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          送信
        </button>
      </div>
    </aside>
  );
}
