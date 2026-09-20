# Jev Plays Pac-Man — 詳細実装計画書

## 0. Goal

TypeSafe AI の **Jev** にリアルタイムで Pac-Man をプレイさせる Web アプリを実装する。

ゲーム画面そのものを画像として Jev に渡すのではなく、

```text
Pac-Man game
    ↓
ゲームエンジンが現在状態を取得
    ↓
コードで合法手・距離・危険情報などを計算
    ↓
structured JSON
    ↓
Jev
    ↓
UP / DOWN / LEFT / RIGHT
    ↓
ゲームエンジン
```

という構成にする。

Jev はゲームそのものをシミュレーションしたり経路探索したりするのではなく、

> **「現在の状況では、利用可能な方向のうちどれを選ぶべきか」**

という局所的な判断を担当する。

Jev の追加学習、fine-tuning、RL は一切行わない。

**完全 zero-shot でプレイさせる。**

---

# 1. 完成形

Web ページを開くと中央に Pac-Man が表示される。

右側には Jev の意思決定がリアルタイム表示される。

例:

```text
JEV DECISION

Target junction: (14, 17)

UP      0.08
LEFT    0.71  ← SELECTED
RIGHT   0.21

Confidence: 0.83
Latency: 126 ms

Reasoning inputs
────────────────────
LEFT
  nearest pellet: 1
  danger ghost: 8
  pellets nearby: 7
  dead end: false

RIGHT
  nearest pellet: 2
  danger ghost: 3
  pellets nearby: 4
  dead end: false
```

Pac-Man は選ばれた方向へ進む。

ゲーム終了後は、

```text
Score
Pellets eaten
Ghosts eaten
Survival time
Jev decisions
Average latency
Jev decision success rate
Fallback count
```

を表示する。

---

# 2. 最重要設計方針

## Jevに毎フレーム操作させない

絶対に、

```text
60 FPS
↓
60回/秒 Jev API
```

とはしない。

Pac-Man の移動そのものはゲームエンジンが処理する。

Jev を呼ぶのは基本的に、

```text
交差点
または
複数方向から選択する必要がある地点
```

だけ。

つまり、

```text
───────┬──────
       │
       │
```

のような junction に近づいたときだけ Jev に問い合わせる。

直線は自動的に進む。

曲がる方向が1つしか存在しない場所でも Jev は呼ばない。

---

# 3. Jevの役割とコードの役割

責務を明確に分離する。

## コードが担当するもの

コード側は**事実の計算**を担当する。

例:

- 壁判定
- 移動
- 衝突判定
- Pellet取得
- Power Pellet取得
- Ghost移動
- 合法手の列挙
- 最短距離
- Ghostまでの距離
- Pelletまでの距離
- dead end判定
- 周囲のPellet数
- 次のjunction
- frightened状態
- スコア
- 残機

コード側で、

> 「LEFT が一番良い」

という最終判断は通常行わない。

---

## Jevが担当するもの

Jev は、

```text
UP
DOWN
LEFT
RIGHT
```

のうち、**現在合法なものだけ**から1つを選ぶ。

Jevには `Choice` を使用する。

Jevに自由な文章を生成させない。

---

# 4. 技術スタック

実装を単純化するため以下に固定する。

```text
Next.js
React
TypeScript
HTML Canvas
@typesafe-ai/sdk
Vitest
```

Node.js 20 以上を使用。

Jev の公式 JavaScript SDK:

```bash
npm install @typesafe-ai/sdk
```

APIキーは必ずサーバ側だけに置く。

```env
TYPESAFE_API_KEY=...
```

ブラウザへ絶対に送らない。

TypeSafe公式SDKでは `TypeSafeClient().systemOne(...)` と `choice(...)` が利用できる。

---

# 5. プロジェクト構成

最終的におおむね以下の構成にする。

```text
jev-pacman/
├── app/
│   ├── api/
│   │   └── decide/
│   │       └── route.ts
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── PacmanCanvas.tsx
│   ├── GameHud.tsx
│   ├── DecisionPanel.tsx
│   ├── DecisionFeed.tsx
│   ├── MetricsPanel.tsx
│   └── Controls.tsx
│
├── lib/
│   ├── game/
│   │   ├── types.ts
│   │   ├── maze.ts
│   │   ├── engine.ts
│   │   ├── movement.ts
│   │   ├── collision.ts
│   │   ├── ghosts.ts
│   │   ├── pathfinding.ts
│   │   └── analysis.ts
│   │
│   ├── agent/
│   │   ├── types.ts
│   │   ├── observation.ts
│   │   ├── candidates.ts
│   │   ├── controller.ts
│   │   ├── fallback.ts
│   │   └── telemetry.ts
│   │
│   └── jev/
│       ├── client.ts
│       ├── prompt.ts
│       └── validation.ts
│
├── tests/
│   ├── engine.test.ts
│   ├── maze.test.ts
│   ├── pathfinding.test.ts
│   ├── analysis.test.ts
│   ├── controller.test.ts
│   └── observation.test.ts
│
├── .env.example
├── package.json
├── README.md
└── IMPLEMENTATION_PLAN.md
```

