/**
 * 贪吃蛇的 agent 侧：控制器需要知道的关于蛇的一切。
 *
 * 观察、事实表、兜底规则、对照玩家都在这里；`lib/agent` 只留两个游戏共用的那套机器
 * （按时提问、校验、超时、记账）。控制器那段预取 / 提交 / 超时 / 世代作废的逻辑只认
 * `DecisionPoint`，字段到两个游戏的映射表见 `docs/design-multi-game.md` §3.3。
 *
 * 一处口径值得先说清楚，因为它决定了事实表的意义：**`actions` 是「四向减去 180° 反向」，
 * 不是「减去致命方向」。** 撞墙、咬到自己都是**可执行的**动作，只是会死 —— 这正是平台要测的
 * 东西（模型会不会踩进去），所以「立刻致命」这一行必须随方向变化，而不是永远写「否」。
 * 兜底那一侧则相反：它永远在安全方向里挑，除非那一步一个安全方向都没有。
 */

import type { ActionId, DecisionPoint, FactRow, GameDriver, Observation, Question, RecentDecision } from "../types";
import { distanceToFood, foodDistanceAfter, freeCellsAfter, freedomAfter, headCell, isLethal, isReversal } from "./analysis";
import { steer } from "./engine";
import { DIRECTIONS, FIXED_DT_MS, MOVE_MS } from "./types";
import type { Direction, SnakeCell, SnakeState } from "./types";

/* ------------------------------------------------------------------ 常量 */

/** 一次决策的墙钟预算（1×）。与吃豆人同为 500 ms，跨游戏延迟才可直接比较。 */
export const DECISION_BUDGET_MS = 500;

/**
 * 预取一个移动周期。
 *
 * 蛇每 `MOVE_MS` 才走一格，而「提前提问」的上限就是它 —— 再早就问不到有意义的东西了
 * （下一步的方向还没被这一步的结果决定）。它**不受速度倍率影响**，见 `docs/design-multi-game.md` §8。
 */
export const DECISION_PREFETCH_STEPS = 1;

/**
 * 提交窗口（格）：再近就必须定下来。
 *
 * 0.05 格 = 25 ms。它同时是 `fixedDtMs` 的上界来源：`arriving` 那一跳的 `distance`
 * 最多是 `fixedDtMs / MOVE_MS`，必须落在这个窗口内，否则控制器既不落地也不兜底。
 */
export const COMMIT_WINDOW_STEPS = 0.05;

/** 观察里带几条最近决策。 */
export const MAX_RECENT_DECISIONS = 3;

export const SNAKE_OBJECTIVE = "Survive as long as possible and grow the snake.";

export const SNAKE_INSTRUCTIONS = `Choose the snake's next direction for the move it is about to make.

Priority:
1. Survive. Never choose a direction marked fatal while a safe one exists.
2. Keep room to move. A move that leaves few reachable cells can trap the snake even though it survives this step.
3. Reach the food. Among otherwise similar moves, prefer the shorter distance.
4. Keep the current heading when it costs nothing.

The snake never turns by itself: the direction you pick is taken at the next grid step, and reversing
into your own neck is not among the actions.

Every legal direction comes with the same set of labelled facts; compare them across directions.
Use only the supplied game state and those facts. Choose exactly one legal direction.`;

/* --------------------------------------------------------------- 工具 */

/** 四向减去 180° 反向。首步没有朝向，所以四个都在。 */
function forwardDirections(state: SnakeState): Direction[] {
  return DIRECTIONS.filter((direction) => !isReversal(state.heading, direction));
}

/** 其中不会立刻死的那几个。空数组 = 这一步所有方向都会死。 */
function safeDirections(state: SnakeState, actions: readonly Direction[]): Direction[] {
  return actions.filter((direction) => !isLethal(state, direction));
}

/** 坐标统一成 `[x, y]`：数组比对象短，而且顺序就是「头到尾」。 */
function pair(cell: SnakeCell): [number, number] {
  return [cell.x, cell.y];
}

/* --------------------------------------------------------------- 观察 */

/**
 * 送给模型的结构化状态。
 *
 * 用 `type` 而不是 `interface`：只有类型别名有隐式索引签名，才满足跨游戏的
 * `Observation = Record<string, unknown>`。
 *
 * 蛇身是**有序**的 `[x, y][]`（头在前），不是集合：这是游戏状态本身，抽掉它这局就不可解了。
 */
