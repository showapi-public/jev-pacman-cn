# 多游戏 / 多模型架构设计

> 本文是 `docs/design-system.md` 的**前置**：先定「界面之外的骨架」（游戏契约、目录结构、路由、
> 模型目录、API 契约），再由它推导出对设计规范的增量。两者冲突时，以设计规范里的视觉条目为准。

状态：**已批准**（2026-09-24），执行计划见 `docs/plan-multi-game.md`（P0 文档 → P1 搬家 → P2 契约化 → P3 接蛇）。
已拍板：§8 的三处不诚实**一起修**；两个游戏的默认速度都是 **1×**；提交时机由你决定（每阶段收口后汇报）。

---

## 1. 目标与非目标

### 目标

1. 一个项目承载**多个游戏**，每个游戏一个页面；新增游戏的改动面收敛到「一个目录 + 一条注册」。
2. 右侧「模型决策可视化」成为**游戏无关的基准**，所有游戏共用同一套遥测、图表与交互。
3. 后端支持**多个兼容 Jev API 的模型/渠道**，UI 可切换并展示模型名。
4. 贪吃蛇（移植 patorjk/JavaScript-Snake 规则）作为第二个游戏落地，验证这套抽象确实够用。

### 非目标（本轮不做，但架构不挡路）

- 排行榜 / 跨局持久化对比：本轮只做「一局之内」的展示；跨局比较靠导出的 JSON。
- 非四向动作空间的游戏：`ActionVocab` 已为此留出「游戏自带动作盘」的出口，但不实现。
- 多游戏同屏对比（左右各一台机台）：不设计。
- 包名与部署目录改名：`package.json` 的 `name`、`deploy/deploy.env` 里的应用目录**保持不变**，
  避免把一次纯娱乐性重命名混进部署变更。

---

## 2. 现状诊断

耦合点比表面看起来集中。真正的游戏知识只在 4 处泄漏，其余都是可复用的。

| 层 | 文件 | 现状 | 判定 |
| --- | --- | --- | --- |
| 组件原语 | `components/ui/*`（9 个） | 与游戏无关 | ✅ 原样复用 |
| 图表 | `components/charts/*` | 只吃 `DecisionPoint[]` / `LatencyBucket[]` | 🟡 仅「截止线」要参数化 |
| 右栏 | `DecisionConsole` `DecisionCard` `DecisionTimeline` `SessionStats` `ConfidenceTrend` `DebugPane` `ProbabilityBars` `DirectionCompass` | 结构通用，但类型写死 `Direction`、事实表写死吃豆人 8 行指标、`来源` 只认 `source` | ❌ 需泛型化，**收益最大** |
| 循环 | `components/PacmanCanvas` | 固定步长循环 `controller.tick() → stepGame() → paint()` | 🟡 三个钩子是游戏的 |
| 控制器 | `lib/agent/controller.ts` | 直接 import `findNextDecisionPoint` / `distanceToTileCenter` / `ghostTarget` | ❌ 需要注入「游戏驱动」 |
| 观察/提问 | `lib/agent/{observation,providers,candidates}.ts`、`lib/jev/{prompt,validation}.ts`、`app/api/decide/route.ts` | `JevObservation` 是吃豆人形状；动作 = 4 个方向；问题文案写死 English 且点名 Pac-Man | ❌ 全链路口语化 |
| 引擎 | `lib/game/*`（9 个文件） | 纯函数 + 种子确定性（`mulberry32`，无 `Math.random`） | ✅ 形态理想，只需搬家 |
| 遥测 | `lib/agent/telemetry.ts` | 指标本身通用，`Metrics` 里混了吃豆人的 `pelletsEaten/level/lives` | 🟡 拆成 `AgentMetrics` + 游戏侧 `summary` |

**结论**：缺的不是复用度，而是一层**游戏适配器契约**。契约一立，右栏、遥测、图表、注册表、
模型切换全部天然多游戏。

---

## 3. 核心抽象

新增 `lib/games/types.ts`，是整套重构的唯一新概念。**它必须保持 React-free**：测试环境是
node（无 jsdom，`vitest.config.ts` 的 `include` 只收 `tests/**/*.test.ts`），一切可测逻辑都
不能碰 React。

### 3.1 `ActionId` 取代 `Direction`

```ts
export type ActionId = string;
```

