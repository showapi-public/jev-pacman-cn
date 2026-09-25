/**
 * 跨层契约：一个「可以被模型玩的游戏」需要提供什么。
 *
 * 这个文件是整个多游戏重构唯一的叶子模块 —— 它不 import 任何项目内的东西，
 * `lib/agent/*`、`lib/games/<game>/*`、`lib/ui.ts`、`components/*` 都只依赖它。
 * 依赖方向单一，所以「新增一个游戏」不会牵动其它游戏，也不会牵动右栏。
 *
 * 保持 React-free：测试环境是 node（`vitest.config.ts` 的 `include` 只收 `tests/` 下的
 * `.test.ts`），一切可测逻辑都不能碰 React。唯一的外部类型依赖是 `paint` 的
 * `CanvasRenderingContext2D`（DOM lib 类型，运行期不需要它存在）。
 *
 * 契约的推理与两个游戏如何映射到同一组概念，见 `docs/design-multi-game.md` §3。
 */

/* ------------------------------------------------------- 动作与展示词表 */

/**
 * 一个动作的标识。
 *
 * 跨层只传它。每个游戏自己的字面量联合（吃豆人的 `"UP" | "DOWN" | "LEFT" | "RIGHT"`、
 * 蛇的同名联合）留在各自目录里，**两者不共用类型** —— 否则「四向」会悄悄变成全项目的假设。
 * 跨游戏复用四向动作盘靠下面的 `ActionVocab`，不是靠共用类型。
 */
export type ActionId = string;

/** 动作的展示词表：UI 层靠它渲染动作盘、概率阶梯与历史，于是组件里不出现任何游戏字面量。 */
export interface ActionVocab {
  /** 展示顺序：概率阶梯并列时的固定次序，也是动作盘的槽位来源。 */
  readonly order: readonly ActionId[];
  /** 给人看的短标签：上 / 下 / 左 / 右。 */
  label(action: ActionId): string;
  /** 四向动作盘上的槽位；返回 null 的动作不进十字（非四向的游戏自带动作盘）。 */
  slot(action: ActionId): "UP" | "DOWN" | "LEFT" | "RIGHT" | null;
}

/* ----------------------------------------------------------------- 状态 */

/** 五个状态共用：「胜利」与「失败」都是终局，但读者需要分清是哪一种。 */
export type GameStatus = "READY" | "PLAYING" | "PAUSED" | "GAME_OVER" | "CLEARED";

/**
 * 所有游戏状态都必须满足的最小形状。
 *
 * 控制器只认这六个字段：`epoch` 用来丢弃过期答案，`playTimeMs` 与 `score` 用来读成绩。
 * 各游戏的状态类型（`PacmanState` / `SnakeState`）在自己目录里定义并满足它。
 */
export interface GameState {
  status: GameStatus;
  /** 固定步长计数。 */
  tick: number;
  /** 世界被替换时 +1（开局、重开、死亡、切换关卡）：控制器靠它丢弃旧答案。 */
  epoch: number;
  seed: number;
  /** 游戏内时长，暂停不计。 */
  playTimeMs: number;
  /** 每个游戏都要有一个主读数。 */
  score: number;
}

/**
 * 游戏事件。框架只读 `type`（写日志、导出 JSON），其余字段由各游戏自定，
 * 只有该游戏自己的 `react` 与文案函数会解释它们。
 */
export interface GameEvent {
  readonly type: string;
}

/* ----------------------------------------------------------- 元数据 */

/**
 * 游戏元数据。**无泛型** —— 所以导航首页、头部切换器、路由表都能直接 import 它，
 * 不必碰任何具体游戏的状态类型。`lib/games/registry.ts` 存一份列表。
 */
