# bpm-canvas

スイムレーン形式の業務フロー（BPM）図エディタ。見積・契約・請求・更新といったバックオフィス
業務のフローを、ブラウザ上で作図・保存・共有するためのツールです。

## 主な機能

| 機能 | 概要 |
|---|---|
| スイムレーン作図 | 担当者ごとのレーンに、11種類のノード（開始/終了/タスク/確認/書類作成/通知送信/待機/データベース/分岐/サブフロー/メモ）をドラッグで配置 |
| 縦横の切り替え | レーンの向き（横帯・左→右／縦帯・上→下）をワンクリックで転置。座標は無損失に入れ替わる |
| 自動整列 | 各ノードのレーン所属を保ったまま、エッジのつながりに沿って自動配置 |
| サブフロー | ノードの中に入れ子のフローを持たせ、パンくずで出入り |
| テンプレート | 見積・契約・請求・契約更新の4種の定型フローから作成 |
| 保存 / 読み込み | S3（またはローカルフォルダ）への保存と一覧・削除、JSONファイルとしてのローカル保存・読み込み |
| エクスポート | PDF出力、クリップボードへの画像コピー |
| AIチャット | 編集中のフローをそのままAIに渡して、抜け漏れや担当割りを相談 |
| リリースキット | 自分のPCで動かすための一式をZIPで配布（⚙️ からダウンロード） |

各機能の正確な振る舞い・API・制限は保存JSONのフォーマット仕様
**[public/workflow-format.md](public/workflow-format.md)** を参照してください。

## ドキュメント一覧

| ファイル | 対象読者 | 内容 |
|---|---|---|
| `README.md`（この文書） | 全員 | 全体像・開発の始め方・ドキュメントの入口 |
| [`public/workflow-format.md`](public/workflow-format.md) | 利用者 / AI | 保存JSONのフォーマット仕様。アプリ右上の ⚙️ からもDLできる |
| `CLAUDE.md` | 開発者 / AIエージェント | 内部アーキテクチャと、実際に踏んだ落とし穴の記録 |
| `AGENTS.md` | AIエージェント | `next dev` が自動生成・再付与するNext.js向けの注意書き（手で書かない） |

## 開発

```bash
npm install
git config core.hooksPath .githooks   # 保存JSONの形と仕様書のずれを防ぐpre-commitフック
npm run dev                           # 開発サーバー http://localhost:3000/workflow
```

`.githooks/pre-commit` は、`src/lib/types.ts`（保存JSONの定義）だけをコミットしようとすると
止まります。形を変えたなら `public/workflow-format.md` も同じコミットで
更新してください（詳細は `CLAUDE.md`）。

`basePath` が `/workflow` のため、開発時もパスの末尾に `/workflow` が必要です。

### 検証コマンド

テストフレームワークは導入していません。変更の検証は次の3つ（+ ブラウザでの手動確認）です。

```bash
npx tsc --noEmit    # 型チェックのみ。フルビルドより速い
npm run lint        # eslint
npm run build       # 本番ビルド（型チェックも兼ねる）
```

### ディレクトリ構成

```
src/
  app/
    page.tsx, layout.tsx        # エディタ画面
    api/workflows/**/route.ts   # フローの保存・読込・削除API
    api/release-kit/**/route.ts # リリースキットの有無の確認とダウンロード
    api/chat/route.ts           # AIチャットAPI
    api/chat/proposal/route.ts  # AIの回答を差分（提案）に変換するAPI
    auth/{login,callback,logout}/route.ts  # Cognito OAuth2
  proxy.ts                      # 認証ゲート（Next.js 16 での middleware.ts の後継）
  components/
    WorkflowEditor.tsx          # エディタ状態とハンドラの集約点
    Toolbar.tsx  Sidebar.tsx  ChatPanel.tsx  LaneBackground.tsx
    ProposalBanner.tsx          # AIの提案のプレビューと反映/取り消し
    WorkflowLibraryModal.tsx  VersionHistoryModal.tsx
    AppInfoMenu.tsx             # 右上の⚙️（版情報・変更履歴・ライセンス・仕様書DL・一式DL）
    ChangelogModal.tsx          # アプリの変更履歴ダイアログ
    LicensesModal.tsx           # 使用OSS一覧ダイアログ
    nodes/                      # ノード種別ごとの見た目（index.ts で nodeTypes に登録）
  lib/
    types.ts                    # WorkflowDocument をはじめとする型と定数
    nodeDefs.ts                 # サイドバーのパレット定義
    autoLayout.ts               # 「自動整列」のレイアウト計算
    templates.ts                # 定型フロー4種
    orientation.tsx             # 縦横の座標系・ハンドル向きの変換
    subflowNav.tsx              # サブフローの出入り
    storage.ts                  # クライアント側からのAPI呼び出し
    workflowStore.ts            # サーバー側の保存ロジック（キー・索引・履歴）
    objectStore.ts  s3ObjectStore.ts  fsObjectStore.ts
                                # 保存先の実体（S3 / ローカルフォルダ）
    releaseKit.ts               # 配布用ZIPの所在
    exportImage.ts              # PDF出力・画像コピー
    chatService.ts              # claude -p の呼び出し（相談・差分生成の両方）
    proposalSchema.ts           # AIの差分（提案）の形式と検証
    applyProposal.ts            # 提案を文書に当てる／プレビュー用に印を付ける
    cognitoAuth.ts  basePath.ts
scripts/         # リリースキットの作成（npm run kit）
```

## デプロイ

```bash
npm run build
npm start
```

環境変数は `env.local.example` を参照してください。認証（Cognito）を使わないローカル実行では
`WORKFLOW_AUTH=off` にします。

### 配布用の一式（リリースキット）

利用者が自分のPCで動かすためのZIPを作ります。**求められたときだけ**実行してください
（ビルドやデプロイの一部にはしていません）。作ると ⚙️ メニューからダウンロードできます。

```bash
npm run kit        # dist/workflow-builder-kit-vX.Y.Z.zip
```

中身は `git archive HEAD`（コミット済みの追跡ファイルのみ）で、秘密情報とデプロイ元ホスト
固有の設定は含まれません。

## バージョン番号の運用

コミットごとに `package.json` の `version` を上げます（バグ修正・軽微な改善=PATCH、機能追加=MINOR、
利用者からの明示的な指示があるときのみMAJOR）。詳細な規則は `CLAUDE.md` の「Versioning rule」節にあります。
画面右上の ⚙️ に `vX.Y.Z`・コミットハッシュ・ビルド日時が出るので、
利用者が見ている版がどれかはそこで判別できます。
版を上げるコミットでは、利用者向けの1行を `src/lib/changelog.ts` にも追加します
（⚙️ →「変更履歴…」に出る一覧の実体）。

機能を追加・変更するコミットでは、**同じコミットの中で関連ドキュメントも更新します**。
どの変更でどの文書を直すかの対応表は `CLAUDE.md` の「Updating docs is part of the change」節にあります。

## ライセンス

MIT License. 詳細は [`LICENSE`](LICENSE) を参照してください。

## 技術スタック

Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS v4 /
[React Flow (`@xyflow/react`)](https://reactflow.dev/) / AWS SDK v3 (S3) / jose (JWT検証) /
html-to-image + jsPDF（エクスポート）
