/**
 * Candidate analysis: the facts Pac-Man's next move is judged on.
 *
 * This module answers questions ("how far is the nearest pellet that way?"), it
 * never answers "which way is better". Every number here is a fact about the
 * maze, and it is deliberately the only thing the agent gets to see beyond the
 * small game snapshot.
 */

import type { Direction, PacmanState, TilePosition } from "./types";
import { DIRECTION_ORDER, neighbor, oppositeDirection, tileKey } from "./types";
import { bfs, getMeaningfulDirections } from "./pathfinding";

export interface CandidateAnalysis {
  direction: Direction;
  /** The first tile Pac-Man would enter if he took this direction. */
  firstTile: TilePosition;
  nearestPelletDistance: number | null;
  pelletsWithin6Tiles: number;
  nearestPowerPelletDistance: number | null;
  nearestDangerousGhostDistance: number | null;
  nearestFrightenedGhostDistance: number | null;
  /** Tiles reachable from the first tile at all. */
  reachableArea: number;
  /** Tiles reachable from the first tile without passing within DANGER_RADIUS of a dangerous ghost. */
  reachableSafeArea: number;
  /** True when this direction leads into a dead-end pocket. */
  deadEnd: boolean;
  /** How many tiles in the pocket ends; 1 means the first tile is itself a dead end. */
  deadEndDepth: number | null;
  continuesForward: boolean;
  reversesDirection: boolean;
}

/** Tiles this close (BFS steps) to a dangerous ghost count as unsafe. */
export const DANGER_RADIUS = 2;

/** How far ahead the dead-end probe looks before calling a corridor open. */
const DEAD_END_PROBE_TILES = 24;

export function isDangerousGhost(mode: string): boolean {
  return mode === "CHASE" || mode === "SCATTER";
}

export function analyzeCandidates(
  state: PacmanState,
  junction: TilePosition,
  heading: Direction,
  directions: readonly Direction[],
): Record<Direction, CandidateAnalysis> {
  const { maze } = state;
  const dangerous = state.ghosts.filter((ghost) => isDangerousGhost(ghost.mode));
  const frightened = state.ghosts.filter((ghost) => ghost.mode === "FRIGHTENED");

  // One search per dangerous ghost gives the "unsafe" tiles for every candidate.
  const dangerKeys = new Set<string>();
  for (const ghost of dangerous) {
    const field = bfs(maze, ghost.tile);
    for (let y = 0; y < maze.height; y += 1) {
      for (let x = 0; x < maze.width; x += 1) {
        const distance = field.distanceAt({ x, y });
        if (distance >= 0 && distance <= DANGER_RADIUS) dangerKeys.add(tileKey({ x, y }));
      }
    }
  }

  const result = {} as Record<Direction, CandidateAnalysis>;

  for (const direction of directions) {
    const firstTile = neighbor(junction, direction);
    const field = bfs(maze, firstTile);
    const safeField = bfs(maze, firstTile, (tile) => dangerKeys.has(tileKey(tile)));

    const nearestOf = (keys: Iterable<string>): number | null => field.nearestOf(keys);

    let pelletsWithin6Tiles = 0;
    for (const key of state.pellets) {
      const [x, y] = key.split(",");
      const distance = field.distanceAt({ x: Number(x), y: Number(y) });
      if (distance >= 0 && distance <= 6) pelletsWithin6Tiles += 1;
    }

    const deadEndInfo = probeDeadEnd(maze, firstTile, direction);

    result[direction] = {
      direction,
      firstTile,
      nearestPelletDistance: nearestOf(state.pellets),
      pelletsWithin6Tiles,
      nearestPowerPelletDistance: nearestOf(state.powerPellets),
      nearestDangerousGhostDistance: nearestGhostDistance(field, dangerous),
      nearestFrightenedGhostDistance: nearestGhostDistance(field, frightened),
      reachableArea: field.countReachable(),
      reachableSafeArea: safeField.countReachable(),
      deadEnd: deadEndInfo.deadEnd,
      deadEndDepth: deadEndInfo.depth,
      continuesForward: direction === heading,
      reversesDirection: direction === oppositeDirection(heading),
    };
  }

  return result;
}

/** Unreachable ghosts (still in the house) report null: Pac-Man's map does not include them. */
function nearestGhostDistance(
  field: ReturnType<typeof bfs>,
  ghosts: readonly { tile: TilePosition }[],
): number | null {
  let best: number | null = null;
  for (const ghost of ghosts) {
    const distance = field.distanceAt(ghost.tile);
    if (distance < 0) continue;
    if (best === null || distance < best) best = distance;
  }
  return best;
}

/**
 * Walks forward from the first tile, following every forced move, until it
 * either finds a choice (not a dead end) or runs out of corridor.
 */
function probeDeadEnd(
  maze: PacmanState["maze"],
  firstTile: TilePosition,
  direction: Direction,
): { deadEnd: boolean; depth: number | null } {
  let tile = firstTile;
  let heading = direction;

  for (let step = 1; step <= DEAD_END_PROBE_TILES; step += 1) {
    const choices = getMeaningfulDirections(maze, tile, heading);
    if (choices.length >= 2) return { deadEnd: false, depth: null };
    if (choices.length === 0) return { deadEnd: true, depth: step };
    heading = choices[0];
    const next = neighbor(tile, heading);
    if (!maze.isPacmanWalkable(next.x, next.y)) return { deadEnd: true, depth: step };
    tile = next;
  }

  return { deadEnd: false, depth: null };
}

/** The directions that are a real choice at a junction, in display order. */
export function junctionChoices(state: PacmanState, junction: TilePosition, heading: Direction): Direction[] {
  return DIRECTION_ORDER.filter((direction) =>
    getMeaningfulDirections(state.maze, junction, heading).includes(direction),
  );
}