吃豆人的 `UP|DOWN|LEFT|RIGHT` 留在它自己的目录里，蛇的 `UP|DOWN|LEFT|RIGHT` 也留在它自己的
目录里——**两者不共用类型**。跨层只传 `ActionId`。跨游戏复用四向动作盘靠 `ActionVocab`
（展示词表）而不是共用类型：

```ts
export interface ActionVocab {
  /** 展示顺序：概率阶梯并列时的固定次序，也是十字的槽位来源。 */
  readonly order: readonly ActionId[];
  /** 给人看的短标签：上/下/左/右。 */
  label(action: ActionId): string;
  /** 四向动作盘上的槽位；返回 null 的动作不进十字（非四向游戏自带动作盘）。 */
  slot(action: ActionId): "UP" | "DOWN" | "LEFT" | "RIGHT" | null;
}
```

箭头图标（Phosphor）由 UI 层按 `slot()` 统一映射，**不进 `lib/`**。

### 3.2 游戏状态基类

```ts
export interface GameState {
  status: GameStatus;      // READY | PLAYING | PAUSED | GAME_OVER | CLEARED（五态共用）
  tick: number;            // 固定步长计数
  epoch: number;           // 世界被替换时 +1：控制器靠它丢弃旧答案
  seed: number;
  playTimeMs: number;      // 游戏内时长，暂停不计
  score: number;           // 每个游戏都要有一个主读数
}
```

吃豆人的状态类型改名为 `PacmanState`（**纯改名**：同名会让 `GameDefinition<PacmanState>` 没法写），
`GameStatus` 改为从本文件转出、取消重复定义；蛇的 `SnakeState` 照此实现。

元数据也在这里，且**无泛型** —— 导航首页、头部切换器与路由表都能直接用它：

```ts
export interface GameMeta {
  readonly id: string;             // 路由段与注册键：小写、URL 安全
  readonly name: string;           // 游戏名
  readonly tagline: string;        // 一句话标语
  readonly decisionShape: string;  // 该游戏的决策形态一句话（导航卡第三行）
  readonly selfColor: string;      // 自身色的 CSS 变量引用，挂到 --self
}
```

### 3.3 决策点：一个标量距离，吃掉两个游戏的差异

吃豆人的「路口 + 提前三格预取 + 到路口前 0.15 格强制提交」，与蛇的「每次移动都要转向」，
可以统一成**同一个标量**：

```ts
export interface DecisionPoint {
  /** 决策的唯一标识。吃豆人 = `epoch:tile`；蛇 = `epoch:moveIndex`。 */
  key: string;
  /** 决策地点（格），只用于展示。吃豆人 = 路口；蛇 = 蛇头当前格。 */
  at: { x: number; y: number } | null;
  /** 合法动作。吃豆人剔掉墙；蛇剔掉 180° 反向。 */
  actions: readonly ActionId[];
  /** 距该决策点还有多少格。吃豆人 = 到路口的格数；蛇 = 到下次移动的剩余比例（0..1）。 */
  distance: number;
  /** 是否已抵达：此刻就必须定下来。 */
  arriving: boolean;
  /** 主体当前朝向，只给十字的中心针用。 */
  facing: ActionId | null;
}
```

映射表：

| | 吃豆人 | 贪吃蛇 |
| --- | --- | --- |
| `key` | `epoch:tileKey(junction)` | `epoch:moveIndex` |
| `actions` | 路口的可走方向（不含回头） | 四向减去 180° 反向 |
| `distance` | `distanceToTileCenter + steps`（格） | `(MOVE_MS - accum) / MOVE_MS`（格） |
| `arriving` | 蛇头格 == 路口格 | 累计时间已达 MOVE_MS |
| 游戏空间预取 `prefetch` | 3 格 | 1 格（= 一个移动周期） |
| 提交窗口 `commitWindow` | 0.15 格 | 0.05 格 |
| 墙钟预算 `budgetMs` | **500 ms** | **500 ms** |

两个游戏的**默认速度都是 1×**，所以默认口径下 500 ms 就是实际可用窗口 —— 跨游戏比较延迟才成立；
速度倍率会**等比压缩**这个窗口（2× 时只有一半时间作答），见 §8。

**控制器里那段预取/提交逻辑一行都不用改**——只是把 `findNextDecisionPoint` 换成了
`driver.decision(state)`。这正是本次重构成立的关键。

### 3.4 游戏驱动（agent 侧）

