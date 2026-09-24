/**
 * Maze queries and breadth-first search.
 *
 * Every search runs over Pac-Man's graph: walls are walls and the ghost-house
 * gate is a wall too, so a ghost sitting inside the house is simply unreachable
 * and its distance reads as null ("not a threat yet").
 *
 * BFS is enough here: the maze is a few hundred tiles wide, and it gives exact
 * step distances, which is what the candidate facts are made of.
 */

import type { Direction, Maze, TilePosition } from "./types";
import { DIRECTION_ORDER, neighbor, oppositeDirection, tileKey } from "./types";

const houseKeyCache = new WeakMap<Maze, Set<string>>();

/** Keys of the ghost-house tiles (interior plus gate), cached per maze. */
export function houseKeys(maze: Maze): Set<string> {
  let keys = houseKeyCache.get(maze);
  if (!keys) {
    keys = new Set(maze.houseTiles.map((tile) => tileKey(tile)));
    houseKeyCache.set(maze, keys);
  }
  return keys;
}

export function isHouseTile(maze: Maze, tile: TilePosition): boolean {
  return houseKeys(maze).has(tileKey(tile));
}

/** Directions Pac-Man may leave `tile` by. */
export function getLegalDirections(maze: Maze, tile: TilePosition): Direction[] {
  return DIRECTION_ORDER.filter((direction) => {
    const next = neighbor(tile, direction);
    return maze.isPacmanWalkable(next.x, next.y);
  });
}

/**
 * The directions that are a real choice, i.e. legal and not simply back the way
 * we came. Empty at a dead end, where the only way out is the reversal.
 */
export function getMeaningfulDirections(maze: Maze, tile: TilePosition, heading: Direction): Direction[] {
  const reverse = oppositeDirection(heading);
  return getLegalDirections(maze, tile).filter((direction) => direction !== reverse);
}

export function isDecisionPoint(maze: Maze, tile: TilePosition, heading: Direction): boolean {
  return getMeaningfulDirections(maze, tile, heading).length >= 2;
}

/** Ghost choice set: never reverse unless the tile forces it. */
export function getGhostChoices(maze: Maze, tile: TilePosition, direction: Direction, allowHouse: boolean): Direction[] {
  const reverse = oppositeDirection(direction);
  const legal = DIRECTION_ORDER.filter((next) => {
    const target = neighbor(tile, next);
    if (!maze.isGhostWalkable(target.x, target.y)) return false;
    if (!allowHouse && isHouseTile(maze, target)) return false;
    return true;
  });
  const forward = legal.filter((next) => next !== reverse);
  return forward.length > 0 ? forward : legal;
}

/* ------------------------------------------------------------------ searches */

export interface DistanceField {
  readonly maze: Maze;
  /** Step distance per tile, indexed y * width + x. -1 = unreachable. */
  readonly distances: Int32Array;
  distanceAt(tile: TilePosition): number;
  isReachable(tile: TilePosition): boolean;
  /** Nearest reachable tile among `keys` (a Set of "x,y"), or null. */
  nearestOf(keys: Iterable<string>): number | null;
  countReachable(): number;
}

/**
 * Breadth-first search from `from` over Pac-Man's graph. `blocked` marks extra
 * tiles to treat as walls (used for the safe-area calculation).
 */
export function bfs(
  maze: Maze,
  from: TilePosition,
  blocked?: (tile: TilePosition) => boolean,
): DistanceField {
  const { width, height } = maze;
  const distances = new Int32Array(width * height).fill(-1);
  const start = from.y * width + from.x;

  const reachable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    if (!maze.isPacmanWalkable(x, y)) return false;
    if (blocked && blocked({ x, y })) return false;
    return true;
  };

  if (!reachable(from.x, from.y)) {
    return emptyField(maze, distances);
  }

  distances[start] = 0;
  let queue: number[] = [start];
  let count = 1;

  while (queue.length > 0) {
    const next: number[] = [];
    for (const index of queue) {
      const x = index % width;
      const y = (index - x) / width;
      const distance = distances[index] + 1;
      for (const direction of DIRECTION_ORDER) {
        const vector = directionVectorFor(direction);
        const nx = x + vector.x;
        const ny = y + vector.y;
        if (!reachable(nx, ny)) continue;
        const neighborIndex = ny * width + nx;
        if (distances[neighborIndex] !== -1) continue;
        distances[neighborIndex] = distance;
        count += 1;
        next.push(neighborIndex);
      }
    }
    queue = next;
  }

  const base = { maze, distances, count };
  return {
    ...base,
    distanceAt: (tile) =>
      tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height
        ? -1
        : distances[tile.y * width + tile.x],
    isReachable: (tile) =>
      tile.x >= 0 &&
      tile.y >= 0 &&
      tile.x < width &&
      tile.y < height &&
      distances[tile.y * width + tile.x] >= 0,
    nearestOf: (keys) => {
      let best: number | null = null;
      for (const key of keys) {
        const [x, y] = key.split(",");
        const value = distances[Number(y) * width + Number(x)];
        if (value < 0) continue;
        if (best === null || value < best) best = value;
      }
      return best;
    },
    countReachable: () => count,
  };
}

function emptyField(maze: Maze, distances: Int32Array): DistanceField {
  return {
    maze,
    distances,
    distanceAt: () => -1,
    isReachable: () => false,
    nearestOf: () => null,
    countReachable: () => 0,
  };
}

// Local copy so this module does not depend on the movement helpers.
function directionVectorFor(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case "UP":
      return { x: 0, y: -1 };
    case "DOWN":
      return { x: 0, y: 1 };
    case "LEFT":
      return { x: -1, y: 0 };
    case "RIGHT":
      return { x: 1, y: 0 };
  }
}

export function shortestPathDistance(maze: Maze, from: TilePosition, target: TilePosition): number | null {
  const field = bfs(maze, from);
  const distance = field.distanceAt(target);
  return distance >= 0 ? distance : null;
}

/**
 * Walks forward from `from` through forced corners until the next tile where
 * Pac-Man really has to choose (two or more meaningful directions). Returns the
 * junction, how many tile steps away it is, and the heading on arrival.
 */
export function findNextDecisionPoint(
  maze: Maze,
  from: TilePosition,
  heading: Direction,
  limit = 200,
): { junction: TilePosition; steps: number; heading: Direction } | null {
  let tile = from;
  let direction = heading;

  for (let steps = 0; steps < limit; steps += 1) {
    const choices = getMeaningfulDirections(maze, tile, direction);
    if (choices.length >= 2) return { junction: tile, steps, heading: direction };

    direction = choices.length === 1 ? choices[0] : oppositeDirection(direction);
    const next = neighbor(tile, direction);
    if (!maze.isPacmanWalkable(next.x, next.y)) return null;
    tile = next;
  }

  return null;
}
