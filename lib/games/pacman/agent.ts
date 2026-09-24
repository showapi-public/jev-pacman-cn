/**
 * Pac-Man's agent side: everything the controller needs to know about Pac-Man.
 *
 * This is where the knowledge that used to be spread over `lib/agent/*` now
 * lives — the observation, the question, the facts table, the fallback rules and
 * the debug overlay. `lib/agent` keeps only the machinery that is the same for
 * every game (asking in time, validating, timing out, logging).
 *
 * The controller's prefetch/commit/timeout loop is unchanged by the move: it
 * only ever wanted a `DecisionPoint`, and `decision()` here produces one. See
 * `docs/design-multi-game.md` §3.3 for the field-by-field mapping.
 */

import type { ActionId, DecisionPoint, FactRow, GameDriver, Observation, RecentDecision } from "../types";
import { analyzeCandidates, isDangerousGhost } from "./analysis";
import type { CandidateAnalysis } from "./analysis";
import { occupiedTile } from "./collision";
import { requestDirection } from "./engine";
import { buildFacts } from "./facts";
import { ghostTarget } from "./ghosts";
import { distanceToTileCenter } from "./movement";
import { bfs, findNextDecisionPoint, getMeaningfulDirections } from "./pathfinding";
import type { Direction, PacmanState, TilePosition } from "./types";
import {
  DECISION_DEADLINE_MS,
  DECISION_PREFETCH_TILES,
  DIRECTION_ORDER,
  neighbor,
  oppositeDirection,
  tileKey,
} from "./types";

/** How close to the junction centre Pac-Man may get before a decision is forced. */
export const COMMIT_WINDOW_TILES = 0.15;

/** How many recent decisions the observation carries. */
export const MAX_RECENT_DECISIONS = 3;

export const PACMAN_OBJECTIVE = "Survive and maximize Pac-Man's score.";

export const PACMAN_INSTRUCTIONS = `Choose Pac-Man's next direction at the target junction.

Priority:
1. Stay alive.
2. Avoid dangerous ghosts.
3. When ghosts are frightened, eat them when reasonably safe.
4. Use power pellets when useful for survival.
5. Collect pellets efficiently.
6. Avoid dead ends and unnecessary reversals unless they are safer.

Every legal direction comes with the same set of labelled facts; compare them across directions.
Use only the supplied game state and those facts. Choose exactly one legal direction.`;

/* --------------------------------------------------------------- 观察 */

export interface GhostObservation {
  name: string;
  tile: TilePosition;
  mode: string;
  /** BFS distance from Pac-Man to this ghost, null when the ghost is behind the house gate. */
  distanceToPacman: number | null;
}

/**
 * What the model is shown.
 *
 * A `type`, not an `interface`, on purpose: only type aliases get an implicit
 * index signature, so only a type alias satisfies the cross-game
 * `Observation = Record<string, unknown>` contract.
 */
export type PacmanObservation = {
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
  /**
   * The per-direction candidate block.
   *
   * It duplicates the fact table — the panel still renders its "推理输入" table
   * from here, and the model is already given the same numbers as `criteria`.
   * It stays until the panel switches to `Question.facts`, at which point the
   * model and the reader will be looking at one object instead of two.
   */
  candidates: Partial<Record<Direction, CandidateAnalysis>>;
  recentDecisions: { junction: TilePosition; chosen: ActionId }[];
};

/* --------------------------------------------------------------- 工具 */

/**
 * `point` 总是本文件 `decision()` 自己造出来的，所以这三个字段的收窄不是猜测：
 * `at` 一定有值，`facing` 一定是四向之一，`actions` 一定是 `Direction` 集合。
 */
function unpack(
  state: PacmanState,
  point: DecisionPoint,
): { junction: TilePosition; heading: Direction; directions: readonly Direction[] } {
  return {
    junction: point.at ?? occupiedTile(state.pacman),
    heading: (point.facing ?? state.pacman.direction) as Direction,
    directions: point.actions as readonly Direction[],
  };
}

/* ------------------------------------------------------------- 兜底 */

export interface FallbackChoice {
  direction: Direction;
  /** Which rule fired, for the decision feed. */
  rule: string;
}