```ts
export interface GameDriver<S extends GameState> {
  /** 此刻应该瞄准的决策点；null = 不需要决策（走道 / 唯一活路 / 未开局）。 */
  decision(state: S): DecisionPoint | null;

  /** 预取距离（游戏空间，格）。**有效预取 = prefetch × speed**，见 §8。 */
  readonly prefetch: number;
  /** 提交窗口（游戏空间，格）：再近就必须定下来。 */
  readonly commitWindow: number;
  /** 1× 速度下的墙钟预算，供延迟直方图标出截止线。 */
  readonly budgetMs: number;

  /** 送给模型的结构化状态（不透明 JSON）。 */
  observe(args: { state: S; point: DecisionPoint; recent: readonly RecentDecision[] }): Observation;

  /** 一次提问：指令 + 事实表。 */
  frame(state: S, point: DecisionPoint): Question;

  /** 刻意笨但保住性命的兜底规则，返回动作与规则名。 */
  fallback(state: S, point: DecisionPoint): { action: ActionId; rule: string };

  /** 把答案落地。 */
  apply(state: S, action: ActionId): void;

  /** 调试覆盖层要画的东西。 */
  debug(state: S): unknown;
}
```

### 3.5 提问：事实表就是模型看到的东西

现在的流程是「客户端拼 observation → 服务端从 `observation.candidates` 反推
`criteria` 文案」。新流程把**事实表**提升为一等公民：

```ts
export interface FactRow {
  /** 表头（中文，给右侧「推理输入」表）。 */
  label: string;
  /** 送模型的英文标签；提示词保持全英文，与现状一致。 */
  modelLabel: string;
  /** 每个合法动作一个值；缺失显示 —。 */
  values: Record<ActionId, string>;
}

export interface Question {
  /** 系统提示词：这款游戏的目标与优先级。 */
  instructions: string;
  /** 共享指标行 × 合法动作列。 */
  facts: readonly FactRow[];
}
```

**不变式（写进设计规范）**：模型拿到的 `criteria` 与右栏「推理输入」表**是同一个对象**——
服务端把 `facts` 按 `${modelLabel}: ${value}` 拍平成 `criteria[action]`，客户端把同一份
`facts` 渲染成表格。两边不可能漂移，读者看到的正是模型看到的。

### 3.6 游戏定义（把两半缝起来）

```ts
export interface GameDefinition<S extends GameState> {
  readonly meta: GameMeta;          // id / 名称 / 标语 / 决策形态 / 自身色
  readonly agent: GameDriver<S>;
  readonly vocab: ActionVocab;

  createState(options: { seed: number }): S;
  start(state: S): void;
  pause(state: S): void;
  resume(state: S): void;

  step(state: S, dtMs: number): readonly GameEvent[];
  paint(ctx: CanvasRenderingContext2D, state: S, view: PaintView): void;
  /** 画布位图尺寸（井里 letterbox 的基准）。 */
  bitmap(state: S): { width: number; height: number };
  /** 事件 → 音效与粒子。表现层，改不了玩法。 */
  react(events: readonly GameEvent[], state: S, fx: FxSink): void;

  /**
   * 手挑权重的对照玩家（非学习），供「启发式」模式。
   *
   * 它是**游戏代码**：直接读完整状态即可，不必经过观察（那是给模型的）——
   * 让启发式去解 `DecideRequest` 只会逼出一个 cast。
   */
  heuristic(state: S, point: DecisionPoint, actions: readonly ActionId[]): ActionId;
  /** 导出 JSON 里的游戏侧汇总。 */
  summary(state: S): Record<string, number | string | null>;
}
```

`GameEvent` 是 `{ readonly type: string }`：框架只读 `type`（写日志、导出 JSON），
其余字段由各游戏自定，只有该游戏自己的 `react` 与文案函数会解释它们。
`GameStatus`（五态）、`GameState`（六个字段）、`Observation`、`RecentDecision`、`DecideRequest`、
`PaintView`、`FxSink` 同样定义在 `lib/games/types.ts`，即设计文档 §3 的全部契约都在这个文件里；
`lib/agent/types.ts` 只保留 agent 自己的东西（`DecisionProvider`、`DecideError`、
`DecisionTelemetry`、`AgentMetrics`、`ControllerSnapshot`）并**转出**它需要的那几个契约。

### 3.7 右栏的接缝：`ConsoleInput`

