# 多游戏 / 多模型 实现计划

> 依据：`docs/design-multi-game.md`（架构决策）与 `docs/design-system.md`（视觉唯一权威）。
> 本文是**执行清单**：每个任务都给到文件路径与可复跑的验收动作，任何一条不绿不进下一步。

状态：**已批准**（2026-09-24），按本文顺序执行
基线：HEAD `6ce9646`，工作区干净；`npx tsc --noEmit` 无输出；`npx vitest run` 118/120
（`tests/jev-live.test.ts` 2 项因模型侧 502 失败，属外部原因，与本次重构无关）。

**已拍板的四个决策**（2026-09-24）：

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 本计划 | **批准**，按 P0 → P1 → P2 → P3 → P4 顺序执行 |
| 2 | 三处「不诚实」 | **一起修**（控制器不缩放预取、截止线 = `budgetMs ÷ speed`、提示文案改实话） |
| 3 | 默认速度 | **两个游戏都是 1×**（预算与文档口径一致、跨游戏可比） |
| 4 | 提交 | **不自动提交**：每阶段收口后把改动范围、验证结果与建议的提交信息交给你，由你决定何时提交 |

---

## 0. 执行纪律（每个阶段都适用）

1. **收口三件套**：`npx tsc --noEmit`（必须无输出）→ `npx vitest run --reporter=dot`（live 两项除外必须全绿）
   → 涉及界面的阶段再走一遍浏览器实测。
2. **界面实测口径**（`design-system.md` §10 逐条）：
   - `JEV_MOCK=true npm run dev`（确定性后端，免模型不稳定干扰）；
   - 走 `web-access` 的 CDP 代理（端口 3456），**量数据前先 `Page.reload`**（HMR 滞后）；
   - 先把其它标签页关掉把目标页置前（后台页 `document.hidden === true`，游戏循环会正确暂停）；
   - Tab/分段控件必须用真实指针事件（`/clickAt`），合成 `click()` 无效。
3. **不自动提交**。每个阶段收口后，把「改了哪些文件 + 验证结果 + 建议的提交信息」整理给你，
   由你决定何时提交；建议信息：P1 = `重构：吃豆人引擎搬到 lib/games/pacman（纯路径变更）`、
   P2 = `重构：多游戏契约与外壳（吃豆人迁入 /pacman）`、P3 = `feat：接入贪吃蛇（多游戏架构验证）`。
4. **不做顺手重构**：每个任务只做清单里写的事，发现的其它问题记进 `docs/review.md` 留到最后一阶段。
5. 交付前最后一次：`CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`（沙箱批量删除守卫会拦收尾清理）。

---

## 1. 阶段与任务总览

| 序 | 任务 | 阶段 | 依赖 |
| --- | --- | --- | --- |
| P0-1 | 更新设计规范（7 处增量） | 0 文档先行 | — |
| P1-1 | 纯搬家 `lib/game` → `lib/games/pacman` | 1 搬家 | P0-1 |
| P2-1 | 契约层 `lib/games/{types,registry}.ts` | 2 契约化 | P1-1 |
| P2-2 | 吃豆人 driver（meta / facts / agent） | 2 | P2-1 |
| P2-3 | 泛型化 agent 层 + 速度语义修正 | 2 | P2-2 |
| P2-4 | jev 层泛型化 + API v2 + 模型目录 | 2 | P2-3 |
| P2-5 | 右栏 `components/console/*` + `--self` | 2 | P2-4 |
| P2-6 | 外壳 `components/shell/*` + 会话 hook + 路由 + 吃豆人页面 | 2 | P2-5 |
| P2-7 | **Phase 2 收口验证（吃豆人）** | 2 | P2-6 |
| P3-1 | 贪吃蛇引擎（纯函数 + 种子确定性，TDD） | 3 蛇 | P2-7 |
| P3-2 | 贪吃蛇 agent 侧（决策/观察/事实表/兜底，TDD） | 3 | P3-1 |
| P3-3 | 贪吃蛇渲染 / 画布 / 面板 / 注册 | 3 | P3-2 |
| P3-4 | **Phase 3 收口验证（蛇 + 导航首页）** | 3 | P3-3 |
| P4-1 | 文档收尾、设计规范复检、代码审查 | 4 收尾 | P3-4 |

**为什么是这个顺序**：P1 只动路径、行为零变化，用来**证明 120 项测试仍然可信**；P2 每一步都让
「泛型化的层」有唯一的真实消费者（吃豆人）并保持编译，避免出现「半泛型化」的中间态长驻；
P3 才引入第二个实现，此时契约已被一个真实游戏打磨过一遍。

---

## 2. Phase 0 —— 文档先行

### P0-1 更新设计规范：多游戏增量

按项目约定「改动前先改 `docs/design-system.md`」。7 处增量（编号对应 `design-multi-game.md` §7.4）：

| # | 位置 | 改什么 |
| --- | --- | --- |
| 1 | §1 这个界面是什么 | 「一台机台 + 一块仪表盘」→「**一个游戏台**：导航首页 + 每游戏一台机台 + 一块共用的模型仪表盘」；两条主线保留，不再绑在吃豆人上 |
| 2 | §2 布局规范 | 新增 **§2.5 导航页**：`min-h-dvh` 流式壳、不复用锁高度的 `.app-shell`、「只有一层滚动条」不变式照旧 |
| 3 | §4.2 颜色含义 | 新增 **`--self` 每局自身色**规则与「游戏数据色」表（吃豆人=琥珀、蛇=蛇头绿、新增 3 个蛇数据 token）；措辞从「琥珀 = 吃豆人本体」改成「各游戏自身色 = 该游戏画布主角色」；强调色仍只有靛蓝 |
| 4 | §6.1 | 「方向十字 `DirectionCompass`」→「**动作盘 `ActionCompass`**」，由 `ActionVocab` 驱动；非四向游戏 `slot()` 返回 `null` 时自带动作盘 |
| 5 | §6.3 / §6.4 | 「推理输入」表来自 `Question.facts`（**与模型 criteria 严格同源**）；指标行中的「路口」在部分游戏里叫「格子」 |
| 6 | §6.7 指标口径 | 增加**模型维度**：`请求数` / `来源`（怎么答的）/ `模型`（谁答的）三列的区别；补蛇的对应口径 |
| 7 | §10 验证 | 验收清单增加：导航页、蛇页、游戏切换、模型切换（含未配置 key 的条目）四组条目 |

