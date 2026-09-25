/**
 * 贪吃蛇的核心类型与常量。
 *
 * 与吃豆人同一套规矩：引擎是纯数据 + 纯函数，没有 React、没有 canvas、没有 `Math.random`。
 * 只有 `SnakeState` 需要满足 `../types.ts` 的跨游戏 `GameState` 契约。
 *
 * 保真与偏离的对照表在 `docs/design-multi-game.md` §9：上游是 patorjk/JavaScript-Snake
 * （MIT），我们只保真**规则**，驱动方式与随机数都换成项目自己的一套。
 */

import type { GameState, GameStatus } from "../types";

export type { GameStatus };

/**
 * 方向。编码沿用上游：`0=上, 1=右, 2=下, 3=左`，`COLUMN_SHIFT`/`ROW_SHIFT` 直接照搬，
 * 所以「差 2 即反向」这类上游性质的推理在这里依然成立。
 */
export type Direction = "UP" | "RIGHT" | "DOWN" | "LEFT";

/**
 * 固定顺序，即上游的数字序。
 *
 * 它同时是裁决顺序：`legalActions` 按它返回，启发式的并列也按它打破。改这个数组
 * 等于改所有并列场景的结果，不是「整理一下」。
 */
export const DIRECTIONS: readonly Direction[] = ["UP", "RIGHT", "DOWN", "LEFT"];

/** 上游 `columnShift`。 */
export const COLUMN_SHIFT: Readonly<Record<Direction, number>> = { UP: 0, RIGHT: 1, DOWN: 0, LEFT: -1 };

/** 上游 `rowShift`。 */
export const ROW_SHIFT: Readonly<Record<Direction, number>> = { UP: -1, RIGHT: 0, DOWN: 1, LEFT: 0 };

/**
 * 固定 **24×24**。
 *
 * 上游按视口推盘面尺寸 —— 那对渲染是方便，代价是同一局在大小窗口下难度不同。
 * 尺寸是难度的自变量，必须固定，否则两个模型的成绩没法比、两局之间也没法比。
 */
export const BOARD_TILES = 24;

/**
 * 走一格需要多少毫秒。上游是 120 ms（街机感），这里放到 500 ms：
 * 决策要时间去想，而 500 ms 恰好也是吃豆人声明的墙钟预算，跨游戏延迟才可直接比较。
 */
export const MOVE_MS = 500;

/**
 * 引擎切片的固定步长（60 Hz）。
 *
 * **不要把它设成 `MOVE_MS` 或别的接近内步长的值。** 控制器的提交窗口是
 * `commitWindow = 0.05` 格，而 `arriving` 那一跳的 `distance ≤ fixedDtMs / MOVE_MS`；
 * 取 500 会让 `arriving` 恒为真、`distance` 恒为 1 > 0.05 ——
 * 结果是一次都不提问、也一次都不兜底。约束的推导见 `GameDefinition.fixedDtMs`。
 */
export const FIXED_DT_MS = 1000 / 60;

/** 每吃一个食物长几节（上游 `growthIncr`）。 */
export const GROWTH_PER_FOOD = 5;

/** 出生长度。上游也是 1：先只有头，吃到第一颗食物才开始变长。 */
export const STARTING_LENGTH = 1;

export interface SnakeCell {
  x: number;
  y: number;
}

export interface SnakeBoard {
  readonly width: number;
  readonly height: number;
}

export type DeathReason = "WALL" | "SELF";

export interface SnakeState extends GameState {
  /** 盘面尺寸。固定 24×24，但写成数据是为了让测试能缩到 2×1 去验「没有空格」那条规则。 */
  readonly board: SnakeBoard;
  /**
   * 身体，头在 `[0]`、尾在末尾。
   *
   * 上游用带头尾指针的节点环形链表 —— 那是渲染需要。纯引擎用数组更好测，
   * 而 `unshift` / `pop` 正好就是双端队列的两个操作。
   */
  body: SnakeCell[];
  /** 蛇头正在走的朝向；`null` = 还没走过第一步（此时任何方向都接受）。 */
  heading: Direction | null;
  /** 已收到、还没被整格消费掉的转向；`null` = 保持朝向。 */
  requested: Direction | null;
  /** 还要长几节：吃一个食物 +`GROWTH_PER_FOOD`，之后每走一步 −1。 */
  growth: number;
  /** 食物；`null` = 盘面已满，通关。 */
  food: SnakeCell | null;
  /** 累计推进的格数。`decision()` 的 `key` 用它当 moveIndex。 */
  moves: number;
  /**
   * 距离下一格还差多少毫秒（累加器）。
   *
   * 它住在状态里而不是循环里，是因为**驱动要读它**：`distance = (MOVE_MS − stepAccumMs) / MOVE_MS`
   * 就是「还有多远到决策点」。放在渲染循环里的话，agent 这一侧永远看不到。
   */
  stepAccumMs: number;
  /** 当前随机数状态（mulberry32）。 */
  rngState: number;
}

export type SnakeEvent =
  | { type: "FOOD_EATEN"; cell: SnakeCell; score: number; length: number }
  | { type: "SNAKE_DIED"; reason: DeathReason }
  | { type: "BOARD_CLEARED" };

/* --------------------------------------------------------------- seeded rng */

/**
 * The PRNG is not the snake's either: it lives in `lib/rng.ts` so that every game,
 * and the baseline players, replay from one seed with one implementation.
 */
export { nextRandom, seedToRngState } from "../../rng";