右栏只需要这一份输入——**零游戏知识**，这就是「复用基准」的落点：

```ts
export interface ConsoleInput {
  status: GameStatus;
  metrics: AgentMetrics;               // 拆出来的、纯 agent 的指标
  feed: readonly DecisionTelemetry[];
  controller: ControllerSnapshot;
  /** 本游戏的墙钟决策预算，用于延迟直方图的截止线。 */
  budgetMs: number;
  vocab: ActionVocab;
  steerable: boolean;                  // 手动模式：十字是方向盘不是检视工具
  debug: boolean;
  onSteer(action: ActionId): void;
}
```

---

## 4. 目录结构

对称迁移：吃豆人的引擎从 `lib/game/*` 搬进 `lib/games/pacman/`，与蛇并列。**这会让 122 项
既有测试的 import 路径全部要改**——机械改动，一次性付清，换取「新增游戏 = 新增一个目录」。

```
lib/
  agent/                    # 游戏无关
    controller.ts           #   AgentController<S>：注入 GameDriver<S>
    types.ts                #   ActionId / Observation / Question / DecisionTelemetry / …（新家）
    telemetry.ts            #   AgentMetrics + 直方图（截止线参数化）
    providers.ts            #   随机 / 启发式（chooser 注入）/ 录放 / 注入延迟
  jev/
    client.ts               #   + modelId 透传
    validation.ts           #   动作校验取代方向校验
    prompt.ts               #   只剩「facts → criteria」与服务端问题装配
    models.ts               #   模型目录（server-only）
  games/
    types.ts                #   ★ 本文第 3 节的全部契约
    registry.ts             #   GAME_META（只有元数据，无泛型）
    pacman/
      meta.ts               #   名称/标语/数据色/动作词表
      agent.ts              #   decision / observe / frame / fallback / heuristic / apply / debug
      index.ts              #   export const PACMAN: GameDefinition<PacmanState>
      engine.ts types.ts maze.ts movement.ts collision.ts pathfinding.ts
      ghosts.ts analysis.ts render.ts juice.ts
    snake/
      meta.ts agent.ts index.ts
      engine.ts types.ts analysis.ts render.ts
  audio/sfx.ts              #   不动
  ui.ts                     #   共享文案与格式化（游戏专属文案下沉到各 meta）
  use-game-session.ts       #   壳的状态/控制器/循环接线（今天 app/page.tsx 的 400 行一半在这）
  use-media-query.ts utils.ts

components/
  ui/                       #   9 原语，不动
  charts/                   #   2 张图，不动
  console/                  #   ★ 右栏，游戏无关
    DecisionConsole.tsx DecisionCard.tsx DecisionTimeline.tsx SessionStats.tsx
    ConfidenceTrend.tsx DebugPane.tsx ProbabilityBars.tsx ActionCompass.tsx ActionGlyph.tsx
  shell/                    #   ★ 壳与导航
    AppShell.tsx            #     头部 + 两栏栅格（今天的 app-shell 骨架）
    GameSwitcher.tsx        #     头部「切换游戏」弹层
    ModelPicker.tsx         #     模型选择（游戏页与导航页共用）
    MeterStrip.tsx          #     参数条布局原语（6 列 + 标签/值/附注层级）
    ControlBar.tsx          #     玩家 / 模型 / 速度 / 重新开始 / 更多
    GameNavCard.tsx         #     导航页的游戏卡
  games/
    pacman/GameCanvas.tsx PacmanMeters.tsx PacmanHelp.tsx
    snake/SnakeCanvas.tsx SnakeMeters.tsx SnakeHelp.tsx
    pages.tsx               #   ★ GAME_PAGES: Record<GameId, …>：唯一把「引擎 + UI」缝在一起的地方
```

**迁移映射**（旧 → 新）：