**验收**：`grep -n` 能在这 7 处找到新措辞；文档内所有出现「方向十字」「吃豆人本体」的位置都已改口径，
不留自相矛盾的旧句。**此任务只改文档，不碰代码**，单独提交。

---

## 3. Phase 1 —— 纯搬家（行为零变化）

### P1-1 `lib/game/*` → `lib/games/pacman/*`

1. `git mv lib/game lib/games/pacman`（保留 git 历史；目录内部是 `./xxx` 相对导入，整体移动后自动成立）。
2. 替换全部外部引用：`@/lib/game/` → `@/lib/games/pacman/`（`app/`、`components/`、`lib/agent/*`、`lib/jev/*`、`tests/*`），
   以及 `lib/agent/*`、`lib/jev/*` 里的相对路径 `../game/` → `../games/pacman/`。
3. `grep -rn "lib/game/" --include='*.ts' --include='*.tsx' app components lib tests` 必须只剩 `lib/games/pacman` 形态。

**验收**
- `npx tsc --noEmit` 无输出；
- `npx vitest run` 与基线一致（118/120）；
- `git diff -M --stat` 显示的是改名（`R`）而不是「删 + 加」。

**提交**：`重构：吃豆人引擎搬到 lib/games/pacman（纯路径变更）`

---

## 4. Phase 2 —— 契约化 + 吃豆人迁移

> Phase 2 是本次重构的主战场。7 个任务全部在**同一个分支**上顺序做，每个任务结束后编译与测试都必须绿；
> 中间态（例如「右栏还没泛型化但控制器已泛型化」）**不允许留在提交里**。

### P2-1 契约层：`lib/games/types.ts` + `lib/games/registry.ts`

- 新建 `lib/games/types.ts`：`ActionId` / `ActionVocab` / `GameStatus` / `GameState` / `GameEvent` /
  `GameMeta` / `DecisionPoint` / `FactRow` / `Question` / `Observation` / `RecentDecision` /
  `DecideRequest` / `GameDriver<S>` / `GameDefinition<S>` / `PaintView` / `FxSink`
  —— 即 `design-multi-game.md` §3 的全部契约。
- 新建 `lib/games/registry.ts`：`GAME_META: readonly GameMeta[]`（**只有元数据、无泛型**）+ `getGameMeta(id)`。
- 约束：`lib/games/*` 与 `lib/agent/*` **必须 React-free**（测试是 node 环境、无 jsdom）；
  `Observation` 是 `Record<string, unknown>` 形态的不透明 JSON，不出现 `any`。
- **偏差（执行时调整）**：`lib/games/pacman/meta.ts` 也在这里建（原排在 P2-2）。
  理由：注册表若空着，`tests/games-registry.test.ts` 的「id 唯一 / 字段齐全」全变成空转，
  等于写了一个通过但什么也没验的测试；先把元数据（纯数据、零消费者）放进来，断言当场就有效。
  P2-2 因此不再建 `meta.ts`。
- **偏差（执行时调整）**：`GameMeta` 定为 `{ id, name, tagline, decisionShape, selfColor }`
  —— 比 §3.6 的注释多一个 `decisionShape`，因为设计规范 §2.5 的导航卡第三行要写「决策形态一句话」。
  `GameDefinition.heuristic` 的签名从 `(request: DecideRequest)` 改成
  `(state: S, point: DecisionPoint, actions: readonly ActionId[])`：启发式玩家是**游戏代码**，
  直接读完整状态即可，让它去解 `DecideRequest` 里那份给模型的观察只会逼出一个 cast。

**验收**：`tsc` 干净（此任务纯新增，零消费者，既有测试不变）。新增 `tests/games-registry.test.ts`：
表非空、id 唯一且 URL 安全、`name`/`tagline`/`decisionShape` 非空无首尾空白、
`selfColor` 是 `var(--…)` 形态、`getGameMeta` 命中与未命中两条路径。

### P2-2 吃豆人 driver：`lib/games/pacman/{facts.ts,agent.ts,index.ts}`

**第一步是纯改名**（行为零变化，先单独跑一遍 `tsc` + `vitest` 确认仍绿）：
`lib/games/pacman/types.ts` 的 `GameState` → `PacmanState`、`GameEvent` → `PacmanEvent`
（否则与 `lib/games/types.ts` 的同名契约撞车，`GameDefinition<PacmanState>` 写不出来）；
`GameStatus` 改为从 `../types` 转出，取消重复定义。`meta.ts` 已在 P2-1 建好。

然后把散在 `lib/agent/` 里的吃豆人知识收敛成 `PACMAN: GameDefinition<PacmanState>`：

| 来源 | 去处 | 动作 |
| --- | --- | --- |
| `lib/agent/observation.ts` | 通用契约已进 `lib/games/types.ts`；吃豆人专属进 `pacman/agent.ts` | 拆分 |
| `lib/agent/candidates.ts` | `lib/games/pacman/facts.ts` | **重写为 `FactRow[]`**（6–8 行、中英双标签、`values: Record<ActionId,string>`） |
| `lib/agent/fallback.ts` | `pacman/agent.ts` 的 `fallback()` | 平移，返回 `{ action, rule }` |
| `app/page.tsx` 里的 debug 覆盖数据 | `pacman/agent.ts` 的 `debug()` | 平移 |

`decision()` 用既有的 `findNextDecisionPoint` / `distanceToTileCenter` 实现 §3.3 的映射表
（`key = epoch:tileKey`、`distance = 到路口格数`、`prefetch = 3`、`commitWindow = 0.15`、`budgetMs = 500`）。
**旧文件此时先不删**（还有消费者），在 P2-3 一并删。

**验收**：`tsc` 干净；新增 `tests/pacman-driver.test.ts` —— 有路口时才返回决策点、无路口返回 `null`、
`actions` 不含墙、`facts` 每行的 `values` 键集 === `point.actions`、`criteria` 由 `facts` 拍平后与旧
`candidates` 文案等价（逐行比对）。既有 `observation.test.ts` 仍绿。

### P2-3 泛型化 agent 层 + 速度语义修正

- `lib/agent/controller.ts`：`AgentController<S extends GameState>`，构造注入 `GameDriver<S>`；
  **删除**对 `findNextDecisionPoint` / `distanceToTileCenter` / `ghostTarget` 的直接 import。
  预取/提交/超时/世代作废那段逻辑**一行不改**，只把「算下一个决策点」换成 `driver.decision(state)`。
