import type { NodeKind } from "./types";

export interface NodePaletteItem {
  kind: NodeKind;
  label: string;
  defaultLabel: string;
  description: string;
}

export const NODE_PALETTE: NodePaletteItem[] = [
  { kind: "start", label: "開始", defaultLabel: "開始", description: "フローの開始点" },
  { kind: "end", label: "終了", defaultLabel: "終了", description: "フローの終了点" },
  { kind: "task", label: "タスク", defaultLabel: "新しいタスク", description: "処理・作業" },
  { kind: "approval", label: "確認", defaultLabel: "確認", description: "確認・承認のゲート" },
  { kind: "document", label: "書類作成", defaultLabel: "書類作成", description: "書類・帳票の作成" },
  { kind: "notification", label: "通知送信", defaultLabel: "通知送信", description: "メール・通知の送信" },
  { kind: "wait", label: "待機", defaultLabel: "待機", description: "一定期間の待機・タイマー" },
  { kind: "database", label: "データベース", defaultLabel: "データベース", description: "データの保存・参照" },
  { kind: "branch", label: "分岐", defaultLabel: "条件分岐", description: "条件による分岐" },
  { kind: "subflow", label: "サブフロー", defaultLabel: "サブフロー", description: "入れ子のフローを呼び出す" },
  { kind: "memo", label: "メモ", defaultLabel: "メモ", description: "注釈・補足" },
];

export const DRAG_DATA_FORMAT = "application/x-workflow-node-kind";