| 旧 | 新 |
| --- | --- |
| `lib/game/{engine,types,maze,movement,collision,pathfinding,ghosts,analysis,render,juice}.ts` | `lib/games/pacman/*` |
| `lib/agent/observation.ts` | 拆：通用契约进 `lib/agent/types.ts`，吃豆人的进 `lib/games/pacman/agent.ts` |
| `lib/agent/candidates.ts` | `lib/games/pacman/facts.ts`（并重写为 `FactRow[]`） |
| `lib/agent/fallback.ts` | `lib/games/pacman/agent.ts` |
| `components/DirectionCompass.tsx` | `components/console/ActionCompass.tsx`（吃 `ActionVocab`） |
| `components/PacmanCanvas.tsx` | 循环 → `components/games/pacman/GameCanvas.tsx`，外壳 → 复用 `shell` |
| `components/GameMeters.tsx` | `components/games/pacman/PacmanMeters.tsx` |
| `components/GameControls.tsx` | 拆：布局 → `shell/ControlBar.tsx`，游戏提示文案 → `meta.modeHints` |
| `components/HelpDialog.tsx` | `components/games/pacman/PacmanHelp.tsx` |
| `app/page.tsx` | 拆：导航 → `app/page.tsx`，机台 → `app/[game]/page.tsx` + `lib/use-game-session.ts` |

---

## 5. 路由与导航

```
app/
  page.tsx                 → 游戏导航首页；当 GAME_META.length === 1 时直接渲染那个游戏
  [game]/page.tsx          → 游戏页（generateStaticParams 由 GAME_META 生成，未知 id → notFound）
  api/decide/route.ts      → v2：动作 + 事实表 + 模型
  api/models/route.ts      → 模型目录（脱敏）
  layout.tsx               → metadata 用模板：`Jev 游戏台` / `%s · Jev 游戏台`
```

- 用**动态路由 + `generateStaticParams`** 而不是 N 个 `pacman/page.tsx`、`snake/page.tsx`：
  新增游戏 = 加一个目录 + 一条注册，不需要再建页面文件。
- 吃豆人的 URL 从 `/` 变成 `/pacman`；`/` 变成导航首页。只有一个游戏时 `/` 仍直接是那个游戏。
- 「切换游戏」放在**游戏页头部**：一个带 `aria-label="切换游戏"` 的幽灵图标按钮 → 打开弹层
  （复用既有的 Dialog 原语，**不引入新的 Radix 依赖**——`@radix-ui/react-popover` 与
  `react-dropdown-menu` 都不在依赖树里）。弹层里是游戏列表 + 「返回游戏导航首页」。

---

## 6. 多模型后端

### 6.1 模型目录

`.env` 里一份目录，**密钥只存在服务端**：

```ini
# 每条：id|显示名|baseURL|apiKey|模型名，`;` 分隔；空字段 = 继承 TYPESAFE_*
JEV_MODELS="official|官方|https://api.typesafe.ai|sk-official-xxx|jev-latest;self|自用渠道||sk-self-xxx|jev-latest"
# 默认选中哪一条；缺省 = 第一条
JEV_DEFAULT_MODEL=official
```

- `TYPESAFE_API_KEY` / `TYPESAFE_BASE_URL` / `TYPESAFE_DEFAULT_MODEL` **保留**为兼容路径：
  未设 `JEV_MODELS` 时合成唯一条目 `{ id: "default", label: <模型名> }`。今天的用户配置
  （`.env.local` 里的自用渠道）不改一行仍能跑。
- `GET /api/models` 只回 `{ default, models: [{ id, label, note, configured }] }`：
  `label` 是显示名（自用渠道），`note` 是模型名（jev-latest），**没有 key、没有 baseURL**。
- `configured: false`（该条目的 key 为空）也让前端知道，好在选择器上标注「未配置」。

### 6.2 API v2

```
POST /api/decide
{
  decisionId, game, modelId?,
  state,                      // 不透明 JSON（观察）
  actions: ActionId[],        // 合法动作
  instructions,               // 该游戏的系统提示词
  facts: FactRow[]            // 服务端拍平成 criteria
}
→ 200 { decisionId, action, confidence, probabilities, latencyMs, model, requestId }
→ 4xx/5xx { error: { kind, message }, latencyMs? }
```

- 服务端**仍然不认游戏**：它只知道「一次 Choice 提问」。
- `direction` → `action`；`isDirection` → `actions.includes(...)`。
- `mockChoice` 的方向序改为按 `actions` 的**到达顺序**取哈希（原来依赖
  `DIRECTION_ORDER`），保证 mock 依旧确定性且对未知动作集也成立。
- `modelId` 决定用哪条目录项建 client；`JEV_MOCK=true` 依旧全局生效。

### 6.3 切换语义