- **速度语义修正**（`design-multi-game.md` §8）：墙钟预算随速度等比压缩，落成
  `telemetry.decisionWindowMs(budgetMs, speed) = budgetMs / speed`。
  ~~有效预取 = `driver.prefetch × speed`，新增 `setSpeed(speed)`~~
  —— **2026-09-25 推翻**：控制器的预取**不**缩放，`setSpeed` 已删除。
  取舍过程见 §7 决策 ①。
- `lib/agent/telemetry.ts`：拆出 `AgentMetrics`（**不再吃 `GameState`**）；
  `latencyHistogram(records, deadlineMs)`、`overDeadlineCount(records, deadlineMs)` 参数化截止线；
  直方图**分桶边保持固定**（1× 参照系，跨局/跨游戏可比）。
- `lib/agent/types.ts`：`Direction` → `ActionId`、`JevObservation` → `Observation`、
  `DecideRequest { actions, instructions, facts, modelId? }`、`DecisionTelemetry` 增加
  `at` / `pointKey` / `model` / `legalActions`。
- `lib/agent/providers.ts`：`random` 改用 `legalActions`；`heuristic` 改为注入 `chooser`；
  `scripted` 改为按 `pointKey` 取脚本（录放不再依赖方向枚举）。
- 删除已迁空的 `lib/agent/{observation,fallback,candidates}.ts`。

**验收**：`tests/controller.test.ts`（10 项，改用**假游戏驱动**）+ `telemetry.test.ts`（16 项）
+ `providers` 相关用例全绿；新增用例断言：**预取等于游戏声明的距离（与速度无关）、`budgetMs` 与
速度无关、提交窗口处强制提交、`epoch` 变化后旧答案被丢弃**。
（原文写的是「预取**随**速度缩放」，2026-09-25 按 §7 决策 ① 的 B 方案改成「预取**与**速度无关」，
该组用例已重写为 `the trigger point belongs to the game, not to the speed`。）

### P2-4 jev 层泛型化 + API v2 + 模型目录

- `lib/jev/prompt.ts`：只剩「`facts` → `criteria`」装配与系统提示词拼接，
  问题文案游戏无关（不再点名 Pac-Man，改由 `Question.instructions` 提供）。
- `lib/jev/validation.ts`：`isDirection` → `actions.includes(...)`。
- `lib/jev/client.ts`：透传 `modelId`。
- 新建 `lib/jev/models.ts`（**server-only**）：解析 `JEV_MODELS="id|显示名|baseURL|apiKey|模型名;..."`
  （空字段继承 `TYPESAFE_*`），未设时合成唯一条目 `{ id:"default", label: <模型名> }` 保证**今天的
  `.env.local` 不改一行仍能跑**；`JEV_DEFAULT_MODEL` 指定默认；每次请求读 `process.env`，模块级不缓存。
- `app/api/decide/route.ts` 改 v2 载荷 `{ decisionId, game, modelId?, state, actions, instructions, facts }`；
  `mockChoice` 改为按 `actions` 的**到达顺序**取哈希（不再依赖 `DIRECTION_ORDER`）。
- 新建 `app/api/models/route.ts`：`GET` 返回 `{ default, models:[{ id, label, note, configured }] }`
  —— **绝不含 apiKey / baseURL**。

**验收**：`tests/{jev-client,jev-game,integration}.test.ts` 改到 v2 后全绿；新增
`tests/models.test.ts`：解析含空字段继承、空 key（`configured:false`）、脏条目的容错，
且**脱敏结果里 grep 不到任何 key/baseURL 片段**。

**偏差（执行时调整）**：

1. P2-3 顺手把**截止线公式**落成了 `lib/agent/telemetry.ts` 的 `decisionWindowMs(budgetMs, speed)`
   （原排在 P2-5 的「标注改为 `budgetMs / speed`」）。理由：这条口径有一条测试线要拉
   （`budgetMs` 与速度无关、墙钟窗口随速度压缩），而它属于 agent 层而不是组件层；
   P2-5 只负责把它的结果画到图上、写进文案。
2. `modelId` 的**传递链**比计划多一环：`DecideRequest.modelId` 是控制器在 `request()` 里装配的，
   所以 `AgentController` 多了 `modelId` 选项与 `setModel()`（切模型丢弃在途请求）。计划只写了
   「`client.ts` 透传」，但没有源头就无处可透传；P2-6 的 ModelPicker 直接调 `setModel`。
3. **没有引入 `server-only` 依赖**（`package.json` 里没有它，靠传递依赖不可靠）。
   server-only 的意图改用两条更硬的约束实现：`ModelEntry`（带密钥）与 `PublicModelEntry`
   （没地方放密钥）是两个类型、路由只序列化后者，且 `tests/models.test.ts` 断言脱敏 JSON 里
   grep 不到任何 key/baseURL/字段名的碎片。
4. **默认速度 1× 在 P2-3 落地**（此前是 0.5×）：它与速度语义修正是同一次口径调整的两半，
   分两个任务做只会让中间态的口径自相矛盾。
   （原文把这次修正写成「有效预取 = `prefetch × speed`」，该缩放已于 2026-09-25 删除，见 §7 决策 ①。）

### P2-5 右栏泛型化 + `--self` 自身色

- `components/DirectionCompass.tsx` → `components/console/ActionCompass.tsx`：吃 `ActionVocab`，
  箭头按 `slot()` 映射（新增 `console/ActionGlyph.tsx`）；`slot()` 为 `null` 时不进十字。
- `components/console/DecisionCard.tsx`：「推理输入」表改为渲染 `Question.facts`；
  「来源」格拆成「**模型 · 来源**」两格（对应遥测的 `model` 与 `source`）。
- `components/console/{DecisionTimeline,SessionStats,ProbabilityBars,ConfidenceTrend,DebugPane,DecisionConsole}.tsx`：
  类型改 `ActionId` + `vocab.label`；`DecisionConsole` 的 props **收窄为 `ConsoleInput`（零游戏知识）**。
- `--self` 落在：得分主读数、动作盘选中键与细条、概率阶梯选中行、时间线占比条、置信度图「选项占比」序列。
- `SessionStats` 截止线标注改为 `budgetMs / speed`，`withinDeadline` 按实际截止线判定。

**验收**：`tests/ui.test.ts` 全绿；`grep -rn "Direction\b" components lib --include='*.tsx' --include='*.ts'`
除 `lib/games/pacman/*` 外无残留；组件里不出现写死方向字面量。**此任务结束时不改 app/page.tsx 的行为**
（仍是一条真值链路），只需编译与测试绿。