export type SnakeObservation = {
  objective: string;
  board: { width: number; height: number };
  snake: {
    head: [number, number];
    heading: Direction | null;
    length: number;
    body: [number, number][];
  };
  food: { cell: [number, number]; distance: number | null } | null;
  progress: {
    foodEaten: number;
    steps: number;
    freeCells: number;
    playTimeMs: number;
  };
  recentDecisions: { cell: [number, number] | null; chosen: ActionId }[];
};

/* ---------------------------------------------------------------- 驱动 */

export const SNAKE_DRIVER: GameDriver<SnakeState> = {
  prefetch: DECISION_PREFETCH_STEPS,
  commitWindow: COMMIT_WINDOW_STEPS,
  budgetMs: DECISION_BUDGET_MS,

  decision(state: SnakeState): DecisionPoint | null {
    if (state.status !== "PLAYING") return null;

    const actions = forwardDirections(state);

    /*
     * 唯一的活路就是继续直行时不提问：这一步没有可决定的 —— 引擎本来就会沿 `heading` 走。
     *
     * 反过来，唯一活路是一次**转向**时仍然要问：蛇不会自己转弯，不问就没人给方向，
     * 它会直着撞死。全致命时也问，一方面让兜底的第四条（按当前朝向）有地方落地，
     * 另一方面把这次死亡记进决策历史，而不是留下一个没人解释的 SNAKE_DIED。
     */
    const safe = safeDirections(state, actions);
    if (safe.length === 1 && safe[0] === state.heading) return null;

    return {
      key: `${state.epoch}:${state.moves}`,
      at: { ...headCell(state) },
      actions,
      // 一格内的剩余比例：1 = 刚开始这一步，0 = 该落地了。
      distance: (MOVE_MS - state.stepAccumMs) / MOVE_MS,
      // 一步前瞻：这一跳就会走满一格。**不能**写成 `accum >= MOVE_MS` ——
      // 引擎在同一个 step 里就把累加器消耗掉了，控制器永远看不到那个状态。
      arriving: state.stepAccumMs + FIXED_DT_MS >= MOVE_MS,
      facing: state.heading,
    };
  },

  observe({ state, recent }: { state: SnakeState; point: DecisionPoint; recent: readonly RecentDecision[] }): Observation {
    const head = headCell(state);
    const food = state.food;

    const observation: SnakeObservation = {
      objective: SNAKE_OBJECTIVE,
      board: { width: state.board.width, height: state.board.height },
      snake: {
        head: pair(head),
        heading: state.heading,
        length: state.body.length,
        body: state.body.map(pair),
      },
      food: food ? { cell: pair(food), distance: distanceToFood(state, head) } : null,
      progress: {
        // 分数就是吃到食物的个数，见 `SnakeState.score`。
        foodEaten: state.score,
        steps: state.moves,
        freeCells: state.board.width * state.board.height - state.body.length,
        playTimeMs: Math.round(state.playTimeMs),
      },
      recentDecisions: recent.slice(-MAX_RECENT_DECISIONS).map((decision) => ({
        cell: decision.at ? pair(decision.at) : null,
        chosen: decision.action,
      })),
    };

    return observation;
  },

  frame(state: SnakeState, point: DecisionPoint): Question {
    const actions = point.actions as readonly Direction[];

    const row = (label: string, modelLabel: string, value: (direction: Direction) => string): FactRow => {
      const values: Record<ActionId, string> = {};
      for (const action of actions) values[action] = value(action);
      return { label, modelLabel, values };
    };

    return {
      instructions: SNAKE_INSTRUCTIONS,
      facts: [
        row("立刻致命", "Fatal on arrival", (direction) => (isLethal(state, direction) ? "yes" : "no")),
        row("该方向可达空格数", "Reachable cells after this move", (direction) => `${freeCellsAfter(state, direction)}`),
        row("距食物（格）", "Distance to food (cells)", (direction) => {
          const distance = foodDistanceAfter(state, direction);
          return distance === null ? "unreachable" : `${distance}`;
        }),
        row("是否沿当前朝向", "Continues current heading", (direction) => (direction === state.heading ? "yes" : "no")),
        row("该方向的自由度", "Safe directions at the next cell", (direction) => `${freedomAfter(state, direction)}`),
        row("蛇长", "Snake length", () => `${state.body.length}`),
      ],
    };
  },

  /**
   * 兜底：模型的答案没按时到，或者根本没配 Key 时，蛇靠什么活下去。
   *
   * 刻意笨，与吃豆人同一档。它不会规划路线、不会找食物、也不会替模型做价值判断：
   * 只保证这一步别死，而且每一次使用都会被记进决策历史。
   *
   * 规则，按顺序：
   *   1. 继续当前朝向
   *   2. 唯一的安全方向
   *   3. 安全方向里可达空格最多的那个
   *   4. 全致命 → 按当前朝向，并如实记成「死路」
   */
  fallback(state: SnakeState, point: DecisionPoint): { action: ActionId; rule: string } {
    const actions = point.actions as readonly Direction[];
    const safe = safeDirections(state, actions);

    if (state.heading !== null && safe.includes(state.heading)) {
      return { action: state.heading, rule: "保持当前朝向" };
    }
    if (safe.length === 1) return { action: safe[0], rule: "唯一安全方向" };
    if (safe.length > 1) {
      let best = safe[0];
      let bestSpace = freeCellsAfter(state, best);
      for (const direction of safe) {
        const space = freeCellsAfter(state, direction);
        const orderedBetter =
          space > bestSpace || (space === bestSpace && DIRECTIONS.indexOf(direction) < DIRECTIONS.indexOf(best));
        if (orderedBetter) {
          best = direction;
          bestSpace = space;
        }
      }
      return { action: best, rule: "可达空格最多" };
    }

    // 全致命：没有安全的可挑。按当前朝向走完这一步，并让规则名说清这是死路。
    return { action: state.heading ?? actions[0], rule: "死路，按当前朝向" };
  },

  apply(state: SnakeState, action: ActionId): void {
    // 合法性由控制器按 `DecisionPoint.actions` 判过；反向由 `steer` 在写入时再拒一次。
    steer(state, action as Direction);
  },

  /** 调试覆盖层要画的那一半：头、朝向、每个方向致命与否、可达数。 */
  debug(state: SnakeState): unknown {
    const forward = forwardDirections(state);
    const safe = safeDirections(state, forward);

    const info: SnakeDebugInfo = {
      head: { ...headCell(state) },
      heading: state.heading,
      forward,
      safe,
      fatal: forward.filter((direction) => !safe.includes(direction)),
      food: state.food ? { ...state.food } : null,
      foodDistance: distanceToFood(state, headCell(state)),
    };
    return info;
  },
};

