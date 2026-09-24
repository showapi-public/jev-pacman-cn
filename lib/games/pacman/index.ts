/**
 * Pac-Man, assembled: the engine, the agent side, the metadata and the vocabulary
 * behind one `GameDefinition`.
 *
 * This is the only file that knows how Pac-Man's halves fit together, and it is
 * the only Pac-Man file the shell and the panels ever import. Everything below
 * it (engine, renderer, driver) stays independent of every other game.
 */

import type { ActionId, DecisionPoint, FxSink, GameDefinition } from "../types";
import { PACMAN_DRIVER, heuristicChoice } from "./agent";
import { analyzeCandidates } from "./analysis";
import { occupiedTile } from "./collision";
import { createGame, pauseGame, resumeGame, startGame, stepGame } from "./engine";
import type { JuiceState } from "./juice";
import { PACMAN_META, PACMAN_VOCAB } from "./meta";
import type { RenderOptions } from "./render";
import { EFFECT_COLORS, TILE, drawGame, ghostColor } from "./render";
import type { Direction, PacmanEvent, PacmanState } from "./types";

export { PACMAN_DRIVER, PACMAN_INSTRUCTIONS } from "./agent";
export type { PacmanObservation } from "./agent";

export const PACMAN: GameDefinition<PacmanState> = {
  meta: PACMAN_META,
  vocab: PACMAN_VOCAB,
  agent: PACMAN_DRIVER,

  createState: (options) => createGame({ seed: options.seed }),
  start: startGame,
  pause: pauseGame,
  resume: resumeGame,

  step: (state, dtMs) => stepGame(state, dtMs),

  bitmap: (state) => ({ width: state.maze.width * TILE, height: state.maze.height * TILE }),

  paint(ctx, state, view) {
    drawGame(ctx, state, {
      debug: view.debug,
      time: view.timeMs,
      // `fx` 与 `debugInfo` 都是本游戏自己的表现层产物，框架只是原样带回来。
      juice: view.fx as JuiceState | undefined,
      neon: view.neon,
      thinking: view.thinking,
      debugInfo: view.debugInfo as RenderOptions["debugInfo"],
    });
  },

  /**
   * Engine events become sound and particles.
   *
   * Presentation only: nothing here can change what Pac-Man does. The
   * `prefers-reduced-motion` decision and the mute switch live in the sink, not
   * here — the engine has no business knowing about either.
   *
   * The parameter is narrowed to `PacmanEvent[]` on purpose: this is Pac-Man's
   * half of the definition, and only its own engine emits events it can read.
   */
  react(events: readonly PacmanEvent[], state: PacmanState, fx: FxSink): void {
    const tile = state.pacman.tile;
    for (const event of events) {
      switch (event.type) {
        case "PELLET_EATEN":
          fx.sound("chomp");
          fx.spark(event.tile.x, event.tile.y, EFFECT_COLORS.pellet, 2);
          break;
        case "POWER_PELLET_EATEN":
          fx.sound("power");
          fx.flash(150, EFFECT_COLORS.power);
          fx.spark(event.tile.x, event.tile.y, EFFECT_COLORS.power, 6);
          fx.trauma(0.25);
          break;
        case "GHOST_EATEN":
          fx.sound("ghost");
          fx.burst(tile.x, tile.y, ghostColor(event.ghost), 16);
          fx.popup(tile.x, tile.y - 1, `+${event.score}`, EFFECT_COLORS.score);
          fx.freeze(80);
          fx.trauma(0.5);
          break;
        case "PACMAN_DIED":
          fx.sound("death");
          fx.burst(tile.x, tile.y, EFFECT_COLORS.death, 22);
          fx.flash(220, EFFECT_COLORS.death);
          fx.trauma(1);
          break;
        case "LEVEL_CLEARED":
          fx.sound("level");
          fx.confetti(state.maze.width, state.maze.height, EFFECT_COLORS.level, 54);
          fx.popup(state.maze.width / 2, state.maze.height * 0.42, `第 ${state.level} 关`, EFFECT_COLORS.score, 1200);
          break;
        case "GAME_OVER":
          fx.flash(320, EFFECT_COLORS.death);
          fx.trauma(0.6);
          break;
        default:
          break;
      }
    }
  },

  heuristic(state: PacmanState, actions: readonly ActionId[]): ActionId {
    const directions = actions as readonly Direction[];
    const point = PACMAN_DRIVER.decision(state);
    // No decision point means no junction ahead, so there is nothing to weigh;
    // any legal action keeps the reference player honest.
    if (!point) return directions[0];

    const junction = point.at ?? occupiedTile(state.pacman);
    const heading = (point.facing ?? state.pacman.direction) as Direction;
    return heuristicChoice(directions, analyzeCandidates(state, junction, heading, directions));
  },

  summary(state: PacmanState): Record<string, number | string | null> {
    return {
      score: state.score,
      lives: state.lives,
      level: state.level,
      pelletsEaten: state.pelletsEaten,
      ghostsEaten: state.ghostsEaten,
      playTimeMs: state.playTimeMs,
    };
  },
};