> 注：`SessionStats` 与控制条的组件级断言受限于「测试环境无 jsdom」，本阶段以 `tsc` + 浏览器实测兜底，
> 若需要组件级断言，会在 P2-7 收口时单独提出来问你（是否引入 DOM 测试环境，属项目级决定）。

**偏差（执行时调整）**：

1. `GameMeta` 增两个字段：`actor`（文案里指代「被操控的那个东西」，吃豆人 / 蛇）与 `place`
   （指代「决策发生的地方」，路口 / 格子）。原计划只想了 `selfColor`，但右栏文案（如
   `DecisionTimeline` 的空状态、「地点」格）必须说人话，又不能写死游戏名 —— 这两个词提到
   元数据里，组件就彻底零游戏知识。
2. 右栏输入契约定为 `components/console/input.ts` 的 **`ConsoleInput`**：除计划里的
   `records`/`vocab` 外，还包了 `budgetMs`、`speed`、`events`、`actor`、`place`、`steerable`。
   理由：`DecisionConsole` 的子组件本来各自吃 3~4 个零散 props，泛型化后数量翻倍；收成一个
   结构体后，加字段（比如以后的 `level`）不用改 8 个签名。
3. `DECISION_TIMEOUT_MS` 从 `lib/games/pacman/types.ts` **移到 `lib/agent/controller.ts` 并导出**
   （它本来就是 controller 的超时，放在游戏类型里是历史错位；`SessionStats` 与
   `decisionWindowMs` 同源引用，避免两处各拷一份常量）。
4. 新增 `lib/games/pacman/copy.ts`（`describePacmanEvent`）：`lib/ui.ts` 原来直接 import
   `PacmanEvent` 来写事件句子，这让共用模块变成游戏相关。事件形状只有游戏自己知道，句子里沉。
5. 新增 `components/console/ActionGlyph.tsx`：`slot()` → Phosphor 箭头是**唯一的 UI 层动作映射**，
   动作盘、概率阶梯、时间线三处共用（此前三处各写一遍箭头）。
6. `app/globals.css` 的 `:root` 加 `--self: var(--text-primary)` 兜底：组件里 `var(--self)` 是
   硬引用，外壳漏挂时若无兜底会整块掉色，有兜底则退化成中性色。

### P2-6 外壳、会话 hook 与多游戏路由

- `components/shell/`：`AppShell.tsx`（头部 + 两栏栅格 + skip link，`--self` 挂这里）、
  `GameSwitcher.tsx`（复用既有 Dialog 原语，**不新增 Radix 依赖**；含「返回游戏导航首页」）、
  `ModelPicker.tsx`（`localStorage` 键 `jev:model`；非模型模式 `disabled` 并说明原因）、
  `MeterStrip.tsx`（6 列布局原语）、`ControlBar.tsx`、`GameNavCard.tsx`。
- `lib/use-game-session.ts`：把今天 `app/page.tsx` 的状态/控制器/循环接线搬进来（泛型 `S`）。
- `components/games/`：`pacman/{GameCanvas,PacmanMeters,PacmanHelp}.tsx`（从
  `PacmanCanvas` / `GameMeters` / `HelpDialog` 拆出，循环与画布尺寸逻辑保持原样）、
  `pages.tsx`（`GAME_PAGES`：**唯一把引擎与 UI 缝在一起的地方**）。
- 路由：`app/[game]/page.tsx`（`generateStaticParams` 来自 `GAME_META`，未知 id → `notFound`）、
  `app/page.tsx`（导航首页；`GAME_META.length === 1` 时直接渲染那个游戏）、
  `app/layout.tsx`（metadata 模板 `Jev 游戏台` / `%s · Jev 游戏台`）。
- **写死色清零**：`grep -rn "#[0-9a-fA-F]\{6\}" components --include='*.tsx'` 只应剩 `globals.css` 的令牌来源。

**验收**：`tsc` + `vitest` 全绿；吃豆人的 URL 从 `/` 变为 `/pacman`，`/` 重定向到它
（见下方偏差：实测是 307；导航首页顺延到 P3-4）。

**提交**：`重构：多游戏契约与外壳（吃豆人迁入 /pacman）`

**执行时的偏差（2026-09-25）**

- **拆成两步做（已与用户确认）**，因为本任务同时动「循环、组件抽取、路由」三层，中间态较大：
  - **P2-6a（已完成）**：抽 `lib/use-game-session.ts`（泛型 `S`，吃 `GameDefinition<S>`）+
    `components/games/GameCanvas.tsx`（通用固定步长循环）+ `components/games/pacman/
    {PacmanMeters,PacmanHelp}.tsx`；删掉 `PacmanCanvas.tsx` / `GameMeters.tsx` / `HelpDialog.tsx`
    与 `UiSnapshot`。此步结束时 `/` 仍是可玩的吃豆人单页，行为不变。
    - 偏差：循环抽成**通用**组件而非每个游戏一份（见 design-multi-game §4 的偏差 1）；
      `juice.ts` 移到 `lib/games/`；契约补 `fixedDtMs` / `describeEvent` / `keyActions`
      三个字段；`GameDefinition.react` 从死代码变成活路径（FxSink 适配器）；
      机台偏好键 `jev-pacman:*` → `jev:*`。
    - 实测（dev + `JEV_MOCK=true`，1440×900，CDP 代理）：**18/18**。含两条只有这次重构才成立的
      断言 —— ① 对局推进说明循环读到了 `game.fixedDtMs`（不再写死 `FIXED_DT_MS`）；
      ② juice 粒子峰值 8 说明 `GameDefinition.react → FxSink` 真的在跑。
      另：headless Chrome 的 `prefers-reduced-motion` 实测是 **false**，所以「粒子瞬时值为 0」
      是采样撞上寿命 <1s 的空窗，不是被让路 —— 粒子要按**峰值**采样，不能按瞬时值断言。
  - **P2-6b（已完成）**：外壳、控制条、模型选择器、路由与写死色清零。
    - 新增 `components/shell/{MeterStrip,AppShell,ModelPicker,ControlBar}.tsx` +
      `components/games/pages.tsx`（`GAME_PAGES`）+ `components/games/pacman/PacmanPage.tsx` +
      `app/[game]/page.tsx`；`app/page.tsx` 改为重定向；`app/layout.tsx` metadata 改模板；
      删掉 `GameControls.tsx`。
    - **偏差 1（已与用户确认）**：`GAME_PAGES` 不放在 `app/`，而是 `components/games/pages.tsx`
      且**刻意不加 `"use client"`** —— 它会被 RSC 的 `app/[game]/page.tsx` import，需要服务端
      求值出一张真表（加 `"use client"` 会变成客户端引用，`getGamePage` 在服务端拿不到）。
    - **偏差 2（已与用户确认）**：**只有 1 个游戏时隐藏「切换游戏」按钮**，`GameSwitcher.tsx`
      与 `GameNavCard.tsx`、以及 `/` 的导航首页分支**推到 P3-4** 与贪吃蛇一起落地
      （眼下 `length === 1`，导航代码没有可达状态，先写等于先引入不可测分支）。
      因此本轮 `/` 只有重定向一个分支。
    - **偏差 3（无用户介入，实现选择）**：`ControlBar` 的玩家提示取自 `meta.modeHints[mode]`
      （而不是回到 `GameControls` 里写死四句），新增 `GameMeta.modeHints`；速度提示按倍率算出
      真实窗口（`budgetMs ÷ speed`）—— 这正是本计划第 7 节决策 ① 的第 3 条。
    - **偏差 4（实测发现，非 302）**：`/` 实测返回 **307**，不是 302。Next 的 `redirect()` 只会
      出 307/308（保持方法语义），302 必须手写 `Response`。已确认**保留 307** —— 对 `GET` 而言
      `Response.redirect` 的 307 与 302 行为一致，且不必为一个导航跳转绕过框架 API。
      实测：`curl -s -o /dev/null -w '%{http_code}' /` → `307`，`Location: /pacman`；
      `/pacman` → `200`；`/nope` → `404`（`getGamePage` 未命中 → `notFound()`）。
    - 实测（dev + `JEV_MOCK=true`，CDP 代理）：**23/23**，`exceptions: 0` / `errorLogs: []`。
      **踩到的坑（值得记）**：左下角「玩家」组第一个按钮被 Next dev 的悬浮指示器
      `<nextjs-portal>` 盖住（`elementsFromPoint` 命中 `NEXTJS-PORTAL`，其 `w/h` 均为 0），
      导致真实点击被吃、下游断言连锁失败（「决策进历史 rows=0」实测是**误报**，不是产品 bug）。
      探针里注入 `nextjs-portal { pointer-events: none !important; }` 后全绿 —— 该覆盖只影响探针，
      不影响产品代码。这也解释了 P2-6a 那轮把 `nextjs-portal` 误判成「运行期错误浮层」的原因。
