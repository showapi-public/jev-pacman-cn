/**
 * The fallback: what Pac-Man does when Jev's answer does not arrive in time.
 *
 * It is deliberately stupid. A clever fallback would be a second Pac-Man
 * player, and the demo's whole claim is that Jev is the one playing. These
 * rules never look at pellets, never plan a route, and never out-vote Jev:
 * they only keep the game alive for one junction, and every use is logged.
 */

import type { Direction, GameState, TilePosition } from "../game/types";
import { DIRECTION_ORDER, neighbor, oppositeDirection } from "../game/types";
import { bfs } from "../game/pathfinding";
import { isDangerousGhost } from "../game/analysis";

export interface FallbackChoice {
  direction: Direction;
  /** Which rule fired, for the decision feed. */
  rule: string;
}

/**
 * Rules, in order:
 *   1. keep going the way Pac-Man is already heading
 *   2. the only other way out of this tile
 *   3. the way that puts the most distance between Pac-Man and a dangerous ghost
 *   4. fixed direction order, UP then LEFT then DOWN then RIGHT
 */
export function chooseFallback(
  state: GameState,
  junction: TilePosition,
  heading: Direction,
  legalDirections: readonly Direction[],
): FallbackChoice {
  const legal = legalDirections.filter((direction) => direction !== oppositeDirection(heading));

  if (legal.includes(heading)) return { direction: heading, rule: "keep heading" };
  if (legal.length === 1) return { direction: legal[0], rule: "only other way out" };

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
      return { direction: best, rule: "away from the nearest dangerous ghost" };
    }
  }

  const order: Direction[] = [
    ...DIRECTION_ORDER.filter((direction) => legal.includes(direction)),
    ...DIRECTION_ORDER.filter((direction) => direction === oppositeDirection(heading) && legalDirections.includes(direction)),
  ];
  const direction = order[0] ?? oppositeDirection(heading);
  return { direction, rule: order.length === 0 ? "dead end, turn around" : "direction order" };
}
