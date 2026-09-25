/**
 * Snake, assembled: the engine, the agent side, the metadata and the vocabulary
 * behind one `GameDefinition`.
 *
 * 与吃豆人同一个形状，这份文件也是「蛇的哪一半该跟哪一半说话」的唯一知情者，
 * 也是外壳与右栏唯一会 import 的蛇文件。
 */

import type { ActionId, FxSink, GameDefinition } from "../types";
import type { JuiceState } from "../juice";
import { SNAKE_DRIVER, heuristicChoice } from "./agent";
import { describeSnakeEvent } from "./copy";
import { createGame, pauseGame, resumeGame, startGame, stepGame } from "./engine";
import { SNAKE_KEY_ACTIONS, SNAKE_META, SNAKE_VOCAB } from "./meta";
import { EFFECT_COLORS, bitmapSize, drawGame } from "./render";
import type { SnakeDebugView } from "./render";
import { FIXED_DT_MS, GROWTH_PER_FOOD } from "./types";
import type { SnakeEvent, SnakeState } from "./types";

export { SNAKE_DRIVER, SNAKE_INSTRUCTIONS } from "./agent";
export type { SnakeObservation } from "./agent";

/** 网格坐标 → 这一局自己的坐标空间（画布位图单位）。飘字与粒子都按格算。 */
const cellX = (x: number): number => x + 0.5;
const cellY = (y: number): number => y + 0.5;

export const SNAKE: GameDefinition<SnakeState> = {
  meta: SNAKE_META,
  vocab: SNAKE_VOCAB,
  agent: SNAKE_DRIVER,

  createState: (options) => createGame({ seed: options.seed }),
  start: startGame,
  pause: pauseGame,
  resume: resumeGame,

  /**
   * 60 Hz。
   *
   * **不是 `MOVE_MS`（500）** —— 那是走一格的周期，由引擎的累加器消费。把循环步长设成它
   * 会让 `arriving` 恒为真、`distance` 恒为 1 > `commitWindow`，控制器一次都不提问、
   * 也一次都不兜底。约束见 `lib/games/types.ts` 的 `GameDefinition.fixedDtMs`。
   */
  fixedDtMs: FIXED_DT_MS,

  step: (state, dtMs) => stepGame(state, dtMs),

  bitmap: bitmapSize,

  paint(ctx, state, view) {
    drawGame(ctx, state, {
      debug: view.debug,
      time: view.timeMs,
      // `fx` 与 `debugInfo` 都是本游戏自己的表现层产物，框架只是原样带回来。
      juice: view.fx as JuiceState | undefined,
      neon: view.neon,
      thinking: view.thinking,
      reducedMotion: view.reducedMotion,
      debugInfo: view.debugInfo as SnakeDebugView | null,
    });
  },

  /**
   * 引擎事件变成动静。纯表现：这里做不出任何影响玩法的事。
   *
   * `prefers-reduced-motion` 与静音开关都在 sink 里判（`GameCanvas.createFxSink`），
   * 所以这里无条件地写 Effects —— 引擎没有理由知道这台机器要不要动画。
   */
  react(events: readonly SnakeEvent[], state: SnakeState, fx: FxSink): void {
    // 撞死时蛇头没动，所以「它死在哪」就是现在的头那一格。
    const head = state.body[0];
    const headX = head ? cellX(head.x) : 0;
    const headY = head ? cellY(head.y) : 0;

    for (const event of events) {
      switch (event.type) {
        case "FOOD_EATEN":
          fx.sound("chomp");
          fx.spark(cellX(event.cell.x), cellY(event.cell.y), EFFECT_COLORS.food, 8);
          // 长身体要 5 步才补完，飘字说的是这次吃到了几节，不是这一瞬间的长度。
          fx.popup(cellX(event.cell.x), cellY(event.cell.y), `+${GROWTH_PER_FOOD} 节`, EFFECT_COLORS.growth, 900);
          // 一点点定格：这一格是玩家唯一想看清楚的一格。
          fx.freeze(70);
          break;
        case "SNAKE_DIED":
          fx.sound("death");
          fx.burst(headX, headY, EFFECT_COLORS.death, 24);
          fx.flash(220, EFFECT_COLORS.death);
          fx.trauma(1);
          break;
        case "BOARD_CLEARED":
          fx.sound("level");
          fx.confetti(state.board.width, state.board.height, EFFECT_COLORS.cleared, 54);
          fx.popup(state.board.width / 2, state.board.height * 0.42, "通关", EFFECT_COLORS.growth, 1200);
          fx.trauma(0.4);
          break;
        default:
          break;
      }
    }
  },

  /** 事件流里的一行人话。事件的形状只有蛇自己知道，所以句子也由它写。 */
  describeEvent(event: SnakeEvent): string {
    return describeSnakeEvent(event);
  },

  /** 手动模式的驾驶键：方向键 → 四向动作。 */
  keyActions: SNAKE_KEY_ACTIONS,

  /**
   * 对照玩家：`heuristicChoice` 的签名与这里要的一模一样（它读完整局面，不经过观察），
   * 所以直接挂上去，不像吃豆人那样还要在中间包一层。
   */
  heuristic(state: SnakeState, actions: readonly ActionId[]): ActionId {
    return heuristicChoice(state, actions);
  },

  summary(state: SnakeState): Record<string, number | string | null> {
    return {
      score: state.score,
      length: state.body.length,
      moves: state.moves,
      heading: state.heading,
      freeCells: state.board.width * state.board.height - state.body.length,
      playTimeMs: state.playTimeMs,
    };
  },
};