- **切模型即重开一局**（与既有「切换玩家」一致）。一局的遥测只属于一个模型，跨模型比较才干净。
- 遥测记录新增 `model: string | null`（谁答的）；`source` 仍是 `JEV|MOCK|RANDOM|HEURISTIC|SCRIPTED|FALLBACK`
  （怎么答的）。两轴分开，`DecisionCard` 的「来源」格改为「模型 · 来源」两格。
- `PlayMode` 的 `JEV` 标签从「Jev」改成「模型」；选择器在非模型模式下 `disabled`
  （按设计规范「不给无法完成的操作留 Tab 位」），并带一句说明为什么不可用。
- 选择持久化到 `localStorage`（`jev:model`），所以导航首页也能显示「当前模型」。

---

## 7. UI 增量

### 7.1 一个变量解决「游戏配色」

设计规范 §4.2 把琥珀钉死为「吃豆人本体 / 被选中方向」。蛇的本体是绿的，如果照抄就会翻转
这条规则。改法：引入**每局自身色** `--self`，挂在外壳元素上：

```tsx
<div className="app-shell" style={{ "--self": game.meta.selfColor }}>
```

`--self` 用在：得分主读数、动作盘被选中键与概率细条、概率阶梯选中行、时间线的占比条、
置信度图的「选项占比」序列。于是：

| 游戏 | `--self` | 画布数据色 |
| --- | --- | --- |
| 吃豆人 | `--pacman`（琥珀） | 迷宫蓝、豆子、四幽灵（不动） |
| 贪吃蛇 | `--snake-head`（绿） | 蛇身深绿、食物（新增 3 个数据 token） |

界面强调色**仍然只有靛蓝一个**。§4.2 的措辞从「琥珀 = 吃豆人本体」改成
「各游戏的自身色 = 该游戏画布主角的颜色，也用于概率条与被选中项；界面强调色仍只有靛蓝」。

### 7.2 新增组件

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| **游戏导航首页** | `app/page.tsx` | 不锁 `100dvh`（它是目录页，不是机台），复用同一套令牌；只有一层滚动条这条不变式照旧。内容：H1（`text-kpi`）+ 一段说明 + 模型选择 + 游戏卡列表（卡 = 整块 `<Link>`，含名称、标语、该游戏的决策形态一句话） |
| **游戏切换器** | 头部 | 幽灵图标按钮 → Dialog：游戏列表（当前项标出）+ 「返回游戏导航首页」 |
| **模型选择器** | 控制条 | `Segmented` 列出目录项（显示名 + 模型名），非模型模式时 `disabled`；导航页头部复用同一组件（`localStorage` 同一个键） |
| **参数条原语** | `shell/MeterStrip.tsx` | 6 列栅格 + 标签/值/附注三级层级，各游戏自己组装读数 |
| **控制条** | `shell/ControlBar.tsx` | 玩家 / 模型 / 速度 / 重新开始 / 更多（种子、机台、本局）——吃豆人的「更多」内容原样保留 |

### 7.3 蛇的读数与画布

- 盘面**固定 24×24**（上游按视口算尺寸，会破坏种子复现：同一 seed 应重放同一局）。
- 移动周期 `MOVE_MS = 500`，速度倍率作用于仿真时钟（与吃豆人同一套）。
- 读数 6 格：**长度**（主读数，`--self` 色）/ 吃到食物 / 已走步数 / 存活时长 / 剩余空格 / 历史最长
  （`localStorage`，对齐上游的 Highscore）。
- 画布：`--bg-well` 作底，蛇身圆角方块、蛇头更亮，食物为小圆；边框用 `--snake-body` 低透明度。
  `prefers-reduced-motion` 下食物不脉动。

### 7.4 需要同步改设计规范的地方

按项目约定「改动前先改这里」，`docs/design-system.md` 在动手前先补：

1. §1：从「一台机台加一块仪表盘」改成「一个游戏台：导航首页 + 每个游戏一台机台 + 一块共用的
   模型仪表盘」；两条主线（游戏画面/游戏参数、模型决策可视化）保留，只是不再绑在吃豆人上。
2. §2：新增导航页布局小节（不锁高度的流式壳 + 同样只有一层滚动条）。
3. §4.2：`--self` 自身色规则与「游戏数据色」表。
4. §6.1：方向十字 → 动作盘（`ActionVocab` 驱动）。
5. §6.3/§6.4：事实表来自 `Question.facts`（与模型 criteria 同一对象）；「路口」在某些游戏里叫「格子」。
6. §6.7：指标口径表增加「模型」维度（`请求数`、`来源`、`模型` 三列的区别）与蛇的对应口径。
7. §10：验收清单增加导航页、蛇页、模型/游戏切换的条目。

