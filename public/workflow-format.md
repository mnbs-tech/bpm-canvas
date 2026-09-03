# ワークフロービルダー JSON仕様書

このドキュメントは、ワークフロービルダー（スイムレーン形式のBPM図エディタ）が読み込める
JSONファイルのフォーマットを定義します。この仕様に従ったJSONをAI（Claude等）に直接
生成させ、アプリの「開く」→「ローカルJSONファイルを読み込む」から読み込むことで、
GUI操作なしにフローを作成できます。

読み込み後、位置がおおまかでも「自動整列」ボタンでレーンを保ったまま整列し直せるので、
座標は厳密でなくて構いません（後述）。

## 全体構造

```json
{
  "formatVersion": 2,
  "name": "見積フロー",
  "orientation": "horizontal",
  "lanes": [
    { "id": "lane-1", "name": "営業担当", "color": "#e2e8f0" },
    { "id": "lane-2", "name": "承認者", "color": "#e2e8f0" },
    { "id": "lane-3", "name": "顧客", "color": "#e2e8f0" }
  ],
  "nodes": [ /* WorkflowNode[]、下記参照 */ ],
  "edges": [ /* Edge[]、下記参照 */ ],
  "subflows": {},
  "updatedAt": "2026-09-01T00:00:00.000Z"
}
```

> **読み込み時に検証されます。** 形が違うファイルは、どの項目が悪いかを表示して読み込まれません
> （保存時も同じ検証が働きます）。必須は `nodes` / `edges`（配列）と、その中の
> `id`・`type`・`position`・`source`・`target`。`id` はフロー内で重複できません。
> 下表で「○」でも省略時に既定値が入るものは、説明にそう書いてあります。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `formatVersion` | number | ○ | 常に `2` を指定する（省略しても読めるが、明示すること） |
| `id` | string | - | 省略する。S3に初回保存した時点でサーバー側が発行する |
| `name` | string | ○ | フロー名（省略時は `"ワークフロー"`） |
| `orientation` | `"horizontal"` \| `"vertical"` | ○ | 下記「レーンと座標系」参照。省略すると読み込み時に `"vertical"`（旧形式扱い）になり、意図と食い違うので必ず指定する |
| `lanes` | LaneData[] | ○ | 最低1件。`id`はレーン内で一意な任意の文字列（省略すると `lane-1` 等が振られる）、`color`は薄いグレー系 `"#e2e8f0"` を推奨（省略時もこの値） |
| `nodes` | WorkflowNode[] | ○ | ルートフローのノード一覧（後述） |
| `edges` | Edge[] | ○ | ルートフローの接続一覧（後述） |
| `subflows` | object | - | サブフローがなければ省略可（`{}` でも良い）。キーはサブフローID、値は `{ "nodes": [...], "edges": [...] }`（後述「サブフロー」） |
| `updatedAt` | string (ISO8601) | ○ | 例: `"2026-09-01T00:00:00.000Z"`。省略時は読み込み時刻。S3保存時はサーバー側の値で上書きされる |

## ノード (WorkflowNode)

```json
{
  "id": "n-start",
  "type": "start",
  "position": { "x": 0, "y": 0 },
  "data": { "label": "開始" }
}
```

- `id`: ドキュメント内で一意な文字列（UUID推奨、`n-1` のような単純な文字列でも可）。**重複するとファイルが読み込めない**
- `type`: 下表の `NodeKind` のいずれか。**表に無い種別は読み込めない**
- `position`: `{x, y}`。ノードの**左上角**の座標（中心ではない）。数値であること（文字列は不可）。後述の通り、おおまかな値で構わない
- `data.label`: ノードに表示するテキスト（省略時は空文字）
- `data.subflowId`: `type: "subflow"` のノードのみ、対応するサブフローのキーを指定する（後述）

### ノードの詳細（任意）

`data` には、図には描かれない補足情報を持たせられる。**すべて任意の文字列**で、
未設定のキーは書かなくてよい（アプリ側でも、空にすると保存時にキーごと消える）。
アプリでは、ノードを1つ選ぶと右側の「詳細」パネルに表示・編集できる。値が1つでも入っていると、
図の上ではノードの右上に小さな印が付く。

