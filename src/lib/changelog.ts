/**
 * The app's own release history, shown in the ⚙️ menu's 変更履歴 dialog.
 *
 * This is the *application's* changelog - not to be confused with a single
 * flow's save history (`VersionHistoryModal`, backed by S3 snapshots).
 *
 * Hand-maintained on purpose: entries are user-facing Japanese summaries, while
 * commit subjects are English and written for developers. The backfill below was
 * derived from `git log` (see the `commit` field on each entry), and every later
 * release adds its entry here in the same commit as its version bump - see
 * CLAUDE.md's versioning rule.
 */
export interface ChangelogEntry {
  /**
   * The version this change shipped as. Absent for changes made before version
   * management started (`v1.2.0`, commit 27c05a0, is where it began - earlier
   * commits carry create-next-app's untouched `0.1.0`/`1.0.0`), and for the few
   * later commits that landed without a bump. Those are identified by date.
   */
  version?: string;
  /** Commit date, ISO 8601. Displayed in the viewer's local time. */
  date: string;
  /** Short git hash, so an entry can be traced back to its commit. */
  commit?: string;
  /** One user-facing line: what changed for the person using the app. */
  title: string;
}

/** Newest first - the dialog renders this order as-is. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "4.0.0",
    date: "2026-09-03T13:35:00Z",
    title:
      "ツールバーのボタンを「ファイル」「ツール」「エクスポート」にまとめ、「クリア」を「新規作成」としてフロー名の左に移動した",
  },
  {
    version: "3.9.0",
    date: "2026-09-03T13:10:00Z",
    title: "⚙️メニューに「ライセンス」を追加し、使用しているOSS一覧を表示できるようにした",
  },
  {
    version: "3.8.2",
    date: "2026-09-03T12:45:00Z",
    title:
      "Excel出力を開くときに修復ダイアログが出る不具合を修正し、線を直線からカギ線（直角に折れる矢印）に変えた",
  },
  {
    version: "3.8.1",
    date: "2026-09-03T12:05:00Z",
    title:
      "Excel出力した図がExcelで開くと左上に重なって崩れる不具合を修正した（図形の位置指定の方式がExcelの流儀に合っていなかった）",
  },
  {
    version: "3.8.0",
    date: "2026-09-03T11:20:00Z",
    title:
      "Excel出力を画像の貼り付けからExcelの図形に変えた（縦レーン＋フローチャートの基本図形で、受け取った人がExcel上で編集できる）。図形に入るのは工程名だけで、フロー名はシート左上。詳細を入力した工程があるフローには「_詳細」シートが付く",
  },
  {
    version: "3.7.0",
    date: "2026-09-03T10:08:00Z",
    title:
      "所要時間を自由記述から数値＋単位（営業日・年・月・日・時間・分）の選択式に変えた（リードタイム集計で読み取れる値だけを入力できるようにした）",
  },
  {
    version: "3.6.0",
    date: "2026-09-03T08:27:00Z",
    title:
      "「Excel出力」を追加した（レーンが縦のとき、図の画像と工程一覧をルート・サブフローごとにシートへ書き出す）",
  },
  {
    version: "3.5.0",
    date: "2026-09-03T08:11:00Z",
    title:
      "「リードタイム」を追加した（所要時間欄から、開始から終了までの合計をルート・サブフローごとに集計する）",
  },
  {
    version: "3.4.0",
    date: "2026-09-03T02:10:00Z",
    title:
      "サイドバーでスイムレーンの並び順を入れ替えられるようにした（レーン上の工程も一緒に動きます）",
  },
  {
    version: "3.3.1",
    date: "2026-09-03T01:30:00Z",
    title: "スマートフォンなど画面の狭い端末で、⚙️ や「保存」のメニューが画面の外に出て見えなくなる問題を直した",
  },
  {
    version: "3.3.0",
    date: "2026-09-03T01:20:00Z",
    title: "自分のPCで動かすための一式を ⚙️ から配れるようにした（保存先をPCのフォルダにでき、ログインも不要）",
  },
  {
    version: "3.2.1",
    date: "2026-09-02T16:05:00Z",
    title: "開発ロードマップに機能拡張の候補を追記した（アプリの動作に変更なし）",
  },
  {
    version: "3.2.0",
    date: "2026-09-02T15:45:00Z",
    commit: "1e49253",
    title: "右上に⚙️メニューを新設し、バージョン情報とアプリの変更履歴をまとめた",
  },
  {
    date: "2026-09-02T15:27:11Z",
    commit: "a4d6165",
    title:
      "テンプレートの各工程に担当・所要期間・使用システムなどの初期値と、補足メモを入れた",
  },
  {
    version: "3.1.2",
    date: "2026-09-02T15:20:00Z",
    commit: "82a8c9c",
    title: "保存済みフローの一覧とダイアログの幅をさらに広げた",
  },
  {
    version: "3.1.1",
    date: "2026-09-02T15:17:00Z",
    commit: "73f518f",
    title: "保存・開くダイアログの操作性の不具合を直し、名前が切れていた欄を広げた",
  },
  {
    version: "3.1.0",
    date: "2026-09-02T11:53:00Z",
    commit: "02c3212",
    title: "AIの提案を、図に反映する前にプレビューで確認できるようにした",
  },
  {
    version: "3.0.0",
    date: "2026-09-02T09:41:00Z",
    commit: "3cfff74",
    title: "保存するたびに履歴を残し、過去に保存した時点へ戻せるようにした",
  },
  {
    version: "2.9.0",
    date: "2026-09-02T09:27:00Z",
    commit: "7060775",
    title: "ショートカットキー、コピー／貼り付け／複製、整列・等間隔ツールを追加した",
  },
  {
    version: "2.8.0",
    date: "2026-09-02T09:15:00Z",
    commit: "89ab625",
    title: "ブラウザの確認ダイアログを、アプリ内の通知とダイアログに置き換えた",
  },
  {
    version: "2.7.0",
    date: "2026-09-02T06:21:00Z",
    commit: "eb7e2f0",
    title: "部品や線を右クリックメニューから削除できるようにした",
  },
  {
    version: "2.6.0",
    date: "2026-09-02T05:02:00Z",
    commit: "19b975b",
    title: "PDF出力に、すべてのサブフローを1ページずつ含めるようにした",
  },
  {
    version: "2.5.0",
    date: "2026-09-02T04:36:00Z",
    commit: "4898596",
    title: "未保存の内容をブラウザに自動保存し、次に開いたときに復元できるようにした",
  },
  {
    version: "2.4.0",
    date: "2026-09-02T04:05:00Z",
    commit: "4d15996",
    title: "保存時と読み込み時に、JSONの形式が正しいかを検証するようにした",
  },
  {
    version: "2.3.0",
    date: "2026-09-02T03:52:00Z",
    commit: "82b337c",
    title: "担当・所要期間などを書き込める、部品の詳細パネルを追加した",
  },
  {
    version: "2.2.0",
    date: "2026-09-02T03:46:00Z",
    commit: "97d69e6",
    title: "フローの不備の自動チェック結果を、サイドバーに表示するようにした",
  },
  {
    version: "2.1.0",
    date: "2026-09-02T03:40:00Z",
    commit: "e3c54f6",
    title: "元に戻す／やり直す、名前を付けて保存、部品の複製を追加した",
  },
  {
    date: "2026-09-02T03:21:00Z",
    commit: "59f152a",
    title: "分岐から出る線に「はい／いいえ」などのラベルを自動で付けるようにした",
  },
  {
    date: "2026-09-02T03:18:00Z",
    commit: "01c0b59",
    title: "開発ロードマップの文書を追加した（アプリの動作に変更なし）",
  },
  {
    version: "2.0.2",
    date: "2026-09-01T19:35:00Z",
    commit: "64c7f1e",
    title: "利用ガイド・機能仕様書・運用手順の文書を追加し、READMEを整備した",
  },
  {
    date: "2026-09-01T17:46:00Z",
    commit: "6b5f817",
    title: "ツールバーに「ローカル保存」（JSONファイルの書き出し）を追加した",
  },
  {
    version: "2.0.1",
    date: "2026-09-01T17:32:00Z",
    commit: "642a108",
    title: "更新・見積テンプレートで、分岐と却下の線が見えなくなる不具合を直した",
  },
  {
    version: "2.0.0",
    date: "2026-09-01T17:22:00Z",
    commit: "5d92bec",
    title: "AIチャットパネルを追加し、編集中のワークフローを相談できるようにした",
  },
  {
    version: "1.2.0",
    date: "2026-09-01T16:44:00Z",
    commit: "27c05a0",
    title: "ここからバージョン管理を開始した（これより前の変更は日時で識別している）",
  },
  {
    date: "2026-09-01T16:41:00Z",
    commit: "c4eea7d",
    title: "サイドバーの折りたたみ、JSON仕様書のダウンロード、未保存の警告を追加した",
  },
  {
    date: "2026-09-01T16:26:00Z",
    commit: "e25159d",
    title: "PDF・画像コピーで線が消える／データベース部品の色が反転する不具合を直した",
  },
  {
    date: "2026-09-01T16:13:00Z",
    commit: "d24e942",
    title: "削除・自動整列・書き出しの不具合を直し、線のラベルとバージョン表示を追加した",
  },
  {
    date: "2026-09-01T16:01:00Z",
    commit: "851e853",
    title: "BASIC認証をCognitoログインに置き換えた",
  },
  {
    date: "2026-09-01T15:41:00Z",
    commit: "c60d055",
    title:
      "S3への保存、自動整列、サブフロー、BPM部品、テンプレート、PDF・画像出力を追加した",
  },
  {
    date: "2026-09-01T03:50:00Z",
    commit: "c7cecc7",
    title: "スイムレーンの縦／横の切り替えを追加した",
  },
  {
    date: "2026-09-01T00:50:00Z",
    commit: "8bb5638",
    title: "スイムレーン型ワークフロービルダーの初版を公開した",
  },
  {
    date: "2026-09-01T00:40:00Z",
    commit: "07475af",
    title: "プロジェクトを作成した",
  },
];