export interface GameMeta {
  /** 路由段与注册键：小写、URL 安全、在一个部署里唯一。 */
  readonly id: string;
  /** 游戏名（头部与导航卡第一行）。 */
  readonly name: string;
  /** 一句话标语：这个游戏在玩什么（导航卡第二行）。 */
  readonly tagline: string;
  /** 该游戏的决策形态一句话（导航卡第三行）：让读者知道它的「一次提问」长什么样。 */
  readonly decisionShape: string;
  /** 本局自身色的 CSS 变量引用，挂到外壳的 `--self`，例如 `"var(--pacman)"`。见设计规范 §4.2。 */
  readonly selfColor: string;
  /**
   * 文案里指代「玩家在操控的那个东西」的短名词：吃豆人 / 蛇。
   *
   * 右栏是共用的，所以它不能自己写「吃豆人」三个字；`name` 又太长（导航卡与标题用），
   * 这里要的是能塞进一句话里的名词，例如「当{actor}抵达路口时」。见设计规范 §6.3。
   */
  readonly actor: string;
  /** 文案里指代「决策发生的地方」的名词：路口 / 格子。右栏的元信息与空状态都用它。 */
  readonly place: string;
  /**
   * 四个玩家各自的悬浮说明，键是 `PlayMode`（"JEV" / "MANUAL" / "RANDOM" / "HEURISTIC"）。
   *
   * 键写成 `string` 而不是 `PlayMode`，是因为本文件是叶子模块、不 import 项目内的任何东西 ——
   * `PlayMode` 住在 `lib/ui.ts`，反向依赖会成环。四个键是固定集合，缺一个也没关系：
   * 控制条拿不到说明就不写 `title`。
   *
   * 说明必须由游戏自己写：只有它知道「由你驾驶」是开车还是转向，「对照基线」比的是什么。
   */
  readonly modeHints: Readonly<Record<string, string>>;
}

/* ------------------------------------------------------------- 决策点 */

/**
 * 此刻应该瞄准的那一次决策。
 *
 * 吃豆人的「路口 + 提前三格预取」与蛇的「每次移动都要转向」被统一成同一个标量 `distance`，
 * 于是控制器里那段预取 / 提交 / 超时 / 世代作废的逻辑对两个游戏是同一份代码。
 * 字段到两个游戏的映射表见 `docs/design-multi-game.md` §3.3。
 */
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
  /** 主体当前朝向，只给动作盘的中心针用。 */
  facing: ActionId | null;
}

/* --------------------------------------------------------------- 提问 */

/** 事实表的一行：一个共享指标 × 每个合法动作一个值。 */
export interface FactRow {
  /** 表头（中文，给右侧「推理输入」表）。 */
  label: string;
  /** 送模型的英文标签；提示词保持全英文，与现状一致。 */
  modelLabel: string;
  /** 每个合法动作一个值；缺失显示 —。 */
  values: Record<ActionId, string>;
}

/** 一次提问：该游戏的系统提示词 + 事实表。 */
export interface Question {
  /** 系统提示词：这款游戏的目标与优先级。 */
  instructions: string;
  /** 共享指标行 × 合法动作列。 */
  facts: readonly FactRow[];
}

/**
 * 送给模型的结构化状态（不透明 JSON）。框架不解释它的内容，服务端只把它交给模型。
 *
 * **各游戏必须用 `type` 别名而不是 `interface` 定义自己的观察**：TypeScript 只为
 * 类型别名推断隐式索引签名，`interface` 无法赋值给 `Record<string, unknown>`。
 */
export type Observation = Record<string, unknown>;

/** 最近做过的一次决策，写进观察让模型知道自己刚刚选了什么。 */
export interface RecentDecision {
  /** 决策点标识（`DecisionPoint.key`）。 */
  key: string;
  /** 决策地点（格）。 */
  at: { x: number; y: number } | null;
  action: ActionId;
}

/**
 * 一次提问的完整载荷：既是进程内 `DecisionProvider` 的入参，
 * 也是 `POST /api/decide` v2 的请求体（线上版本略去 `pointKey`，那是进程内对齐用的）。
 */
export interface DecideRequest {
  decisionId: string;
  /** 游戏 id（`GameMeta.id`）。服务端用它写日志，但不解释它。 */
  game: string;
  /** 模型目录里的条目 id；缺省 = 服务端默认条目。 */
  modelId?: string;
  /** 不透明 JSON：`GameDriver.observe` 的产物。 */
  state: Observation;
  /** 合法动作。 */
  actions: readonly ActionId[];
  /** 该游戏的系统提示词。 */
  instructions: string;
  /** 事实表；服务端按 `${modelLabel}: ${value}` 拍平成 `criteria` 后交给模型。 */
  facts: readonly FactRow[];
  /** 决策点的稳定标识，供录放与遥测对齐（路由里每次提问都带上）。 */
  pointKey: string;
}