/**
 * The fallback: what Pac-Man does when the model's answer does not arrive in time.
 *
 * It is deliberately stupid. A clever fallback would be a second Pac-Man player,
 * and the demo's whole claim is that the model is the one playing. These rules
 * never look at pellets, never plan a route and never out-vote the model: they
 * only keep the game alive for one junction, and every use is logged.
 *
 * Rules, in order:
 *   1. keep going the way Pac-Man is already heading
 *   2. the only other way out of this tile
 *   3. the way that puts the most distance between Pac-Man and a dangerous ghost
 *   4. fixed direction order, UP then LEFT then DOWN then RIGHT
 */
export function chooseFallback(
  state: PacmanState,
  junction: TilePosition,
  heading: Direction,
  legalDirections: readonly Direction[],
): FallbackChoice {
  const legal = legalDirections.filter((direction) => direction !== oppositeDirection(heading));

  if (legal.includes(heading)) return { direction: heading, rule: "保持当前朝向" };
  if (legal.length === 1) return { direction: legal[0], rule: "唯一其他出口" };

  if (legal.length > 1) {
    const dangerous = state.ghosts.filter((ghost) => isDangerousGhost(ghost.mode));
    if (dangerous.length > 0) {
      let best: Direction = legal[0];
      let bestDistance = -1;
      for (const direction of legal) {
        const field = bfs(state.maze, neighbor(junction, direction));
        let nearest: number | null = null;
        for (const ghost of dangerous) {
          const distance = field.distanceAt(ghost.tile);
          if (distance < 0) continue;
          if (nearest === null || distance < nearest) nearest = distance;
        }
        // A ghost that cannot be reached from here is not a threat at all.
        const score = nearest === null ? Number.MAX_SAFE_INTEGER : nearest;
        if (score > bestDistance) {
          bestDistance = score;
          best = direction;
        }
      }
      return { direction: best, rule: "远离最近的危险幽灵" };
    }
  }

  const order: Direction[] = [
    ...DIRECTION_ORDER.filter((direction) => legal.includes(direction)),
    ...DIRECTION_ORDER.filter(
      (direction) => direction === oppositeDirection(heading) && legalDirections.includes(direction),
    ),
  ];
  const direction = order[0] ?? oppositeDirection(heading);
  return { direction, rule: order.length === 0 ? "死路，掉头" : "按固定方向顺序" };
}

/* ------------------------------------------------------------ 对照玩家 */

/**
 * A deterministic player built from the candidate facts: the yardstick the
 * model is measured against. Weights are hand-picked, not learned.
 */
export function heuristicChoice(
  directions: readonly Direction[],
  candidates: Record<Direction, CandidateAnalysis>,
): Direction {
  let best = directions[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const direction of directions) {
    const candidate = candidates[direction];
    if (!candidate) continue;

    const danger = candidate.nearestDangerousGhostDistance ?? 12;
    const pellet = candidate.nearestPelletDistance ?? 12;
    const frightened =
      candidate.nearestFrightenedGhostDistance !== null && candidate.nearestFrightenedGhostDistance <= 4 ? 1 : 0;

    const score =
      3 * Math.min(danger, 12) +
      0.6 * candidate.pelletsWithin6Tiles -
      0.5 * Math.min(pellet, 12) +
      2 * frightened +
      0.02 * candidate.reachableSafeArea -
      (candidate.deadEnd ? 8 : 0) +
      (candidate.continuesForward ? 0.7 : 0);

    const orderedBetter =
      score > bestScore ||
      (score === bestScore && DIRECTION_ORDER.indexOf(direction) < DIRECTION_ORDER.indexOf(best));

    if (orderedBetter) {
      bestScore = score;
      best = direction;
    }
  }

  return best;
}

/* ---------------------------------------------------------------- 驱动 */