| キー | 意味 | 例 |
|---|---|---|
| `data.description` | この工程で何をするか（複数行可） | `"顧客の要望を確認し、見積書のドラフトを作る"` |
| `data.assignee` | 担当者。レーンより細かい単位で書きたいときに使う | `"営業部 田中"` |
| `data.duration` | 所要時間。**「<数値><単位>」の形式のみ**（アプリの入力もこの形式に固定）。単位は `営業日`・`年`・`月`・`日`・`時間`・`分` のいずれか | `"3営業日"` `"2.5時間"` |
| `data.system` | 使用するシステム・ツール | `"販売管理システム"` |
| `data.documents` | 入出力となる書類 | `"見積書、注文請書"` |

```json
{
  "id": "n-quote",
  "type": "task",
  "position": { "x": 300, "y": 145 },
  "data": {
    "label": "見積作成",
    "description": "顧客の要望を確認し、見積書のドラフトを作る",
    "assignee": "営業部 田中",
    "duration": "3営業日",
    "system": "販売管理システム",
    "documents": "見積書"
  }
}
```

どの種別でも使える。ここに無いキーを `data` に足しても、アプリは無視するが保存時にそのまま
保持する（検証で削られることはない）。

### ノード種別 (NodeKind)

| type | 用途 | 見た目 | ハンドルID |
|---|---|---|---|
| `start` | フローの開始点 | 緑丸 | source（既定、id指定不要） |
| `end` | フローの終了点 | 赤丸 | target（既定、id指定不要） |
| `task` | 処理・作業 | 青系の角丸矩形 | target(既定)/source(既定)/target(`left`)/source(`right`) |
| `approval` | 確認・承認のゲート | teal系、チェック印 | 同上 |
| `document` | 書類・帳票の作成 | slate系、折れ角の書類アイコン | 同上 |
| `notification` | メール・通知の送信 | indigo系、封筒アイコン | 同上 |
| `wait` | 一定期間の待機・タイマー | orange系、破線、時計アイコン | 同上 |
| `database` | データの保存・参照 | amber系、円柱（DB）アイコン | target(既定)/source(既定)のみ |
| `branch` | 条件による分岐 | violet系、ひし形 | target(既定) / source(`no`, 左) / source(`yes`, 右) / source(`default`, 下) |
| `subflow` | 入れ子のフローを呼び出す | violet系、二重罫線の矩形 | target(既定)/source(既定)/target(`left`)/source(`right`) |
| `memo` | 付箋・注釈（フローに参加しない） | 黄色い付箋 | ハンドルなし |

「ハンドルID」は接続元・接続先が複数ある場合に、後述のEdgeの `sourceHandle`/`targetHandle` で
どの出入り口かを指定するためのIDです。`branch` 以外は基本的に上=target・下=sourceの1本
つなぎで十分で、`left`/`right` は横方向に分岐させたい時のみ使います。

`memo` は自動整列の対象外（自由配置の付箋）なので、フローの手順としては使わないでください。

## エッジ (Edge)

```json
{
  "id": "e-1",
  "source": "n-start",
  "target": "n-task",
  "type": "smoothstep",
  "style": { "stroke": "#b1b1b7", "strokeWidth": 1 },
  "sourceHandle": "yes",
  "label": "承認"
}
```

- `id`: ドキュメント内で一意な文字列
- `source` / `target`: 接続元・接続先ノードの `id`
- `type`: 常に `"smoothstep"` を指定する
- `style`: 必ず `{ "stroke": "#b1b1b7", "strokeWidth": 1 }` を指定する。省略すると画面表示は既定色になるが、
  **PDF出力・画像コピー機能でエッジが消えて見える既知の問題があるため、明示的に指定することを強く推奨**
- `sourceHandle` / `targetHandle`: 省略可。`branch` の分岐先や、ノードを横方向（`left`/`right`）につなぎたい時だけ指定
- `label`: 省略可。エッジ上に表示する任意のラベル文字列（例: 分岐の条件名）

## レーンと座標系

`orientation` によって「レーン」と「フローの流れ」がどちらの軸に対応するかが変わります。

- **`"horizontal"`**（レーンが横長の帯として上下に並ぶ。工程は左→右に流れる）
  - レーン軸 = `y`、フロー軸 = `x`
  - 通常はこちらを使う（アプリの既定値）
- **`"vertical"`**（レーンが縦長の帯として左右に並ぶ。工程は上→下に流れる）
  - レーン軸 = `x`、フロー軸 = `y`

レーンの幅（`LANE_WIDTH`）は **320px** 固定です。`i` 番目のレーン（0始まり）は
レーン軸上で `[i*320, (i+1)*320]` の範囲を占め、中心は `i*320 + 160` です。