- **`/` 的行为改为「302 到 `/pacman`」（已与用户确认）**，而不是原计划的「1 个游戏时直接渲染
  那个游戏」。所以：`GAME_META.length === 1` 时 `/` 是重定向、导航首页代码在眼下**没有可达的
  状态**（要等第 2 个游戏）。`length > 1` 时 `/` 才变成导航首页。

### P2-7 Phase 2 收口验证（吃豆人）

`JEV_MOCK=true npm run dev` + CDP 代理，在 **1280×720 与 1440×900** 两个尺寸下逐条走：

- 全页**有且只有一层滚动条**（`document.documentElement.scrollHeight === clientHeight`，且面板内 `.scroll-area` 是唯一滚动容器）；
- 画布 `可见高度 ÷ 画布自身高度 === 1`（不被裁切）；
- 开始 / 暂停 / 重开 / 切玩家 / 切模型（**切模型即重开一局**）/ 开「更多」/ 开「推理输入」/ 开调试 / 导出 JSON 全部正常；
- 「推理输入」表的行与模型 criteria **逐行一致**（同一对象，无漂移）；
- 控制台无报错；键序符合规范 §10。

**提交**：验证若发现修复，随修复一起提交，信息写明修了什么。

**执行结果（2026-09-25，已完成）**

用 dev（`JEV_MOCK=true PORT=3100`）+ CDP 代理，视口/媒体走直连 9222 的 `Emulation.*`。
脚本：`/tmp/p2-7a.mjs`（主体，**68/68**）、`/tmp/p2-7b.mjs`（模型目录，**15/15**）。

覆盖到的（两个尺寸都过）：页面单滚动条（1440×900 / 1280×720 各 1 个 `.scroll-area`）、
无横向溢出、画布 `可见高 ÷ 自身高 ≈ 1`（四尺寸：1440×900、1280×720、768×900、1280×560）、
1280×720 历史列表可见 7 行、降级分支（壳不锁高 → 页面自己滚、面板内 0 个嵌套滚动容器、
栅格列数 768→1 / 1280→2，断点只看宽度）、键序（跳转 → 主操作 → 说明 → 玩家 → 模型 →
速度 → 重开 → 更多，无正 `tabindex`，无「切换游戏」）、开始/暂停（暂停后历史不再增长）/
重开/切玩家（手动模型组禁用并说明）/切模型即重开（历史归零 + 时长回到 `0 ms`）/
更多/推理输入/调试（「状态」页签真实指针可切）/导出 JSON（含 `game`+`model`+`summary`+`result`，
无密钥痕迹）、**事实表与送出的 `facts` 逐行逐值一致**（命中一次真实请求体）、
帮助弹层锁根滚动（`html` overflow hidden、`gutter === 0`）、`exceptions 0 / errorLogs 0`。

**P2-7 只改了文档、没改产品代码** —— 第一轮的 9 条 FAIL 全部是探针 bug（见下）。

**三条只有这次才摸清的探针事实**（下次直接照抄，别再猜）：

1. `lib/jev/client.ts` 的 `createJevProvider(endpoint, fetchImpl = fetch)` 在**首次渲染**
   就把 `fetch` 引用捕获进闭包 —— 在页面上 `eval` 装钩子已经太晚。必须用 CDP
   `Page.addScriptToEvaluateOnNewDocument` 在页面脚本之前装。
2. **空历史时右栏没有可滚内容**，"有且只有一层滚动条" 必须在跑起来（有记录）之后再断；
   在页面刚加载时断会数到 0。
3. `formatMs` 在 1 秒以下给的是 **`0 ms` / `133 ms`**，不是 `0:00` —— 「切模型即重开」的判据
   要认这个形态（`restart()` 里是 `game.start(state)`，新一局会立刻跑起来，所以不能靠
   "停在就绪态" 判）。
4. `Chip` 的**根节点自带 `.num`**，`header .num` 会把整枚胶囊一起数进来；要按文案定位。
5. `prefers-reduced-motion` 生效后，React 提交 DOM 的那一帧仍存在
   `currentTime === 0, duration === 0.01` 的 `CSSTransition` —— 它正是规则生效的证据，下一帧就
   finished。所以判据是「没有任何时长 > 0.01ms 的动画在跑」（实测最长 0.01ms），
   而不是「任一瞬时都数到 0」。