---

## 8. 顺带修掉的一处不诚实（已确认：一起修）

设计规范 §6.5 说延迟直方图 500 ms 那条边「等于 `DECISION_DEADLINE_MS`」，控件提示说
「速度只影响游戏推进的快慢，不影响决策的判定时限」。**两句都不完全成立**：

- 控制器按**游戏空间**的 3 格预取提问，而速度倍率改的是游戏时钟（`accumulator += elapsed * speed`）。
  默认 0.5× 时，覆盖这 3 格需要 **1000 ms 墙钟**，不是 500 ms。
- 于是「500 ms 截止」只在 1× 时成立；默认速度下「执行率」被系统性高估。

修法（三行级别，建议随本次一起做）：

1. 控制器的有效预取 = `driver.prefetch × speed`（**永远尽早问**，与吃豆人/蛇无关），
   墙钟预算因此与「游戏允许的最早提问时刻」一致。
2. `SessionStats` 的截止线标注改为 `budgetMs / speed`，直方图分桶边**保持固定**
   （它们是 1× 的参照系，跨局/跨游戏可比），`withinDeadline` 按实际截止线判定。
3. 控件提示改成「速度会等比压缩局面推进与决策窗口：2× 时模型只有一半的时间作答。」
4. 蛇的 `budgetMs` 也取 500 ms，于是「跨游戏延迟可直接比较」这句才真的成立。

---

## 9. 贪吃蛇引擎规格（移植自 patorjk/JavaScript-Snake，MIT）

上游是 DOM 版：`div` 方格 + 16 套 CSS 皮肤 + `window.SNAKE` 全局命名空间，
但它预留了 `moveSnakeWithAI({ grid, snakeHead, currentDirection, isFirstGameMove, setDirection })`
钩子——形状与我们要的「观察 → 动作」几乎一致。以下是**规则保真**与**有意偏离**。

### 保真

| 规则 | 上游行为 |
| --- | --- |
| 方向编码 | `0=上, 1=右, 2=下, 3=左`；`columnShift=[0,1,0,-1]`、`rowShift=[-1,0,1,0]` |
| 禁止 180° 反向 | `Math.abs(direction - lastMove) !== 2` 才接受；首步例外 |
| 增长速度 | 每吃一个食物 **+5 节**（`growthIncr = 5`） |
| 死亡 | 撞边界或撞到自身（尾巴让出的那格算合法） |
| 胜利 | 没有空格放食物（上游 20000 次尝试后放弃）→ CLEARED |
| 高分 | 以**长度**计，`localStorage` 保存 |

### 有意偏离（都要在代码注释里写明理由）

| 偏离 | 理由 |
| --- | --- |
| `Math.random` 放食物 → 项目自己的 `mulberry32` 种子随机 | 同一 seed 必须重放同一局，否则跨模型比较失真 |
| 盘面尺寸由视口推算 → 固定 24×24 | 同上：尺寸是难度的自变量，不能随窗口变 |
| `setTimeout` 递归驱动 → 固定步长引擎 + 累加器 | 与吃豆人同一套循环；隐藏标签页时不会偷跑 |
| 不吃上游 CSS/PNG 皮肤 | 设计规范：游戏配色是数据，界面只有靛蓝一个强调色 |
| 去掉 `alert()` 与「Play Again」对话框 | 状态由外壳的头部主操作与状态胶囊承担 |
| 初始长度 1（上游一致），身体用双端队列 | 上游的节点环形链表是渲染需要，纯引擎用数组更易测 |

### 观察与事实表草案

观察（送给模型的结构化状态）：目标一句话、盘面尺寸、蛇头、朝向、蛇身（有序 `[x,y]` 数组——
这是游戏状态本身，抽掉它游戏不可解）、食物位置与 BFS 距离、长度、已吃食物、已走步数、剩余空格。

事实表（共享行 × 动作列，同时是模型 criteria 与右栏「推理输入」表）：

| 行 | 值 |
| --- | --- |
| 立刻致命 | 是 / 否（撞墙或咬到自己） |
| 该方向可达空格数 | flood fill（越大越安全） |
| 距食物（格） | BFS 距离，不可达 — |
| 该方向是否沿当前朝向 | 是 / 否 |
| 该方向的自由度 | 走到下一格后仍可走的动作数（0 = 死胡同） |
| 蛇长 | 当前长度 |