ゲームロジックを React component 内に直接書かないこと。

---

# 6. ゲームエンジン

## 6.1 座標系

迷路は tile grid として扱う。

```ts
type TilePosition = {
  x: number;
  y: number;
};
```

ゲームロジック上の座標と Canvas pixel 座標を分離する。

```text
game coordinates
    ↓
render transform
    ↓
canvas coordinates
```

これによりゲーム速度やCanvasサイズを変更してもゲームロジックに影響しない。

---

# 7. Maze

MazeはASCIIまたは2次元配列として定義する。

例えば:

```text
###################
#........#........#
#.###.##.#.##.###.#
#o###.##.#.##.###o#
#.................#
#.###.#.#####.#.###.
#.....#...#...#....#
#####.### # ###.####
    #.#   G   #.#
#####.# ##### #.####
#....... P .......#
###################
```

実際にはより大きく、Pac-Manらしい maze を作る。

ただしオリジナルのゲームデータやspriteをコピーする必要はない。

記号:

```text
# = wall
. = pellet
o = power pellet
P = Pac-Man spawn
G = ghost spawn
space = walkable floor
```

---

# 8. Maze Validation

起動時に必ずmazeを検証する。

以下の異常があれば開発時に即座にthrowする。

```text
行ごとに幅が違う
Pac-Man spawnがない
Pac-Man spawnが複数ある
Ghost spawnがない
孤立したwalkable tileが存在する
到達不能なpelletが存在する
```

BFSで、

```text
Pac-Man spawn
↓
全walkable tile
```

の到達可能性を調べる。

これにより、coding agent が maze を少し間違えてもゲーム全体が壊れないようにする。

---

# 9. Direction

方向は文字列unionとして固定する。

```ts
export type Direction =
  | "UP"
  | "DOWN"
  | "LEFT"
  | "RIGHT";
```

helper:

```ts
directionVector(direction)
oppositeDirection(direction)
turnLeft(direction)
turnRight(direction)
```

を用意する。

---

# 10. Pac-Man movement

Pac-Man は tile center 間を連続的に移動する。

内部状態例:

```ts
interface PacmanState {
  tile: TilePosition;
  position: {
    x: number;
    y: number;
  };
  direction: Direction;
  requestedDirection: Direction | null;
  speed: number;
  lives: number;
}
```

方向変更は原則 tile center で行う。

壁へめり込ませない。

---

# 11. Fixed timestep

ゲームロジックは React のrender速度に依存させない。

```text
requestAnimationFrame
        ↓
elapsed time
        ↓
fixed 60 Hz simulation
```

を使用する。

例えば:

```ts
const FIXED_DT = 1 / 60;
```

accumulator方式でsimulationを進める。

---

# 12. Ghost

4体実装する。

```ts
type GhostMode =
  | "CHASE"
  | "SCATTER"
  | "FRIGHTENED";
```

最低限、

```text
Blinky
Pinky
Inky
Clyde
```

を識別できるようにする。

ただし初期実装では arcade版を完全再現する必要はない。

---

# 13. Ghost AI

GhostはJevで操作しない。

決定論的なゲームロジックにする。

### Blinky

Pac-Manの現在位置をtarget。

### Pinky

Pac-Manの進行方向数tile先をtarget。

### Inky

Pac-Man前方とBlinky位置からtargetを作る。

実装が複雑になる場合、

```text
Pac-Manの2～4 tile前方
```

でもよい。

### Clyde

Pac-Manが遠ければCHASE。

一定距離以内ならmaze cornerへ戻る。

---

# 14. Ghost junction movement

Ghost が intersection に到達した場合、

合法方向それぞれについて target までの距離を計算し、

```text
最短
```

を選ぶ。

通常時は即時reverseを避ける。

FRIGHTENED時のみseeded RNGで選ぶ。

`Math.random()` を直接ゲームロジックに使わない。

seeded RNGを用意する。

これにより同じseedでゲームを再現可能にする。

---

# 15. Power Pellet

Power Pellet取得時:

```text
GhostMode = FRIGHTENED
```

にする。

例えば:

```ts
FRIGHTENED_DURATION_MS = 7000;
```

終了前には点滅させてもよい。