/* --------------------------------------------------------------- 驱动 */

/**
 * agent 侧：把游戏状态变成「问题」与「动作」。控制器只通过它接触游戏。
 *
 * 这里**没有任何吃豆人知识**，也没有任何具体动作字面量。
 */
export interface GameDriver<S extends GameState> {
  /** 此刻应该瞄准的决策点；null = 不需要决策（走道 / 唯一活路 / 未开局）。 */
  decision(state: S): DecisionPoint | null;

  /**
   * 预取距离（游戏空间，格）：**距决策点还有这么多格时就该提问**。
   *
   * 它**不受速度倍率影响**。速度改的是游戏时钟，所以按这个固定的游戏空间距离提问时，
   * 墙钟窗口就是 `budgetMs / speed` —— 0.5× 下模型确实有双倍时间，2× 下一半。
   * 控制器不许去补偿倍率：把触发距离乘上速度会让窗口变成恒定值，与 UI 的截止线、
   * 统计面板和速度控件提示三处的说法全部冲突。
   * 见 `docs/design-multi-game.md` §8。
   */
  readonly prefetch: number;
  /** 提交窗口（游戏空间，格）：再近就必须定下来，不能再等。 */
  readonly commitWindow: number;
  /** 1× 速度下的墙钟预算，供延迟直方图标出截止线。 */
  readonly budgetMs: number;

  /** 送给模型的结构化状态（不透明 JSON）。 */
  observe(args: { state: S; point: DecisionPoint; recent: readonly RecentDecision[] }): Observation;

  /** 一次提问：指令 + 事实表。 */
  frame(state: S, point: DecisionPoint): Question;

  /** 刻意笨但保住性命的兜底规则，返回动作与规则名。 */
  fallback(state: S, point: DecisionPoint): { action: ActionId; rule: string };

  /** 把答案落地（写进状态，由下一个固定步长执行）。 */
  apply(state: S, action: ActionId): void;

  /** 调试覆盖层要画的东西，即 `PaintView.debugInfo` 的来源。 */
  debug(state: S): unknown;
}

/* ------------------------------------------------------------- 表现层 */

/** `paint` 的附加输入：一切与玩法无关、只影响画面的东西。 */
export interface PaintView {
  /** 画调试覆盖层（决策点、候选、幽灵目标）。 */
  readonly debug: boolean;
  /** 页面加载以来的毫秒数，驱动脉动与嘴形这类纯表现动画。 */
  readonly timeMs: number;
  /** 彩蛋：色相轮转。 */
  readonly neon: boolean;
  /** 有一次提问在途：把决策点脉动起来。 */
  readonly thinking: boolean;
  /** 玩法之外的画面状态（粒子、飘字、震动）。由该游戏自己的表现层产出，框架只透传。 */
  readonly fx: unknown;
  /** `GameDriver.debug()` 的产物；非调试模式下为 null。 */
  readonly debugInfo: unknown;
}

/**
 * 表现层的出口：`react` 只允许通过它产生动静。
 *
 * 音效与粒子都改不了玩法，所以接口刻意小而笨。坐标处在「该游戏自己的坐标空间」，
 * 由该游戏的表现层解释（吃豆人用像素）。
 */
export interface FxSink {
  /** 播一个音效；名字由各游戏自己定义（见 `lib/audio/sfx.ts` 的 `SfxName`）。 */
  sound(name: string): void;
  /** 屏幕震动，0..1 的强度。 */
  trauma(amount: number): void;
  /** 定格若干毫秒。 */
  freeze(ms: number): void;
  /** 闪屏。 */
  flash(ms: number, color: string): void;
  /** 一格大小的火花。 */
  spark(x: number, y: number, color: string, count?: number): void;
  /** 粒子爆发。 */
  burst(x: number, y: number, color: string, count?: number): void;
  /** 飘字。 */
  popup(x: number, y: number, text: string, color: string, lifeMs?: number): void;
  /** 满屏彩带（关卡通过）。 */
  confetti(width: number, height: number, colors: readonly string[], count?: number): void;
}