兜底规则（刻意笨，1-ply，与吃豆人的兜底同一档）：

1. 保持当前朝向（若立刻致命为否）
2. 唯一安全方向
3. 安全方向中可达空格最多的一个
4. 都不安全 → 保持当前朝向，记为「死路，按当前朝向」

启发式对照玩家（手挑权重，非学习）：只考虑安全动作，在「可达空格数」与「距食物」之间加权，
并列时按固定动作顺序。

---

## 10. 测试策略

测试环境是 node、无 jsdom，所以**一切可测逻辑保持 React-free**。

**既有 122 项**：`lib/game/* → lib/games/pacman/*` 的路径替换；控制器用例补一个
`PACMAN.agent`；`app/api/decide/route` 的用例改 v2 载荷；`jev-live.test.ts` 同改
（它现在因模型侧 502 本来就失败，属外部原因，与本次无关）。

**新增（TDD，先写测试）**：

1. `snake-engine`：移动/增长 +5/撞墙/咬到自己/尾巴让位的合法性/胜利/同 seed 重放一致。
2. `snake-agent`：每步一个决策点、`actions` 排除反向、观察形状、事实表 6 行齐、
   `criteria` 与 `facts` 严格一致、兜底永不选立刻致命的动作（除非全致命）。
3. `controller`（用假游戏驱动）：预取随速度缩放、`budgetMs` 无关速度、提交窗口、世代切换作废。
4. `models`：`JEV_MODELS` 解析（含空字段继承、空 key、非法条目）、脱敏后不含 key/baseURL。
5. `route`：v2 载荷、动作校验、`modelId` 选择、mock 确定性。
6. `registry`：`GAME_META` 的 id 唯一；每个 id 在 `GAME_PAGES` 里有实现（类型层已保证，测试兜底运行时）。

---

## 11. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 122 项测试的 import 全改，容易改出假绿 | 分两阶段：先只搬家（路径替换，测试必须全绿），再做泛型化（行为不变，测试必须全绿），最后接蛇（新测试）。**每阶段独立提交**。 |
| 泛型 `S` 通过 React 组件树传播会变噪 | 右栏的接缝收窄到 `ConsoleInput`（零泛型）；`GamePage<S>` 是唯一泛型组件，由 `GAME_PAGES` 用具体类型实例化，避免 `any`。 |
| 四向动作盘对非四向游戏不适用 | `ActionVocab.slot()` 返回 `null` 即表示「不进十字」，非四向游戏自带动作盘（本轮不实现，但接口留出）。 |
| 蛇的兜底太笨 → 死得快 → 样本太少 | 兜底含一次 flood fill（与吃豆人兜底的 1-ply BFS 同档），能活到积累足够决策再做比较。 |
| 导航页破坏「单屏不滚动」 | 导航页明确**不复用** `.app-shell`（那是为机台锁高度的），用 `min-h-dvh` 流式壳；「只有一层滚动条」这条全局不变式仍然适用并纳入验收。 |
| 模型目录写进 env，改配置要重启 | 目录在**每次请求时**读 `process.env`（模块级不缓存），与 `JEV_MOCK` 同源；改 `.env` 重启进程生效，属可接受（与既有部署约定一致）。 |

---

## 12. 验收标准

- [ ] `npx tsc --noEmit` 无输出；`npx vitest run` 全绿（live 两项除外）。
- [ ] `/` 是导航首页（≥2 个游戏时），卡片可进 `/pacman` 与 `/snake`。
- [ ] 两个游戏页都能：开始/暂停/重开、切玩家、切模型、开「更多」、开「推理输入」、
      开调试、导出 JSON，且**全页只有一层滚动条**、迷宫/棋盘不被裁切
      （`画布可见高度 ÷ 画布自身高度 === 1`）。
- [ ] 切模型即重开一局；决策历史里每条记录都能看到**是哪个模型答的**。
- [ ] 把 `JEV_MODELS` 配成两条（一条故意不给 key），选择器显示出两条，未配 key 的那条
      有明确标注且被选中时报「未配置 API Key」。
- [ ] 1280×720 与 1440×900 下左右两栏无横向溢出；键序符合规范 §10。
- [ ] 设计规范已同步更新，且实测按它的 §10 走了一遍。