FRIGHTENED Ghost と Pac-Man が衝突した場合、

```text
Pac-Man死亡
```

ではなく

```text
Ghost eaten
```

にする。

---

# 16. Junction detection

今回最も重要な部分。

あるtileの合法方向を:

```ts
getLegalDirections(tile)
```

で取得する。

例えば:

```text
LEFT
RIGHT
UP
```

ならjunction。

ただし Pac-Man が現在右向きなら、

```text
LEFT = reverse
```

なので、意味のある選択肢は

```text
RIGHT
UP
```

である。

---

# 17. Jevを呼ぶ条件

以下の場合だけJevを呼ぶ。

```ts
meaningfulLegalDirections.length >= 2
```

または

```text
現在方向が塞がれており、
複数の進行方向候補がある
```

場合。

逆に、

```text
一本道
強制corner
```

ではJevを呼ばない。

---

# 18. なぜ毎tile Jevを呼ばないか

Pac-Manではほとんどのtileに意思決定は必要ない。

例えば:

```text
──────────────>
```

ならRIGHTを維持するだけ。

したがってJevを呼ぶのは

```text
        ↑
───────┼───────
        ↓
```

などの場所だけにする。

これにより、

- API latency低減
- API call削減
- stateの意味が明確になる
- decision feedが理解しやすくなる
- Jevが得意なclassification問題になる

---

# 19. Jevは画像を見ない

Jev にCanvas screenshotを送らない。

現在のJevは、プログラム状態などのtext / JSONからtyped decisionを返す用途に設計されている。

したがって、

```text
Canvas
↓
computer vision
↓
Jev
```

ではなく、

```text
Game engine state
↓
JSON
↓
Jev
```

とする。

---

# 20. Observation生成

`observation.ts` がゲーム内部状態からJev用状態を作る。

**Jevに内部クラスや巨大なゲームオブジェクトをそのままserializeしない。**

専用のDTOを作る。

```ts
interface JevObservation {
  objective: string;

  game: {
    score: number;
    lives: number;
    pelletsRemaining: number;
    powerPelletsRemaining: number;
  };

  pacman: {
    tile: TilePosition;
    heading: Direction;
  };

  targetJunction: {
    tile: TilePosition;
    legalDirections: Direction[];
  };

  mode: {
    frightened: boolean;
    frightenedRemainingMs: number;
  };

  ghosts: GhostObservation[];

  candidates: Record<
    Direction,
    CandidateAnalysis
  >;

  recentDecisions: RecentDecision[];
}
```

---

# 21. CandidateAnalysis

合法方向それぞれについてコードで特徴量を計算する。

```ts
interface CandidateAnalysis {
  direction: Direction;

  nearestPelletDistance: number | null;

  pelletsWithin6Tiles: number;

  nearestPowerPelletDistance: number | null;

  nearestDangerousGhostDistance: number | null;

  nearestFrightenedGhostDistance: number | null;

  reachableArea: number;

  deadEnd: boolean;

  deadEndDepth: number | null;

  continuesForward: boolean;

  reversesDirection: boolean;
}
```

---

# 22. Pathfinding

距離計算にはBFSを使用する。

Mazeは小さいためA*などは不要。

関数を明確に分ける。

```ts
shortestPathDistance(
  from,
  target,
  maze
)
```

```ts
nearestPelletDistance(
  from,
  gameState
)
```

```ts
nearestGhostDistance(
  from,
  ghosts
)
```

---

# 23. 各候補の評価地点

例えば junction で LEFT を選択した場合、

まずLEFT側の隣接tileへ1step移動した状態を仮定する。

```text
junction
   ↓
candidate first tile
   ↓
各種BFS
```

すべてのcandidateについて同一ルールを適用する。

---

# 24. Danger ghost

以下のGhostだけをdangerousとする。

```text
CHASE
SCATTER
```

FRIGHTENED Ghost は dangerous として数えない。

---

# 25. Safe reachable area

必要であれば危険Ghost近傍を一時的にblockedとみなし、

candidateから到達できるtile数を flood fill する。

例:

```text
Ghostから距離 <= 2
```

をunsafe tileとする。

その上で、

```ts
reachableSafeArea
```

を計算する。

これは袋小路へ突っ込む判断を減らすのに有効。

ただしこれは補助特徴であり、

**コード側で最終行動を決めるためには使用しない。**

---

# 26. Jev request

サーバ側では概念的に以下を実行する。

```ts
import {
  choice,
  TypeSafeClient,
} from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const result = await client.systemOne({
  state: observation,

  questions: {
    direction: choice(
      `
Choose Pac-Man's next direction at the target junction.

