import { v4 as uuidv4 } from "uuid";
import type { Edge } from "@xyflow/react";
import { autoLayoutNodes } from "./autoLayout";
import {
  CURRENT_FORMAT_VERSION,
  DEFAULT_LANE_COLOR,
  DEFAULT_ORIENTATION,
  EDGE_STYLE,
  LANE_WIDTH,
} from "./types";
import type { LaneData, NodeKind, WorkflowDocument, WorkflowNode } from "./types";

interface NodeSpec {
  key: string;
  kind: NodeKind;
  label: string;
  lane: number;
  // Detail-panel fields (see NODE_DETAIL_FIELDS in types.ts). Role/authority
  // ("課長", "部長" etc.) is expressed here via `assignee` rather than via
  // dedicated lanes - real approval chains aren't always cleanly split by
  // rank, so free text like "課長（100万円以上は部長）" covers both the
  // common case and the threshold exception without adding lanes.
  description?: string;
  assignee?: string;
  duration?: string;
  system?: string;
  documents?: string;
  /** memo only: place the note near this node's key, offset in px, once
   * autoLayoutNodes has positioned everything else (memo itself is excluded
   * from that layout - see autoLayout.ts - so it would otherwise be left at
   * its raw seed position). */
  anchor?: string;
  offset?: { dx: number; dy: number };
}

interface EdgeSpec {
  from: string;
  to: string;
  label?: string;
  sourceHandle?: string;
}

function buildFlow(
  name: string,
  laneNames: string[],
  nodeSpecs: NodeSpec[],
  edgeSpecs: EdgeSpec[]
): WorkflowDocument {
  const lanes: LaneData[] = laneNames.map((laneName) => ({
    id: uuidv4(),
    name: laneName,
    color: DEFAULT_LANE_COLOR,
  }));

  const keyToId = new Map(nodeSpecs.map((s) => [s.key, uuidv4()]));

  // Seed with a rough lane-axis position only; autoLayoutNodes computes the
  // real coordinates (including flow-axis ordering) below.
  const nodes: WorkflowNode[] = nodeSpecs.map((s) => ({
    id: keyToId.get(s.key)!,
    type: s.kind,
    position: { x: 0, y: s.lane * LANE_WIDTH },
    data: {
      label: s.label,
      ...(s.description ? { description: s.description } : {}),
      ...(s.assignee ? { assignee: s.assignee } : {}),
      ...(s.duration ? { duration: s.duration } : {}),
      ...(s.system ? { system: s.system } : {}),
      ...(s.documents ? { documents: s.documents } : {}),
    },
  }));

  const edges: Edge[] = edgeSpecs.map((e) => ({
    id: uuidv4(),
    source: keyToId.get(e.from)!,
    target: keyToId.get(e.to)!,
    sourceHandle: e.sourceHandle,
    label: e.label,
    type: "smoothstep",
    style: EDGE_STYLE,
  }));

  const laidOut = autoLayoutNodes(nodes, edges, lanes, DEFAULT_ORIENTATION);
  const positionById = new Map(laidOut.map((n) => [n.id, n.position]));
  const finalNodes = laidOut.map((n) => {
    const spec = nodeSpecs.find((s) => keyToId.get(s.key) === n.id);
    const anchorId = spec?.anchor ? keyToId.get(spec.anchor) : undefined;
    const anchorPos = anchorId ? positionById.get(anchorId) : undefined;
    if (!anchorPos) return n;
    return {
      ...n,
      position: {
        x: anchorPos.x + (spec!.offset?.dx ?? 0),
        y: anchorPos.y + (spec!.offset?.dy ?? 0),
      },
    };
  });

  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    name,
    orientation: DEFAULT_ORIENTATION,
    lanes,
    nodes: finalNodes,
    edges,
    subflows: {},
    updatedAt: new Date().toISOString(),
  };
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  build: () => WorkflowDocument;
}