**由此修正了设计规范的一处口径**（`docs/design-system.md` §2.2 与 §10）：
原文说展开「推理输入」后「可见的滚动条仍然只有一条」，实测**不成立** —— 1440×900 展开后
判据数到 2 个可滚容器（右栏列表仍留 ~184px ≈ 5 行，自己也在滚），1280×720 展开后列表被挤成 0、
只剩事实表 1 个。这与那条已修掉的「双滚动条」不是一回事：那个病是「页面在滚 + 容器在滚」，
而这里页面始终没有滚动条。已按实测改写。

---

## 5. Phase 3 —— 贪吃蛇

### P3-1 引擎（TDD，先写测试）

新建 `lib/games/snake/{types.ts,engine.ts,analysis.ts}`：固定 **24×24** 盘面、`MOVE_MS = 500` 固定步长
+ 累加器、双端队列身体、禁止 180° 反向（首步例外）、每食 **+5 节**、撞墙/咬到自己即死
（**尾巴让出的那格算合法**）、无空格放食物即胜（`CLEARED`）、`mulberry32` 种子放食物、长度记
`localStorage`（仅在 UI 层）。

**验收**：先写 `tests/snake-engine.test.ts` 再实现 —— 移动、增长 +5、撞墙、自撞、尾巴让位、
胜利、**同 seed 重放结果逐帧一致**。

**执行结果（2026-09-25，已完成）**

三个文件：`lib/games/snake/{types.ts,analysis.ts,engine.ts}` + `tests/snake-engine.test.ts`
（27 项，一次通过）。`tsc` 0 错，全量 **199/199**（含 2 项 live；`jev-live` 第一轮拿到 502、
复跑通过，外部抖动，与本次无关）。

四处计划里没写、但必须钉住的：

1. **`MOVE_MS` 不是 `fixedDtMs`。** 计划写「`MOVE_MS = 500` 固定步长 + 累加器」，容易被读成
   「引擎步长 500」。实际是 60 Hz 切片（`FIXED_DT_MS = 1000/60`）+ **独立的格步长累加器**
   `state.stepAccumMs`。而 `fixedDtMs` 必须 ≤ `commitWindow × MOVE_MS = 25 ms`，否则
   `arriving` 恒为真且 `distance` 恒为 1 > 0.05 —— 控制器一次都不提问、也一次都不兜底。
   这条已写进 `types.ts` 的 `FIXED_DT_MS` 与 `GameDefinition.fixedDtMs` 的注释。
2. **累加器住在状态里，不在循环里。** `stepAccumMs` 是 `SnakeState` 的字段，因为驱动要读它算
   `distance = (MOVE_MS − stepAccumMs) / MOVE_MS`。放进渲染循环的话 agent 这一侧看不到。
3. **还没有方向时，整格时间停在满格等，而不是吞掉。** 控制器判「答案该落地了」用的是
   `accum + fixedDtMs >= MOVE_MS`；吞掉就永远等不到，**第一次提问必然死锁**。停满格还顺手给出
   正确结果：首位决策的 `distance` 为 0、`arriving` 为真，答案一到就落地，不必再等一个周期。
4. **死亡与通关都 `epoch += 1`**：控制器靠它作废在途答案，否则一份为「死前那一格」算出来的方向
   会落到新局上。

两处口径决定：

- **分数 = 吃到食物的个数**（不是积分制）。上游按**长度**记高分，而长度 = 1 + 食物数（增长在
  5 步内补齐），两者是同一个量；只存一个，避免以后分叉。
- **`analysis.ts` 多拆了两个函数**：`reachableCount(board, from, blocked)`（flood fill 与
  「拿蛇身当墙」分开）与 `freedomAfter(state, direction)`（自由度）。后者是 P3-2 事实表的第 5 行，
  计划只写了那一行文案，没写它从哪来。

**踩到的一个真错误（只有 `tsc` 抓得到）**：`SnakeState extends GameState`，而 `types.ts` 只
`import type { GameStatus }` —— 少了一个 import。**vitest 用 esbuild 剥类型，27 项测试全绿**，
`tsc --noEmit` 一次报出 21 处 `Property 'status' does not exist`。所以引擎这类「纯类型契约」改动，
测试绿不等于编译过，收尾必须跑 `tsc`。

**留给 P3-3 的**：长度记 `localStorage`（历史最长）在 UI 层做，引擎不碰存储 —— 引擎是纯的，
它连 `window` 都不该知道。

### P3-2 agent 侧（TDD）

`lib/games/snake/agent.ts`：

- `decision()`：每步一个决策点，`key = epoch:moveIndex`，`distance = (MOVE_MS − accum) / MOVE_MS`，
  `actions` 排除反向，**唯一活路不提问**；`prefetch = 1`、`commitWindow = 0.05`、`budgetMs = 500`
  （与吃豆人同为 500ms，跨游戏延迟才可直接比较）。
- `observe()`：目标一句话、盘面尺寸、蛇头、朝向、**有序蛇身 `[x,y][]`**（游戏状态本身，抽掉不可解）、
  食物与 BFS 距离、长度、已吃、已走步数、剩余空格。
- `frame()`：6 行 `FactRow`（立刻致命 / 该方向可达空格数 flood fill / 距食物 / 是否沿朝向 /
  该方向自由度 / 蛇长）。
- `fallback()`：4 条 1-ply 规则（保持朝向 → 唯一安全 → 可达空格最多 → 全致命则按当前朝向）。
- `heuristic()`：只考虑安全动作，在「可达空格数」与「距食物」间加权，并列按固定动作顺序。

**验收**：`tests/snake-agent.test.ts` 断言 —— `actions` 排除反向、facts 6 行齐、
**用真的 `buildCriteria` 拍平后每个动作都拿全 6 行**（不在用例里照抄一遍拼法）、
兜底永不选立刻致命的动作（除非全致命）、同 seed 下启发式与随机玩家的决策序列可复现。

**执行结果（2026-09-25，已完成）**

两个文件：`lib/games/snake/agent.ts` + `tests/snake-agent.test.ts`（30 项）。`tsc` 0 错，
全量 **229/229**（20 文件，含 2 项 live）。

三处计划没写清、执行时必须自己钉的口径：