Priority:
1. Stay alive.
2. Avoid dangerous ghosts.
3. When ghosts are frightened, eat them when reasonably safe.
4. Use power pellets when useful for survival.
5. Collect pellets efficiently.
6. Avoid dead ends and unnecessary reversals unless they are safer.

Use only the supplied game state and candidate facts.
Choose exactly one legal direction.
      `.trim(),

      criteria
    ),
  },
});
```

---

# 27. Dynamic criteria

重要。

すべての4方向を固定で候補にしない。

現在合法な方向だけを `criteria` に入れる。

例:

```ts
const criteria = {
  LEFT:
    "Move LEFT. Pellet distance 1. Dangerous ghost distance 8. 6 nearby pellets. Not a dead end.",

  RIGHT:
    "Move RIGHT. Pellet distance 2. Dangerous ghost distance 3. 3 nearby pellets. Not a dead end.",
};
```

するとJevは、

```text
LEFT
RIGHT
```

以外を返せない。

これがJevをゲーム制御へ利用する最大の利点の一つ。

---

# 28. Stateの例

実際に送るstateは例えば:

```json
{
  "objective": "Survive and maximize Pac-Man score.",
  "game": {
    "score": 1840,
    "lives": 2,
    "pelletsRemaining": 73,
    "powerPelletsRemaining": 2
  },
  "pacman": {
    "tile": { "x": 13, "y": 17 },
    "heading": "RIGHT"
  },
  "targetJunction": {
    "tile": { "x": 16, "y": 17 },
    "legalDirections": [
      "UP",
      "RIGHT",
      "DOWN"
    ]
  },
  "mode": {
    "frightened": false,
    "frightenedRemainingMs": 0
  },
  "ghosts": [
    {
      "name": "Blinky",
      "tile": { "x": 19, "y": 17 },
      "mode": "CHASE"
    }
  ],
  "candidates": {
    "UP": {
      "nearestPelletDistance": 1,
      "pelletsWithin6Tiles": 8,
      "nearestPowerPelletDistance": 7,
      "nearestDangerousGhostDistance": 9,
      "nearestFrightenedGhostDistance": null,
      "reachableArea": 38,
      "deadEnd": false,
      "deadEndDepth": null,
      "continuesForward": false,
      "reversesDirection": false
    },
    "RIGHT": {
      "nearestPelletDistance": 1,
      "pelletsWithin6Tiles": 4,
      "nearestPowerPelletDistance": 10,
      "nearestDangerousGhostDistance": 2,
      "nearestFrightenedGhostDistance": null,
      "reachableArea": 31,
      "deadEnd": false,
      "deadEndDepth": null,
      "continuesForward": true,
      "reversesDirection": false
    }
  }
}
```

---

# 29. Jevにmaze全体を毎回渡さない

MVPではmaze全体を毎request送信しない。

既存のJev Pac-Manデモではmaze・actors・legal directionsをstructured stateとして与える方式が確認されている。

ただし今回の実装では、より安定させるため、

```text
巨大なmaze JSON
```

より、

```text
必要なgame state
+
各candidateについてコードで算出した事実
```

を中心に渡す。

Jevが不得意な低レベル経路探索を減らし、

**意味的なdecisionに集中させる。**

---

# 30. Optional raw mode

完成後、研究・比較用として

```text
ASSISTED
RAW
```

の2モードを追加してもよい。

### ASSISTED

candidate特徴量あり。

### RAW

maze + actors + legal directionsのみ。

これにより、

> engineered state representation がJevのゲーム性能をどれだけ改善するか

を比較できる。

ただしMVPではASSISTEDのみ実装する。

---

# 31. API Route

ブラウザからTypeSafe APIを直接呼ばない。

```text
browser
   ↓
POST /api/decide
   ↓
Next.js server
   ↓
TypeSafe
```

とする。

理由:

```text
TYPESAFE_API_KEY
```

をブラウザへ漏らさないため。

---

# 32. /api/decide input

```ts
interface DecideRequest {
  decisionId: string;
  observation: JevObservation;
  legalDirections: Direction[];
}
```

---

# 33. /api/decide output

```ts
interface DecideResponse {
  decisionId: string;

  direction: Direction;

  confidence: number | null;

  probabilities: Partial<
    Record<Direction, number>
  >;

  latencyMs: number;

  model: string | null;
}
```

---

# 34. API response validation

サーバから返ってきた値を信用しきらない。

必ず、

```ts
legalDirections.includes(direction)
```

を再確認する。

不正ならJev decisionとして採用しない。

---

# 35. Real-time latency対策

Jev APIをjunctionに到達してから呼ぶと、

```text
Pac-Man
↓
junctionで停止
↓
API待ち
```

となる。

これを避ける。