export const PACMAN_DRIVER: GameDriver<PacmanState> = {
  // Three tiles at six tiles a second is 500 ms of wall clock — at 1× speed.
  // The speed multiplier compresses that window; the controller scales the
  // prefetch by it so the question is still asked as early as it can be.
  prefetch: DECISION_PREFETCH_TILES,
  commitWindow: COMMIT_WINDOW_TILES,
  budgetMs: DECISION_DEADLINE_MS,

  decision(state: PacmanState): DecisionPoint | null {
    if (state.status !== "PLAYING") return null;

    const heading = state.pacman.direction;
    const found = findNextDecisionPoint(state.maze, state.pacman.tile, heading);
    if (!found) return null;

    const { junction } = found;
    return {
      key: `${state.epoch}:${tileKey(junction)}`,
      at: junction,
      actions: getMeaningfulDirections(state.maze, junction, found.heading),
      distance: distanceToTileCenter(state.pacman) + found.steps,
      arriving: state.pacman.tile.x === junction.x && state.pacman.tile.y === junction.y,
      // The heading Pac-Man will be travelling when he arrives at the junction,
      // which is the one every rule below reasons about — not necessarily the
      // one he has right now, if he turns along the way.
      facing: found.heading,
    };
  },

  observe({ state, point, recent }: { state: PacmanState; point: DecisionPoint; recent: readonly RecentDecision[] }): Observation {
    const { junction, heading, directions } = unpack(state, point);
    const ghostField = bfs(state.maze, occupiedTile(state.pacman));
    const candidates = analyzeCandidates(state, junction, heading, directions);

    const observation: PacmanObservation = {
      objective: PACMAN_OBJECTIVE,
      game: {
        score: state.score,
        lives: state.lives,
        pelletsRemaining: state.pellets.size,
        powerPelletsRemaining: state.powerPellets.size,
      },
      pacman: {
        tile: occupiedTile(state.pacman),
        heading,
      },
      targetJunction: {
        tile: junction,
        legalDirections: [...point.actions] as Direction[],
      },
      mode: {
        frightened: state.fright.active,
        frightenedRemainingMs: Math.max(0, Math.round(state.fright.remainingMs)),
      },
      ghosts: state.ghosts.map((ghost): GhostObservation => {
        const distance = ghostField.distanceAt(ghost.tile);
        return {
          name: ghost.name,
          tile: ghost.tile,
          mode: ghost.mode,
          distanceToPacman: distance >= 0 ? distance : null,
        };
      }),
      candidates: directions.reduce<Partial<Record<Direction, CandidateAnalysis>>>((acc, direction) => {
        const candidate = candidates[direction];
        if (!candidate) return acc;
        // The first tile is the only field that is a position rather than a fact
        // about the choice; the model is asked about outcomes, not coordinates.
        const { firstTile: _firstTile, ...facts } = candidate;
        void _firstTile;
        acc[direction] = facts as CandidateAnalysis;
        return acc;
      }, {}),
      recentDecisions: recent
        .slice(-MAX_RECENT_DECISIONS)
        .map((decision) => ({ junction: decision.at ?? junction, chosen: decision.action })),
    };

    return observation;
  },

  frame(state: PacmanState, point: DecisionPoint): { instructions: string; facts: readonly FactRow[] } {
    const { junction, heading, directions } = unpack(state, point);
    const candidates = analyzeCandidates(state, junction, heading, directions);
    return { instructions: PACMAN_INSTRUCTIONS, facts: buildFacts(directions, candidates) };
  },

  fallback(state: PacmanState, point: DecisionPoint): { action: ActionId; rule: string } {
    const { junction, heading, directions } = unpack(state, point);
    const choice = chooseFallback(state, junction, heading, directions);
    return { action: choice.direction, rule: choice.rule };
  },

  apply(state: PacmanState, action: ActionId): void {
    // 合法性由控制器按 `DecisionPoint.actions` 判过，这里只落地。
    requestDirection(state, action as Direction);
  },

  /** The debug overlay's game-derived half; the controller adds its own `pending` line. */
  debug(state: PacmanState): unknown {
    const point = this.decision(state);
    const junction = point?.at ?? null;
    const legalDirections = (point?.actions ?? []) as readonly Direction[];
    return {
      junction,
      legalDirections,
      candidateTiles: junction ? legalDirections.map((direction) => neighbor(junction, direction)) : [],
      ghostTargets: state.ghosts
        .filter((ghost) => ghost.mode === "CHASE" || ghost.mode === "SCATTER")
        .map((ghost) => ghostTarget(ghost, state)),
    };
  },
};