// Shared convention across templates: on an ApprovalNode, the unlabeled
// bottom source handle (no sourceHandle given) is the 差戻し path and
// "right" is the 承認 path that continues the flow. On a BranchNode,
// sourceHandle "yes"/"no" are the right/left outcomes.
const APPROVAL_MEMO_OFFSET = { dx: -30, dy: -150 };

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "quotation",
    name: "見積フロー",
    description: "引き合いから見積承認、受注登録までの基本フロー",
    build: () =>
      buildFlow(
        "見積フロー",
        ["営業担当", "承認者", "顧客"],
        [
          { key: "start", kind: "start", label: "開始", lane: 0 },
          {
            key: "inquiry",
            kind: "task",
            label: "引き合い受付",
            lane: 0,
            description: "顧客からの問い合わせ内容をCRMに記録する",
            assignee: "営業担当",
            duration: "1日",
            system: "CRM",
            documents: "引き合い記録",
          },
          {
            key: "hearing",
            kind: "task",
            label: "要件ヒアリング",
            lane: 0,
            description: "数量・納期・予算などの要件を確認する",
            assignee: "営業担当",
            duration: "1営業日",
            documents: "ヒアリングシート",
          },
          {
            key: "create",
            kind: "task",
            label: "見積作成",
            lane: 0,
            description: "ヒアリング内容をもとに見積書ドラフトを作成する",
            assignee: "営業担当",
            duration: "2営業日",
            system: "販売管理システム",
            documents: "見積書(ドラフト)",
          },
          {
            key: "approve",
            kind: "approval",
            label: "見積承認",
            lane: 1,
            description: "金額・値引き率を確認し承認する",
            assignee: "課長（100万円以上は部長）",
            duration: "1営業日",
            documents: "見積書",
          },
          {
            key: "revise",
            kind: "task",
            label: "見積修正",
            lane: 0,
            description: "差戻し理由を反映して見積を修正する",
            assignee: "営業担当",
            duration: "1営業日",
          },
          {
            key: "present",
            kind: "notification",
            label: "見積書提示",
            lane: 0,
            description: "見積書を顧客へ送付する",
            assignee: "営業担当",
            system: "メール",
            documents: "見積書",
          },
          {
            key: "decision",
            kind: "branch",
            label: "顧客判断",
            lane: 2,
            description: "顧客が発注するかどうかの意思決定",
          },
          {
            key: "order",
            kind: "task",
            label: "受注登録",
            lane: 0,
            description: "顧客の発注意思を受け、販売管理システムに登録する",
            assignee: "営業担当",
            system: "販売管理システム",
            documents: "注文請書",
          },
          { key: "end", kind: "end", label: "終了", lane: 0 },
          {
            key: "note",
            kind: "memo",
            label: "承認権限の目安:\n100万円未満→課長\n100万円以上→部長\n(assigneeに記載)",
            lane: 1,
            anchor: "approve",
            offset: APPROVAL_MEMO_OFFSET,
          },
        ],
        [
          { from: "start", to: "inquiry" },
          { from: "inquiry", to: "hearing" },
          { from: "hearing", to: "create" },
          { from: "create", to: "approve" },
          { from: "approve", to: "present", label: "承認", sourceHandle: "right" },
          { from: "approve", to: "revise", label: "差戻し" },
          { from: "revise", to: "present" },
          { from: "present", to: "decision" },
          { from: "decision", to: "order", label: "受注する", sourceHandle: "yes" },
          { from: "decision", to: "end", label: "見送り", sourceHandle: "no" },
          { from: "order", to: "end" },
        ]
      ),
  },
  {
    id: "contract",
    name: "契約フロー",
    description: "契約書作成から法務レビュー、締結、保管までの基本フロー",
    build: () =>
      buildFlow(
        "契約フロー",
        ["営業担当", "法務", "顧客"],
        [
          { key: "start", kind: "start", label: "開始", lane: 0 },
          {
            key: "draft",
            kind: "document",
            label: "契約書ドラフト作成",
            lane: 0,
            description: "見積内容をもとに契約条件を契約書に落とし込む",
            assignee: "営業担当",
            duration: "2営業日",
            system: "契約書テンプレート",
            documents: "契約書(案)",
          },
          {
            key: "review",
            kind: "approval",
            label: "法務レビュー",
            lane: 1,
            description: "契約条件・免責事項に法的リスクがないか確認する",
            assignee: "法務担当（重要案件は法務部長）",
            duration: "3営業日",
            documents: "契約書(案)",
          },
          {
            key: "revise",
            kind: "document",
            label: "契約書修正",
            lane: 0,
            description: "法務指摘を反映して契約書を修正する",
            assignee: "営業担当",
            duration: "1営業日",
            documents: "契約書(案)",
          },
          {
            key: "send",
            kind: "notification",
            label: "契約書送付",
            lane: 0,
            description: "最終版の契約書を顧客へ送付する",
            assignee: "営業担当",
            system: "メール",
            documents: "契約書",
          },
          {
            key: "customer_review",
            kind: "branch",
            label: "顧客確認",
            lane: 2,
            description: "契約条件に合意できるかどうかの判断",
          },
          {
            key: "negotiate",
            kind: "task",
            label: "条件再交渉",
            lane: 0,
            description: "顧客からの修正希望を受けて条件を調整する",
            assignee: "営業担当",
            duration: "3営業日",
          },
          {
            key: "sign",
            kind: "task",
            label: "押印・締結",
            lane: 1,
            description: "社内稟議・押印を経て契約を締結する",
            assignee: "法務担当",
            system: "電子契約システム",
            documents: "契約書(締結版)",
          },
          {
            key: "store",
            kind: "database",
            label: "契約書保管",
            lane: 1,
            description: "締結済み契約書を文書管理システムに保管する",
            assignee: "法務担当",
            system: "文書管理システム",
            documents: "契約書(締結版)",
          },
          { key: "end", kind: "end", label: "終了", lane: 1 },
          {
            key: "note",
            kind: "memo",
            label: "契約金額500万円以上は\n事業部長の確認も必須\n(assigneeに記載)",
            lane: 1,
            anchor: "review",
            offset: APPROVAL_MEMO_OFFSET,
          },
        ],
        [
          { from: "start", to: "draft" },
          { from: "draft", to: "review" },
          { from: "review", to: "send", label: "問題なし", sourceHandle: "right" },
          { from: "review", to: "revise", label: "修正依頼" },
          { from: "revise", to: "send" },
          { from: "send", to: "customer_review" },
          { from: "customer_review", to: "sign", label: "合意", sourceHandle: "yes" },
          { from: "customer_review", to: "negotiate", label: "修正希望", sourceHandle: "no" },
          { from: "negotiate", to: "sign" },
          { from: "sign", to: "store" },
          { from: "store", to: "end" },
        ]
      ),
  },
  {
    id: "billing",
    name: "請求フロー",
    description: "請求書発行から入金確認、消込までの基本フロー",
    build: () =>
      buildFlow(
        "請求フロー",
        ["経理", "承認者", "顧客"],
        [
          { key: "start", kind: "start", label: "開始", lane: 0 },
          {
            key: "issue",
            kind: "document",
            label: "請求書発行",
            lane: 0,
            description: "契約内容・検収結果をもとに請求書を作成する",
            assignee: "経理担当",
            duration: "1日",
            system: "会計システム",
            documents: "請求書",
          },
          {
            key: "approve",
            kind: "approval",
            label: "発行承認",
            lane: 1,
            description: "請求金額・宛先に誤りがないか確認する",
            assignee: "課長（1000万円以上は部長）",
            duration: "0.5日",
            documents: "請求書",
          },
          {
            key: "revise",
            kind: "task",
            label: "請求書修正",
            lane: 0,
            description: "差戻し内容を反映して請求書を修正する",
            assignee: "経理担当",
            duration: "0.5日",
          },
          {
            key: "send",
            kind: "notification",
            label: "請求書送付",
            lane: 0,
            description: "承認済みの請求書を顧客へ送付する",
            assignee: "経理担当",
            system: "メール",
            documents: "請求書",
          },
          {
            key: "wait",
            kind: "wait",
            label: "入金期限待ち",
            lane: 2,
            description: "請求書記載の支払期限まで待機する",
          },
          {
            key: "check",
            kind: "branch",
            label: "入金確認",
            lane: 0,
            description: "期限までに入金があったかどうかの確認",
          },
          {
            key: "reminder",
            kind: "notification",
            label: "督促連絡",
            lane: 0,
            description: "未入金の顧客へ支払いを督促する",
            assignee: "経理担当",
            system: "電話・メール",
          },
          {
            key: "reconcile",
            kind: "task",
            label: "入金消込",
            lane: 0,
            description: "入金内容を確認し会計システムに消込を登録する",
            assignee: "経理担当",
            system: "会計システム",
            documents: "入金明細",
          },
          { key: "end", kind: "end", label: "終了", lane: 0 },
          {
            key: "note",
            kind: "memo",
            label: "承認権限の目安:\n1000万円未満→課長\n1000万円以上→部長\n(assigneeに記載)",
            lane: 1,
            anchor: "approve",
            offset: APPROVAL_MEMO_OFFSET,
          },
        ],
        [
          { from: "start", to: "issue" },
          { from: "issue", to: "approve" },
          { from: "approve", to: "send", label: "承認", sourceHandle: "right" },
          { from: "approve", to: "revise", label: "差戻し" },
          { from: "revise", to: "send" },
          { from: "send", to: "wait" },
          { from: "wait", to: "check" },
          { from: "check", to: "reconcile", label: "入金あり", sourceHandle: "yes" },
          { from: "check", to: "reminder", label: "未入金", sourceHandle: "no" },
          { from: "reminder", to: "reconcile" },
          { from: "reconcile", to: "end" },
        ]
      ),
  },
  {
    id: "renewal",
    name: "契約更新フロー",
    description: "更新時期の通知から更新可否判定、締結・終了処理までの基本フロー",
    build: () =>
      buildFlow(
        "契約更新フロー",
        ["営業担当", "承認者", "顧客"],
        [
          { key: "start", kind: "start", label: "開始", lane: 0 },
          {
            key: "notify",
            kind: "notification",
            label: "更新時期通知",
            lane: 0,
            description: "契約満了の60日前に顧客へ更新時期を通知する",
            assignee: "営業担当",
            system: "メール",
            documents: "更新案内",
          },
          {
            key: "confirm",
            kind: "wait",
            label: "顧客意思確認待ち",
            lane: 2,
            description: "顧客からの更新可否の返答を待つ",
            duration: "14日",
          },
          {
            key: "decide",
            kind: "branch",
            label: "更新判定",
            lane: 0,
            description: "顧客の回答をもとに更新するかどうかを判定する",
          },
          {
            key: "draft",
            kind: "document",
            label: "新契約書作成",
            lane: 0,
            description: "更新後の条件で契約書を作成する",
            assignee: "営業担当",
            duration: "2営業日",
            system: "契約書テンプレート",
            documents: "契約書(案)",
          },
          {
            key: "approve",
            kind: "approval",
            label: "承認",
            lane: 1,
            description: "更新条件・金額を確認し承認する",
            assignee: "課長（増額改定は部長）",
            duration: "1営業日",
            documents: "契約書(案)",
          },
          {
            key: "revise",
            kind: "document",
            label: "契約書修正",
            lane: 0,
            description: "差戻し内容を反映して契約書を修正する",
            assignee: "営業担当",
            duration: "1営業日",
          },
          {
            key: "sign",
            kind: "task",
            label: "更新契約締結",
            lane: 0,
            description: "押印のうえ契約を締結する",
            assignee: "営業担当",
            system: "電子契約システム",
            documents: "契約書(締結版)",
          },
          {
            key: "close",
            kind: "task",
            label: "契約終了処理",
            lane: 0,
            description: "更新しない契約について解約・終了手続きを行う",
            assignee: "営業担当",
            duration: "1営業日",
            documents: "解約通知書",
          },
          { key: "end", kind: "end", label: "終了", lane: 0 },
          {
            key: "note",
            kind: "memo",
            label: "増額改定は\n部長確認必須\n(assigneeに記載)",
            lane: 1,
            anchor: "approve",
            offset: APPROVAL_MEMO_OFFSET,
          },
        ],
        [
          { from: "start", to: "notify" },
          { from: "notify", to: "confirm" },
          { from: "confirm", to: "decide" },
          { from: "decide", to: "draft", label: "更新する", sourceHandle: "yes" },
          { from: "decide", to: "close", label: "更新しない", sourceHandle: "no" },
          { from: "draft", to: "approve" },
          { from: "approve", to: "sign", label: "承認", sourceHandle: "right" },
          { from: "approve", to: "revise", label: "差戻し" },
          { from: "revise", to: "sign" },
          { from: "sign", to: "end" },
          { from: "close", to: "end" },
        ]
      ),
  },
];