既存のJev Pac-Manでも、Pac-Manが動き続けられるよう**到達前のjunctionについて問い合わせる方式**が使われている。

---

# 36. Junction lookahead

Pac-Manがcorridorを進んでいる間に、

```ts
findNextDecisionPoint(
  currentTile,
  currentDirection
)
```

を実行する。

例えば:

```text
Pac-Man
   ↓

P ─ ─ ─ ─ ─ J
            junction
```

このJを事前に見つける。

---

# 37. Prefetch distance

初期値:

```ts
const DECISION_PREFETCH_TILES = 3;
```

Pac-Manがjunctionから3tile以内へ入ったら、

```text
Jev request
```

を開始する。

Pac-Man自体は停止しない。

---

# 38. Pending decision

controllerは、

```ts
pendingDecision
```

を最大1つ保持する。

```ts
interface PendingDecision {
  decisionId: string;

  junction: TilePosition;

  requestedAt: number;

  promise: Promise<DecisionResult>;
}
```

同じjunctionについて複数requestを送らない。

---

# 39. Stale response

非常に重要。

Jev responseが返った時点で、

```text
Pac-Manが既にjunctionを通過した
死亡した
ゲームがrestartされた
別のlevelへ移動した
```

可能性がある。

そのため、

```ts
gameEpoch
decisionId
targetJunction
```

をチェックする。

古いresponseは絶対に適用しない。

```text
response
↓
decision still relevant?
    ↓ yes
apply
    ↓ no
discard
```

---

# 40. Game epoch

ゲーム開始時:

```ts
gameEpoch++;
```

死亡時やrestart時にも更新する。

requestにはepochを関連付ける。

response epochが違えば無視する。

---

# 41. Decision timing

状態遷移は以下。

```text
IDLE

↓ junction detected

REQUESTING

↓ response received

READY

↓ Pac-Man enters junction

APPLIED

↓ next corridor

IDLE
```

responseがjunction到達までに来なければ、

```text
FALLBACK
```

を実行する。

---

# 42. Fallback

Fallbackを高度なAIにしてはいけない。

Jevが失敗したときに別のbotが実質ゲームをプレイしてしまうため。

fallbackは単純にする。

優先順位:

```text
1. 現在方向を維持できる → straight
2. reverse以外の合法方向が1つ → それ
3. dangerous ghostから最も離れる合法方向
4. deterministic direction order
```

最後のtie break:

```text
UP
LEFT
DOWN
RIGHT
```

の固定順。

fallbackを使ったdecisionは必ずUI上で

```text
FALLBACK
```

と表示する。

---

# 43. Jevがゲームをプレイしていることを保証する

通常のdecisionについて、

```text
heuristic score
```

でJevの出力を上書きしない。

そうすると

> 実際にはheuristic botがプレイしている

状態になってしまう。

Jevのresponseが、

```text
期限内
合法
current decisionに対応
```

していればそのまま採用する。

---

# 44. Confidence

Jevの `confidence` と `probabilities` はUIに表示する。

例:

```text
UP      ███░░░░░░░ 0.27
LEFT    ███████░░░ 0.65
RIGHT   █░░░░░░░░░ 0.08

confidence 0.76
```

ただし初期実装では、

```text
confidenceが低い
```

という理由だけでdecisionを上書きしない。

評価用データとして保存する。

---

# 45. Recent decision history

Jev自体のprevious API callに依存しない。

必要な履歴はstateへ明示的に入れる。

最大3件程度。

```json
[
  {
    "junction": [12, 7],
    "chosen": "LEFT"
  },
  {
    "junction": [8, 7],
    "chosen": "DOWN"
  }
]
```

用途はループ回避。

巨大なhistoryは入れない。

---

# 46. Game rendering

Canvasを使用する。

ReactでtileごとにDOM elementを生成しない。

Canvas描画内容:

```text
walls
pellets
power pellets
Pac-Man
ghosts
frightened ghosts
```

ゲームロジックとrenderを完全に分離する。

---

# 47. Visual design

画面構成:

```text
┌──────────────────────────────────────────────────────────┐
│ JEV PLAYS PAC-MAN                           LIVE ●       │
├────────────────────────────┬─────────────────────────────┤
│                            │ JEV DECISION                │
│                            │                             │
│                            │ LEFT        71%             │
│        GAME CANVAS         │ UP          19%             │
│                            │ RIGHT       10%             │
│                            │                             │
│                            │ Confidence  0.83             │
│                            │ Latency     126 ms           │
├────────────────────────────┼─────────────────────────────┤
│ Score  1840                │ DECISION FEED               │
│ Lives  ● ●                 │ #53 LEFT   126ms            │
│ Pellets 73                 │ #52 UP      104ms            │
│ Level 1                    │ #51 RIGHT   131ms            │
└────────────────────────────┴─────────────────────────────┘
```