### 座標の決め方（おおまかで良い）

`position` の**レーン軸側**の値だけ、そのノードが属すべきレーンの中心付近
（`レーン番号*320 + 160`）に合わせてください。**フロー軸側**の値は、工程の順番が
左（または上）から右（または下）に並ぶよう、大きめの間隔（200〜250px程度）を空けて
並べれば十分です。厳密なピクセル調整は不要です。

読み込み後にユーザーが「自動整列」ボタンを押すと、各ノードの現在のレーン軸位置から
所属レーンを判定し直し、エッジのつながり（トポロジカル順序）に沿ってフロー軸位置を
自動的に整列し、レーンの中心に揃えてくれます。**座標に自信がなければ、レーン軸だけ
大まかに合わせておき、あとはユーザーに「自動整列」を押してもらう前提で構いません。**

## サブフロー

`type: "subflow"` のノードは、`data.subflowId` で指定したキーに対応する
別のフロー（入れ子のワークフロー）を持てます。実体はトップレベルの `subflows` に格納します。

```json
{
  "nodes": [
    { "id": "n-sub", "type": "subflow", "position": {"x": 0, "y": 0},
      "data": { "label": "見積再作成フロー", "subflowId": "sf-1" } }
  ],
  "subflows": {
    "sf-1": {
      "nodes": [
        { "id": "sf1-start", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "開始"} },
        { "id": "sf1-end", "type": "end", "position": {"x": 300, "y": 0}, "data": {"label": "終了"} }
      ],
      "edges": [
        { "id": "sf1-e1", "source": "sf1-start", "target": "sf1-end", "type": "smoothstep",
          "style": { "stroke": "#b1b1b7", "strokeWidth": 1 } }
      ]
    }
  }
}
```

サブフロー内のノード/エッジも、ルートと同じ `WorkflowNode`/`Edge` の形式です。
サブフローが不要なら `subflows` ごと省略して構いません。

## 最小サンプル（そのまま読み込み可能）

```json
{
  "formatVersion": 2,
  "name": "見積フロー",
  "orientation": "horizontal",
  "lanes": [
    { "id": "lane-sales", "name": "営業担当", "color": "#e2e8f0" },
    { "id": "lane-approver", "name": "承認者", "color": "#e2e8f0" }
  ],
  "nodes": [
    { "id": "n1", "type": "start", "position": { "x": 60, "y": 160 }, "data": { "label": "開始" } },
    { "id": "n2", "type": "task", "position": { "x": 300, "y": 145 }, "data": { "label": "見積作成" } },
    { "id": "n3", "type": "approval", "position": { "x": 540, "y": 465 }, "data": { "label": "確認" } },
    { "id": "n4", "type": "notification", "position": { "x": 780, "y": 145 }, "data": { "label": "見積書送付" } },
    { "id": "n5", "type": "end", "position": { "x": 1020, "y": 160 }, "data": { "label": "終了" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "type": "smoothstep", "style": { "stroke": "#b1b1b7", "strokeWidth": 1 } },
    { "id": "e2", "source": "n2", "target": "n3", "type": "smoothstep", "style": { "stroke": "#b1b1b7", "strokeWidth": 1 } },
    { "id": "e3", "source": "n3", "target": "n4", "type": "smoothstep", "style": { "stroke": "#b1b1b7", "strokeWidth": 1 }, "label": "承認" },
    { "id": "e4", "source": "n4", "target": "n5", "type": "smoothstep", "style": { "stroke": "#b1b1b7", "strokeWidth": 1 } }
  ],
  "subflows": {},
  "updatedAt": "2026-09-01T00:00:00.000Z"
}
```

## AIへの指示テンプレート例

以下のような依頼文をAIに渡すと、上記仕様に沿ったJSONを生成させやすくなります。

> 添付のワークフローJSON仕様書に従って、「〈業務内容〉」の業務フローを表すJSONファイルを
> 生成してください。開始・終了を含め、担当者ごとにレーンを分けてください。エッジには
> 必ず `type: "smoothstep"` と `style: {"stroke":"#b1b1b7","strokeWidth":1}` を指定してください。
> 座標は各ノードのレーン軸位置だけレーン中心に合わせ、フロー軸は工程順に大きめの間隔で
> 並べてください。JSON以外の説明文は不要です。
