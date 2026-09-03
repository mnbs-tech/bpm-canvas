import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DURATION_UNITS, NODE_KINDS } from "./types";
import type { WorkflowDocument } from "./types";
import { parseProposalText, type WorkflowProposal } from "./proposalSchema";

const execFileAsync = promisify(execFile);

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Generous relative to a single claude -p turn, but must stay comfortably
// under the nginx proxy_read_timeout for /workflow (see
// nginx/workflow-builder.location.conf) or the client sees a 504 instead of
// this timeout's own error message.
const CHAT_TIMEOUT_MS = 150_000;

function buildPrompt(messages: ChatMessage[], workflow: WorkflowDocument): string {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return `あなたはBPM/業務フロー図の作成を手伝うレビュアー兼相談相手です。
ユーザーは以下のワークフロー(JSON)をエディタ上で編集中です。このJSONと会話履歴だけを根拠に、
日本語で簡潔に回答してください。ファイルの読み書きやコマンド実行は不要です。テキストのみで
回答してください。ワークフローのJSON自体を書き換えて出力する必要はありません（あくまで
評価・相談への回答です）。

回答の際は、以下のような観点も参考にしてください（該当する場合のみ）:
- ワークフローの抜け漏れ・過不足（分岐の妥当性、承認/通知/待機ノードの配置が業務上自然か）
- レーン（担当）の割り当てが適切か
- 命名や粒度の一貫性
- 具体的な改善案（あれば、ノード名や接続の変更として提示）

--- 現在のワークフロー(JSON) ---
${JSON.stringify(workflow, null, 2)}

--- 会話履歴（最後のUser発言に応答してください） ---
${transcript}
`;
}

/** One stateless `claude -p` turn. `--restricted` strips code execution and
 * WebFetch: everything the model needs is already in the prompt. */
async function runClaude(prompt: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "claude",
      ["-p", "--restricted", "--output-format", "text", "--no-session-persistence", prompt],
      { timeout: CHAT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
    );
    const reply = stdout.trim();
    if (!reply) throw new Error("claude -p returned an empty response");
    return reply;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`claude -p の実行に失敗しました: ${message}`);
  }
}

export async function askWorkflowAssistant(
  messages: ChatMessage[],
  workflow: WorkflowDocument
): Promise<string> {
  return runClaude(buildPrompt(messages, workflow));
}

/** Node kinds a proposal may add - `subflow` is excluded, see proposalSchema.ts. */
const ADDABLE_KINDS = NODE_KINDS.filter((k) => k !== "subflow").join(" | ");
const DURATION_UNIT_LIST = DURATION_UNITS.join(" | ");

/**
 * Turns the assistant's last suggestion into a diff the editor can preview and
 * apply (proposalSchema.ts). Deliberately a *second* call rather than making
 * every chat turn answer in JSON: the conversation stays readable prose, and
 * the structured form is only paid for when the user actually asks to apply
 * something. `claude -p` is stateless, so the transcript is replayed here too.
 */
function buildProposalPrompt(messages: ChatMessage[], workflow: WorkflowDocument): string {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const laneList = (workflow.lanes ?? [])
    .map((lane, i) => `  ${i}: ${lane.name}`)
    .join("\n") || "  (レーンなし)";
  const flowList = [
    "  root: ルートフロー",
    ...Object.keys(workflow.subflows ?? {}).map((id) => `  ${id}: サブフロー`),
  ].join("\n");

  return `あなたはBPM/業務フロー図の編集アシスタントです。
直前の会話であなたが提案した内容を、下記のJSON形式の「差分」に変換して出力してください。

**出力はJSONオブジェクト1つだけ**にしてください。説明文・前置き・コードフェンスは書かないでください。

## 差分の形式

{
  "summary": "何をする提案かを1〜2文で",
  "operations": [ ...操作を並べる... ]
}

操作は次の5種類です（\`flowId\` は省略するとルートフロー）:

- {"op":"addNode","flowId":"root","id":"<この差分内で使う仮のID>","kind":"<種別>","label":"<名称>","lane":<レーン番号>,"details":{"description":"この工程の説明","assignee":"営業部 田中","duration":"3営業日","system":"販売管理システム","documents":"注文請書"}}
- {"op":"updateNode","flowId":"root","id":"<既存ノードのid>","label":"<新しい名称>","details":{...}}
- {"op":"removeNode","flowId":"root","id":"<既存ノードのid>"}
- {"op":"addEdge","flowId":"root","id":"<仮のID>","source":"<ノードid>","target":"<ノードid>","label":"<線の名称>","sourceHandle":"yes|no|default"}
- {"op":"removeEdge","flowId":"root","id":"<既存エッジのid>"}

## 規則

- 既存の要素を指すidは、下のワークフローJSONに実際にある \`id\` をそのまま使うこと。
- 新しく足すノード/エッジのidは自分で決めてよい（例: "new1"）。同じ差分の中の
  \`addEdge\` からその仮IDで参照できる。実際のIDはアプリ側で採番し直す。
- \`kind\` に使えるのは次のみ: ${ADDABLE_KINDS}
  （サブフローの新規追加はできない。既存のサブフローノードの削除・改名は可能）
- \`lane\` はレーンの番号（0始まり）。省略すると接続先のノードと同じレーンに置かれる。
- 座標は指定しない。アプリが前後のノードから決める。
- \`details\` は5項目すべて任意。書いた項目だけが設定され、空文字にするとその項目を消す。
- \`details.duration\`（所要時間）は**「<数値><単位>」の形式のみ**（例: "3営業日" "2.5時間"）。
  使える単位は次のみ: ${DURATION_UNIT_LIST}。それ以外の書き方（"半日" "◯日前" など）は
  リードタイム集計で読めないので使わないこと。0.5のような小数は使ってよい。
- 提案に含まれない要素は書かない。**書かなかったものは変更されない**（全体を書き直さないこと）。
- 操作は最大60個。会話で合意した範囲だけを、最小限の操作数で表現すること。
- 削除は本当に必要なときだけにすること。

## 利用できるレーン（番号: 名前）

${laneList}

## 利用できるフローID

${flowList}

## 現在のワークフロー(JSON)

${JSON.stringify(workflow, null, 2)}

## 会話履歴

${transcript}

上記の会話であなたが提案した変更を、JSONの差分にしてください（JSONのみ出力）。
`;
}

export async function proposeWorkflowEdit(
  messages: ChatMessage[],
  workflow: WorkflowDocument
): Promise<WorkflowProposal> {
  const raw = await runClaude(buildProposalPrompt(messages, workflow));
  return parseProposalText(raw);
}