dark UI を基本とする。

ゲームそのものが最も目立つようにする。

---

# 48. Controls

最低限:

```text
Start
Pause
Restart

Mode:
Jev
Manual

Speed:
0.5×
1×
2×
```

初期デモでは

```text
0.5×
```

をdefaultにしてよい。

安定動作を確認した後1×へ上げる。

---

# 49. Manual mode

keyboard:

```text
ArrowUp
ArrowDown
ArrowLeft
ArrowRight
```

で操作可能にする。

これはゲームエンジン自体が正しく動いているか検証するために必須。

**Jevを接続する前にManual modeを完成させること。**

---

# 50. Telemetry

すべてのJev decisionを保存する。

```ts
interface DecisionTelemetry {
  decisionId: string;

  tick: number;

  junction: TilePosition;

  legalDirections: Direction[];

  requestedAt: number;

  respondedAt: number | null;

  latencyMs: number | null;

  choice: Direction | null;

  probabilities:
    Partial<Record<Direction, number>>;

  confidence: number | null;

  source:
    | "JEV"
    | "FALLBACK";

  status:
    | "APPLIED"
    | "STALE"
    | "TIMEOUT"
    | "ERROR"
    | "INVALID";
}
```

---

# 51. Metrics

リアルタイムで以下を集計する。

```text
Jev requests
Jev applied decisions
Fallback decisions
Stale responses
Errors
Mean latency
p50 latency
p95 latency
Current score
Pellets eaten
Ghosts eaten
Survival time
```

---

# 52. Debug mode

URLまたはUIでdebug表示をONにできるようにする。

表示:

```text
tile coordinates
junction tiles
current target junction
legal directions
ghost targets
candidate metrics
pending Jev request
```

例:

```text
?debug=1
```

---

# 53. Raw state viewer

右パネルに、

```text
STATE
```

タブを用意する。

Jevへ実際に送信したJSONを表示する。

これはdemoとして非常に重要。

ユーザーが

> Jevに何を見せているのか

を確認できる。

---

# 54. API status

UI上に、

```text
JEV ONLINE
JEV REQUESTING
JEV ERROR
FALLBACK
```

などを表示する。

API key未設定の場合、

ゲームをクラッシュさせない。

```text
JEV API key not configured.
Manual mode is still available.
```

と表示する。

---

# 55. Error handling

以下はすべてゲーム継続可能にする。

```text
network error
401
429
5xx
invalid response
timeout
stale response
```

Jev障害でgame loopをthrowしてはいけない。

---

# 56. API rate control

同じdecisionに対して複数requestを送信しない。

さらに最低request intervalを設定する。

例:

```ts
MIN_JEV_INTERVAL_MS = 100;
```

junction decision自体がそれより低頻度なので、通常は問題にならない。

---

# 57. Game restart

Restart時は以下を完全resetする。

```text
engine
score
lives
pellets
ghosts
pending decision
recent decisions
telemetry
metrics
```

かつ

```ts
gameEpoch++
```

して古いAPI responseを無効化する。

---

# 58. Deterministic simulation

ゲームseedを保持する。

例:

```text
seed = 42
```

UIから変更できるようにしてもよい。

同じseedなら、

Jev decisionを固定してreplayした場合、

同じゲーム結果になるようにする。

---

# 59. Replay

余力があれば、

```text
telemetry export
```

を実装する。

```json
{
  "seed": 42,
  "decisions": [...]
}
```

を保存。

APIを呼ばずdecisionをreplayできるようにする。

これはdebugと比較実験に有用。

---

# 60. Baselines

Jev性能を評価するため、最終的に以下を用意する。

```text
MANUAL
RANDOM
HEURISTIC
JEV
```

ただしUI上のメインはJEV。

### RANDOM

合法方向からseeded random。

### HEURISTIC

candidate特徴から決定論的に選択。

### JEV

Jev choice。

これによって、

```text
Jevが本当にrandomより良いか
```

を測定できる。

---

# 61. Evaluation protocol

同じmaze・同じghost RNG seedで複数試行する。

例えば:

```text
20 seeds
```

について、

```text
Random
Heuristic
Jev
```

を比較する。

指標:

```text
score
pellets eaten
survival time
levels completed
ghosts eaten
```

Jevが必ず勝つ必要はない。

目的は

> Jevがstructured stateだけからリアルタイムゲームdecisionを行えること

を示すこと。

---

# 62. Test strategy

Jev APIを接続する前にゲームを完全にテストする。

---

# 63. Maze tests