1. **`actions` 是「四向减 180° 反向」，不是「四向减致命方向」。** 计划只写了「`actions` 排除反向」，
   容易被读成「顺便把危险的也去掉」。差别是决定性的：撞墙、咬到自己都是**可执行的**动作，
   只是会死 —— 而「模型会不会踩进去」正是这个平台要测的东西。所以「立刻致命」这一行必须随方向变化
   （永远写「否」的话那一行就没有存在的理由），兜底的第 4 条（全致命时按当前朝向）也才不是死代码。
2. **唯一活路不提问，但只限「活路 = 直行」**（用户 2026-09-25 拍板，见 §7 决策 ③）。
   唯一活路是一次**转向**时仍然提问：蛇不会自己转弯，不问就没人给方向，它会直着撞死。
   全致命时同样提问 —— 除了让规则 4 有地方落地，也把这次死亡记进决策历史，
   而不是留下一个没人解释的 `SNAKE_DIED`。
3. **兜底规则 1 会先吃掉规则 3 的出场机会。**「保持朝向」只要安全就直接返回，所以
   「可达空格最多」只在**朝向致命**且**安全方向 ≥ 2** 时才出场 —— 写用例的几何前提就落在这一条上。

一处与计划措辞的差异：计划写 `heuristic()`，实际导出名是 `heuristicChoice(state, actions)`，
**签名与 `GameDefinition.heuristic` 完全一致**（吃豆人那边是 `heuristicChoice(directions, candidates)`
再在 `index.ts` 里包一层）。所以 P3-3 注册时可以直接写 `heuristic: heuristicChoice`，不用包。

**对照玩家保留了「沿当前朝向」的半分加分**：它是事实表第 4 行（「是否沿当前朝向」）的用途，
也让对照玩家更像指令里那句「Keep the current heading when it costs nothing」。副作用是
**纯 `DIRECTIONS` 顺序的平局只在首步（`heading === null`）出现** —— 有朝向时，空旷盘面上
RIGHT 会靠这半分赢过排在前面的 UP。这条已写进用例标题，免得下次有人把加成当 bug 修掉。

**踩到的真错误，与三处「用例自己的前提写错了」**：

- `apply()` 调了 `steer` 却**没 import**。`tsc` 会抓，但先跑 vitest 时看到的是 3 条
  `ReferenceError: steer is not defined` —— 又一次「测试绿/红都不等于编译过」。
  蛇的 `apply` 必须走 `steer`：合法性由控制器按 `actions` 判过，但**反向要在写入时再拒一次**，
  手动模式与模型走同一条路，早拒才能让「请求 = 意图」保持干净。
- 三条用例的**前提**写错，其中两条会「以正确的理由给出错误的结论」：
  - 「唯一活路 = 直行」那条先调 `pointOf(state)` 取几何，而 `pointOf` 断言「本应有一个决策点」——
    与这条用例要断言的「不该有」直接矛盾。改成从 `debug()` 读安全方向（调试覆盖层用的同一份计算）。
  - 兜底规则 3 的几何前提不成立：原用例声称「只有右边是开阔的」，实际下方那一格是空的，
    于是规则 1 先返回了。改用窄盘（3×5）+ 身体横在 `y=3`，才隔出两个大小不同的房间（上 6 格 / 下 3 格）。
  - 平局那条在空盘上确实并列，但**漏算了加分项**（见上）。现在拆成两条：首步验纯顺序、有朝向验加分项。

  教训：几何类用例必须先断言前提（`expect(info.safe).toEqual([...])`、
  `expect(Number(space.UP)).toBeGreaterThan(Number(space.DOWN))`），
  否则「以正确的理由通过」和「以错误的理由通过」在报告里长得一模一样。

**留给 P3-3 的**：`SnakeDebugInfo` 的 `safe` / `fatal` 是调试覆盖层要画的那一半；
`heuristicChoice` 直接当 `heuristic` 注册；`paint()` 要按蛇头更亮的一套色出图。

### P3-3 渲染 / 画布 / 面板 / 注册

- `lib/games/snake/{render.ts,meta.ts,index.ts}`：canvas 画 24×24 盘面（`--bg-well` 作底、
  蛇身圆角方块、蛇头更亮、食物小圆、`prefers-reduced-motion` 下食物不脉动）。
- `app/globals.css` 新增数据色 token `--snake-head` / `--snake-body` / `--snake-food`，并映射 `--self`。
- `components/games/snake/{SnakeCanvas,SnakeMeters,SnakeHelp}.tsx`：仪表条 6 格
  （长度（主读数）/ 吃到食物 / 已走步数 / 存活时长 / 剩余空格 / 历史最长）。
- 注册进 `GAME_META` 与 `GAME_PAGES`（**新增游戏 = 加一个目录 + 两条注册**，不新建页面文件）。

**验收**：`tsc` + `vitest` 全绿；`tests/games-registry.test.ts` 扩展到「每个 id 在 `GAME_PAGES` 里都有实现」。

### P3-4 Phase 3 收口验证（蛇 + 导航首页）

- `/snake`：对局能推进、决策逐条进历史、预算 500ms、全页只有一层滚动条、画布不被裁切、
  导出 JSON 含 `game` 与 `model`、切模型即重开一局；
- `/`：两张游戏卡可进、键序正确、只有一层滚动条；
- 两游戏互切、来回切换后状态不串（各自 `epoch`/历史独立）。

**提交**：`feat：接入贪吃蛇（多游戏架构验证）`

---

## 6. Phase 4 —— 收尾

### P4-1 文档、复检与审查

- 复检 `docs/design-system.md` 与实际实现一致，尤其 §2.2 单滚动条、§6.7 口径表、§10 验收清单**逐条实跑**；
- `README.md` 与 `docs/example-session.json` 更新到 v2 导出形状（含 `game` / `model`）。
  2026-09-25 顺带走查发现的其余过时处（一并改）：测试数写「95 tests」（实际 18 文件 / 171 项）、
  果汁层路径写 `lib/game/juice.ts`（已移到 `lib/games/juice.ts`）、
  `docs/example-session.json` 那一节是 0.5× 的旧记录；
  速度控件那行本日已单独改成 `500 ms ÷ speed` 的口径（见 §7 决策 ①）；
- 写 `docs/review.md`（Critical / Major / Minor 分级）与 `docs/final-report-multi-game.md`；
- 把「多游戏可插拔架构」的落地流程沉淀成可复用 skill。

**验收**：本次改动的每条需求都有对应的实测证据（命令 + 观察值），写在 `final-report` 里。

---

## 7. 已拍板的三件事（影响 P2-3 / P2-5 / P3-2）

### 决策 ①：三处「不诚实」——**一起修**