/* ------------------------------------------------------------- 游戏定义 */

/**
 * 把「引擎」与「agent 侧」缝起来的那一份对象。
 *
 * 引擎方法（`createState` / `step` / `paint` / …）只谈玩法与画面，
 * `agent` 只谈决策，`meta` 与 `vocab` 只谈展示。三者互不知道对方的内部。
 */
export interface GameDefinition<S extends GameState> {
  readonly meta: GameMeta;
  readonly vocab: ActionVocab;
  readonly agent: GameDriver<S>;

  createState(options: { seed: number }): S;
  start(state: S): void;
  pause(state: S): void;
  resume(state: S): void;

  /**
   * 固定步长（毫秒）。共用循环（`components/games/GameCanvas.tsx`）按它累加时间，
   * 所以它是引擎语义、不是表现层参数：吃豆人 1000/60，蛇也是 1000/60。
   *
   * **游戏内部再做「整步推进」时不要把这里设成那个整步长。** 控制器在 `arriving`
   * 那一跳只有两个分支：答案已到手就落地、`distance ≤ commitWindow` 就兜底 ——
   * 两者都不满足就**什么也不做**（既不提问也不兜底）。而 `arriving` 那一跳的
   * `distance ≤ fixedDtMs / 内步长`，所以必须
   * `fixedDtMs ≤ commitWindow × 内步长`（蛇：`0.05 × 500 = 25 ms`，取 1000/60 ≈ 16.7）。
   * 反例：蛇若把这里设成 500（= 自己的 `MOVE_MS`），`arriving` 会恒为真且 `distance`
   * 恒为 1 > 0.05 —— 结果是一次都不提问、也一次都不兜底。
   */
  readonly fixedDtMs: number;

  /** 推进一个固定步长；返回这一步发生的事件。 */
  step(state: S, dtMs: number): readonly GameEvent[];

  /** 画一帧。`view.fx` 与 `view.debugInfo` 是本游戏自己的表现层产物，需要时自行收窄。 */
  paint(ctx: CanvasRenderingContext2D, state: S, view: PaintView): void;
  /** 画布位图尺寸（井里 letterbox 的基准）。 */
  bitmap(state: S): { width: number; height: number };
  /** 事件 → 音效与粒子。表现层，改不了玩法。 */
  react(events: readonly GameEvent[], state: S, fx: FxSink): void;

  /**
   * 事件 → 面板「事件流」里的一行人话。
   *
   * 句子由游戏自己写：事件长什么样只有它知道（`GameEvent` 只保证有 `type`）。
   * 会话 hook 把引擎事件过一遍这个函数，右栏拿到的是一串已经说好的字符串，
   * 于是右栏仍然不需要知道任何游戏的事件概念。
   */
  describeEvent(event: GameEvent): string;

  /**
   * 手动模式的键盘映射：`KeyboardEvent.key` → 动作。
   *
   * 「人怎么操控它」是游戏定义的一部分，所以键位跟着游戏走，会话 hook 只认这张表。
   * 于是手动驾驶对新游戏是免费的，而游戏页里不会出现任何方向键字面量。
   * 不是所有游戏都用手动模式，空表即可（`{}`）。
   */
  readonly keyActions: Readonly<Record<string, ActionId>>;

  /**
   * 手挑权重的对照玩家（非学习），供「启发式」模式。
   *
   * 它是**游戏代码**：直接读完整局面就行，不必经过观察 —— 观察是给模型的，
   * 而对照玩家的参照系是真实的局面。合法动作由控制器给，免得它自己再算一遍
   * 还算出和这一问不一样的一组。
   */
  heuristic(state: S, actions: readonly ActionId[]): ActionId;

  /** 导出 JSON 里的游戏侧汇总。 */
  summary(state: S): Record<string, number | string | null>;
}