必須:

```text
maze dimensions valid
spawn exists
all pellets reachable
all walkable tiles connected
```

---

# 64. Movement tests

tiny test mazeを作る。

確認:

```text
wallを通れない
corridorを進める
junctionでturnできる
illegal turnできない
reverseできる
```

---

# 65. Pellet tests

確認:

```text
pellet取得
score増加
pellet消滅
power pellet取得
frightened mode開始
```

---

# 66. Collision tests

確認:

```text
normal ghost collision → life loss
frightened ghost collision → ghost eaten
```

---

# 67. Pathfinding tests

人工mazeで正解距離が分かるケースを使用。

```text
A...B
```

など。

BFS距離を直接assertする。

---

# 68. Candidate analysis tests

例えば:

```text
ghostがRIGHT側1tile
LEFT側にpellet多数
```

というtiny mazeを作る。

期待:

```text
RIGHT.nearestDangerousGhostDistance
<
LEFT.nearestDangerousGhostDistance
```

を確認。

ここでは、

```text
LEFTを選ぶべき
```

とはassertしない。

analysis layerは事実だけを返すため。

---

# 69. Controller tests

fake Jev clientを使用する。

```ts
FakeJevClient
```

を作る。

以下をテスト:

### normal

```text
request
→ LEFT
→ junction
→ LEFT applied
```

### delayed

```text
request
→ junction通過
→ response
→ ignored
```

### restart

```text
request
→ restart
→ old response
→ ignored
```

### error

```text
request throws
→ fallback
→ game continues
```

---

# 70. Mock Jev

実APIがなくても全体を開発できるよう、

```env
JEV_MOCK=true
```

をサポートしてもよい。

mockは例えば、

```text
first legal direction
```

またはseeded randomを返す。

UI・controller・telemetryまでAPIキーなしで確認可能にする。

---

# 71. Integration test

fake server latencyを設定可能にする。

```text
0 ms
100 ms
300 ms
700 ms
1500 ms
```

すべてでゲームがクラッシュしないこと。

特に1500ms responseはstaleとして安全に破棄できること。

---

# 72. Stress test

seeded random decisionで最低、

```text
10,000 simulation ticks
```

走らせる。

確認:

```text
NaN coordinatesなし
wall penetrationなし
invalid directionなし
unhandled exceptionなし
```

---

# 73. 実装順序

以下の順番を厳守する。

## Phase 1 — Project bootstrap

実装:

```text
Next.js
TypeScript
Canvas
Vitest
```

確認:

```bash
npm run dev
npm test
npm run build
```

すべて成功。

---

## Phase 2 — Maze + Manual Pac-Man

実装:

```text
maze
movement
pellets
manual controls
render
```

この時点ではGhostなし。

Manualでmaze全体を移動できること。

---

## Phase 3 — Ghosts

実装:

```text
ghost movement
CHASE
SCATTER
FRIGHTENED
collisions
lives
```

Manual modeで普通のPac-Manゲームとして遊べる状態にする。

**ここまでJevを入れない。**

---

## Phase 4 — Path analysis

実装:

```text
BFS
junction detection
next junction prediction
candidate analysis
```

debug modeでcandidate情報を画面表示する。

---

## Phase 5 — Fake agent

Jevの代わりに、

```text
FakeDecisionProvider
```

を接続。

architecture:

```ts
interface DecisionProvider {
  decide(
    observation: JevObservation
  ): Promise<DecisionResult>;
}
```

Jev固有コードをcontrollerへ直接書かない。

---

## Phase 6 — Async controller

実装:

```text
prefetch
pending decisions
decision IDs
game epoch
stale protection
fallback
```

fake latencyで動作確認。

---

## Phase 7 — Jev integration

`/api/decide` を追加。

TypeSafe SDKを接続。

`.env.local`:

```env
TYPESAFE_API_KEY=...
```

実APIからChoiceを取得。

---

## Phase 8 — Decision visualization

追加:

```text
probability bars
confidence
latency
decision feed
raw JSON
API status
```

---

## Phase 9 — Evaluation

追加:

```text
Random
Heuristic
Jev
seed selection
metrics
telemetry export
```

---

# 74. Definition of Done — Functional

以下をすべて満たしたら実装完了。

- Webアプリが起動する
- mazeが描画される
- Manual modeでプレイできる
- Ghostが正常に動く
- Pellet / Power Pelletが機能する
- Pac-Man死亡・残機が機能する
- Jev modeを開始できる
- junction前にJev requestが発生する
- Jevが合法方向のみ返す
- responseがPac-Manに適用される
- game loopがAPI待ちで停止しない
- stale responseが適用されない
- API failure時もgameが継続する
- decision probabilitiesが表示される
- latencyが表示される
- decision feedが表示される
- restartが正常に動く
- API keyがclientへ露出しない
- testsが通る
- production buildが通る