设计规范 §6.5 与控件提示当前都不完全成立：控制器按**游戏空间** 3 格预取提问，而速度倍率改的是游戏时钟，
默认 **0.5×** 时覆盖 3 格需要 **1000ms 墙钟**，不是 500ms —— 于是「500ms 截止」只在 1× 成立，
默认速度下「执行率」被系统性高估。

**结论：修**，三处一起改（设计规范已在 P0-1 改完）：

1. 控制器**不缩放**预取：仍按 `driver.prefetch` 这个固定的**游戏空间**距离提问，
   于是墙钟窗口恰好 = `budgetMs ÷ speed`（原 P2-3 写成 `prefetch × speed`，
   2026-09-25 按决策 ① 的复核结论改回，见下）—— P2-3；
2. 直方图**分桶边固定**（1× 参照系），**截止线 = `budgetMs ÷ speed`** 并标注实际毫秒数 —— P2-5；
3. 控件提示改成「速度会等比压缩局面推进与决策窗口：2× 时模型只有一半的时间作答」—— P2-6。

**已按 B 落地（2026-09-25）**

复核 P3 前置条件时发现第 1 条与第 2/3 条互相矛盾，已向用户提出并拍板。过程与结论留档：

第 1 条（P2-3）与第 2/3 条（P2-5 / P2-6）不能同时成立 ——

- 控制器 `effectivePrefetchTiles = prefetch × speed`，`tests/controller.test.ts` 也钉了这一点
  （「asks `prefetch × speed` tiles early, **so the wall-clock window holds**」）。这条的**意图是窗口恒定**：
  窗口 = `min(d₀, prefetch × speed) × T / speed`，**上界恒为 `prefetch × T`**，也就是 `budgetMs` ——
  与速度无关。0.5× 时控制器最多只会给 500 ms，不是 1000 ms。
- 但 `telemetry.decisionWindowMs(budget, speed) = budget / speed`、`SessionStats` 的
  「截止约 budget/speed ms」、`ControlBar` 的「模型实际只有约 budget/speed ms 作答」
  都说**窗口随速度压缩**（0.5× → 1000 ms、2× → 250 ms）。

后果（两边都不诚实）：0.5× 时 UI 声称有 1000 ms 而控制器最多给 500 ms，
`withinDeadline` 会把迟到的答案算成「在窗口内」—— 正是决策 ① 想消掉的那种高估；2× 时反向低估。

另需承认：窗口本身是**数据相关**的（取决于下一个决策点有多远、`d₀` 多大），
单个数字只能是上界或下界。UI 用的是上界。

两条出路，**用户选 B**：

- **A**：保留控制器现状（窗口恒定 = `budgetMs`）→ 把 UI 文案与截止线改成恒定值，
  删掉「2× 只有一半时间」。代价：0.5× 时控制器会**故意等**到 0.5 格才提问，白扔掉一半窗口。
- **B（采用）**：去掉 `× speed`（回到「游戏声明的预取距离」）→ 窗口上界 = `budgetMs / speed`，
  UI 文案与截止线不动。此时 0.5× 时模型**确实**有 1000 ms 墙钟（0.5× 下蛇每 1000 ms 才走一格），
  「2× 只有一半时间」字面为真，三者自洽。

选 B 的三条理由：① B 才是 `design-system.md` §6.5 的原口径（「控制器是按**游戏空间**的距离
提前提问的」），A 是 P2-3 实现时跑偏出来的；② A 在 0.5× 下白扔掉一半窗口，与「尽早提问」的初衷相反；
③ 蛇更极端 —— `prefetch = 1` 而 `distance` 上界就是 1 格，**没有可放大的余地**，
A 在 0.5× 下必然把窗口砍半，B 则精确等于 `budgetMs / speed`。

**落地内容（2026-09-25）**：`lib/agent/controller.ts` 删掉 `ControllerOptions.speed`、`private speed`
与整个 `setSpeed()`（原位留注释说明为何刻意没有它），`effectivePrefetchTiles` 改名 `prefetchTiles`
并去掉缩放；`lib/games/types.ts`、`lib/games/pacman/agent.ts`、`lib/use-game-session.ts`、
`tests/helpers.ts` 的注释同步改写；`tests/controller.test.ts` 删掉 `speed` 选项，
整组「the speed multiplier is not cosmetic」重写为「the trigger point belongs to the game, not to the speed」。
**UI 文案与截止线一行未动** —— 它们本来就是按 `budgetMs / speed` 写的，现在只是终于为真。

### 决策 ②：默认速度 ——**两个游戏都 1×**

预算与文档口径一致、跨游戏可比（蛇 1× = 500ms、吃豆人 1× = 500ms）。
代价是吃豆人比现在快一倍（观感不如 0.5× 从容），如实接受。

### 决策 ③：蛇的「唯一活路」——**只在「活路 = 直行」时跳过提问**

P3-2 写「唯一活路不提问」时留了个歧义：如果**直行会死、只剩一条侧路**，「不提问」就没人在给方向，
而蛇**不会自己转弯** —— 它只会沿着 `heading` 撞死。这不是「跳过一次没意义的提问」，
而是**把一次必须落的决策吞掉了**。

两条出路，**用户选 A**：

- **A（采用）**：只在「唯一的活路就是继续直行」时返回 `null`。此时不问确实没有代价 ——
  引擎本来就会沿 `heading` 走（`state.requested ?? state.heading`）。
  活路是转向、或者三个方向全致命时，照样提问。
- **B**：只要活路唯一就跳过。省一次调用，但上面那种局面必死，而且死在**没有决策记录**的路径上。

选 A 的理由：① 跳过提问的唯一正当理由是「没什么可决定的」，而「必须拐弯」恰恰是最需要决定的一次；
② 全致命时也提问，兜底的第 4 条（按当前朝向）才有地方落地，死亡也才有一条可解释的决策记录；
③ 与契约本身一致 —— 控制器在 `decision()` 返回 `null` 时**既不提问也不兜底**
（`this.target = null; return;`），所以任何「返回 null」都必须等价于「按现状继续是正确的」。

---

## 8. 明确不做（本轮）

- 排行榜 / 跨局持久化对比（导出 JSON 之外的持久化）；
- 非四向动作空间的游戏（`ActionVocab.slot()` 已留出口，不实现）；
- 多游戏同屏对比；
- 包名与 `deploy/` 目录改名（避免把娱乐性重命名混进部署变更）；
- 引入新的 Radix 依赖（切换器用既有 Dialog 原语）。