export interface SnakeDebugInfo {
  head: SnakeCell;
  heading: Direction | null;
  forward: Direction[];
  safe: Direction[];
  fatal: Direction[];
  food: SnakeCell | null;
  foodDistance: number | null;
}

/* ------------------------------------------------------------ 对照玩家 */

/**
 * 手挑的权重，不是学出来的。
 *
 * 先保命（`isLethal` 已经在选池里滤掉），再保空间，最后才贪食物：蛇的死法几千种，
 * 九成是自己把自己关起来，而食物只是分数。并列按 `DIRECTIONS` 的顺序，保证可复现。
 */
const WEIGHT_SPACE = 1;
const WEIGHT_FOOD = 4;
const WEIGHT_FORWARD = 0.5;
/** 到不了食物时按这个距离算：比任何真距离都远，所以有可达食物的方向一定赢过它。 */
const UNREACHABLE_FOOD = 64;

/**
 * 从事实表的同一批数里挑一个动作的对照玩家。
 *
 * 这是模型被量化的那把尺子，所以它只看得出「安全 / 开阔 / 离食物近」三件事，
 * 而且必须完全确定 —— 同一局面永远给同一个答案。
 */
export function heuristicChoice(state: SnakeState, actions: readonly ActionId[]): ActionId {
  const directions = actions as readonly Direction[];
  const safe = safeDirections(state, directions);
  // 全致命时没有「安全」可言：退回全部动作，至少保证返回的确实是 actions 里的一个。
  const pool = safe.length > 0 ? safe : directions;

  let best = pool[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const direction of pool) {
    const food = foodDistanceAfter(state, direction);
    const score =
      WEIGHT_SPACE * freeCellsAfter(state, direction) -
      WEIGHT_FOOD * (food ?? UNREACHABLE_FOOD) +
      (direction === state.heading ? WEIGHT_FORWARD : 0);

    const orderedBetter =
      score > bestScore || (score === bestScore && DIRECTIONS.indexOf(direction) < DIRECTIONS.indexOf(best));
    if (orderedBetter) {
      bestScore = score;
      best = direction;
    }
  }

  return best;
}