---

# 75. Definition of Done — Jev integrity

以下も必須。

Jevモード中、

```text
Jev responseが正常
```

なら、

**最終方向は必ずJevのChoiceを採用する。**

コード側で、

```text
Jev said LEFT
but heuristic thinks RIGHT is better
→ RIGHT
```

のような上書きをしない。

fallbackが発生した場合は必ずログへ残す。

これにより、

> 「JevがPac-Manをプレイしている」

という主張と実装を一致させる。

---

# 76. Definition of Done — Robustness

以下を手動確認。

```text
API keyなし
network offline
API error
very slow API
restart during request
pause during request
death during request
speed change during request
```

いずれでもアプリがクラッシュしない。

---

# 77. README

READMEには必ず以下を含める。

```text
What is this?
Architecture
Why structured state instead of screenshots?
Setup
TYPESAFE_API_KEY
Run
Controls
How Jev decides
Fallback behavior
Metrics
Testing
Limitations
```

---

# 78. READMEで明記すること

Jevはゲームから学習しているわけではない。

```text
No fine-tuning
No reinforcement learning
No previous-game memory
```

各decisionでは、

```text
current structured game state
```

を受け取り、その場で方向を選択する。

つまりこのプロジェクトは、

> **zero-shot real-time control with a System One decision model**

のdemoである。

---

# 79. 最初から実装しないもの

MVPでは以下を実装しない。

```text
画像認識
スクリーンショット入力
OCR
Pac-Man emulator
original ROM
online learning
reinforcement learning
LLM reasoning
vector database
database
authentication
multiplayer
mobile app
```

不要な複雑性を入れない。

---

# 80. 最重要の実装原則

実装中に迷った場合は以下を優先する。

```text
1. Game engine is deterministic.
2. Code computes facts.
3. Jev makes decisions.
4. Jev sees only relevant structured state.
5. Jev only chooses legal actions.
6. API calls happen only when a choice is required.
7. Never block the game loop waiting for Jev.
8. Never apply stale decisions.
9. Never expose the API key.
10. Every fallback is observable.
```

---

# 81. 最終アーキテクチャ

```text
                         ┌─────────────────┐
                         │    Pac-Man      │
                         │   Game Engine   │
                         └────────┬────────┘
                                  │
                           current state
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ State Analyzer  │
                         │                 │
                         │ BFS             │
                         │ Ghost distance  │
                         │ Pellet distance │
                         │ Dead ends       │
                         │ Legal actions   │
                         └────────┬────────┘
                                  │
                          structured JSON
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Agent Controller│
                         └────────┬────────┘
                                  │
                           /api/decide
                                  │
                                  ▼
                         ┌─────────────────┐
                         │      Jev        │
                         │                 │
                         │ Choice          │
                         │ UP / DOWN /     │
                         │ LEFT / RIGHT    │
                         └────────┬────────┘
                                  │
                          typed decision
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Validate /      │
                         │ stale check     │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Pac-Man action  │
                         └─────────────────┘
```

---

# 82. 最終的に見せたいデモ

ユーザーがページを開く。

```text
START JEV
```

を押す。

Pac-Manが自動で動き始める。

junctionへ近づく。

右パネル:

```text
ASKING JEV...
```

約100～数百ms後:

```text
JEV #18

UP       12%
LEFT     76%  ←
RIGHT    12%

Confidence 0.88
Latency   117ms
```

Pac-Manは停止せずjunctionへ到達し、

```text
LEFT
```

へ曲がる。

Ghostが接近するとJevが逃げる方向を選ぶ。

Power Pelletを取得すると、

```text
nearestFrightenedGhostDistance
```

を見てGhostを追跡する場合もある。

すべてのdecisionが右側へ流れる。

これがこのプロジェクトの完成形とする。

---

# 83. Coding Agentへの最終指示

この計画を実装する際は、一度に全機能を作らないこと。

必ず、

```text
Phase 1
↓
test
↓
Phase 2
↓
test
↓
Phase 3
↓
test
...
```

の順に進める。

各Phase終了時に、

```bash
npm test
npm run build
```

を実行する。

既存コードが動かない状態のまま次Phaseへ進まない。

曖昧な箇所があった場合、新しい複雑な仕組みを追加するのではなく、

**この文書で定義された最も単純な実装を選択すること。**

最優先事項は、

> **「Pac-Manの安定したゲームエンジン」と「Jevの意思決定」を明確に分離し、Jevが実際にゲームを操作していることを観察可能にすること。**

である。