/**
 * Continuous movement on the tile grid.
 *
 * An actor is always on, or travelling between, the centres of two adjacent
 * walkable tiles. `tile` is the anchor: the tile whose centre the actor is at or
 * travelling to. That makes "at the junction" and "travelling to the junction"
 * the same condition, which is what the controller uses to apply a decision.
 *
 * Nothing ever ends up inside a wall: when the next tile is a wall the actor
 * stops at the last centre before it and keeps facing the wall, exactly like
 * the arcade game.
 */

import type { Direction, Maze, PacmanState, Position, TilePosition } from "./types";
import {
  DIRECTION_ORDER,
  directionVector,
  neighbor,
  oppositeDirection,
  tileCenter,
  tileOf,
} from "./types";

const EPSILON = 1e-9;

export interface Mover {
  position: Position;
  /** The tile whose centre the actor is at or travelling to. */
  tile: TilePosition;
  direction: Direction;
}

/** The tile the actor is physically inside right now. */
export function actorTile(mover: Mover): TilePosition {
  return tileOf(mover.position);
}

/** Distance from the actor to the centre of its anchor tile, in tiles. */
export function distanceToTileCenter(mover: Mover): number {
  const center = tileCenter(mover.tile);
  return Math.abs(mover.position.x - center.x) + Math.abs(mover.position.y - center.y);
}

export function atTileCenter(mover: Mover, tolerance = 1e-6): boolean {
  return distanceToTileCenter(mover) <= tolerance;
}

/**
 * Moves `distance` tiles (fractions allowed) and calls `onCenter` every time the
 * actor lands exactly on a tile centre, so the caller can pick the next
 * direction there. Returns the distance that could not be spent because a wall
 * blocked the way.
 */
export function advanceMover(
  mover: Mover,
  distance: number,
  isWalkable: (tile: TilePosition) => boolean,
  onCenter?: (mover: Mover) => void,
): number {
  let remaining = distance;
  let guard = 0;

  while (remaining > EPSILON && guard++ < 64) {
    const toCenter = distanceToTileCenter(mover);
    if (toCenter > EPSILON) {
      const step = Math.min(remaining, toCenter);
      const vector = directionVector(mover.direction);
      mover.position = {
        x: mover.position.x + vector.x * step,
        y: mover.position.y + vector.y * step,
      };
      remaining -= step;
      if (distanceToTileCenter(mover) > EPSILON) return 0; // ran out of distance mid-tile
      mover.position = tileCenter(mover.tile); // snap: no floating point drift
    }

    onCenter?.(mover);

    const next = neighbor(mover.tile, mover.direction);
    if (!isWalkable(next)) return remaining; // blocked: stay on this centre
    mover.tile = next;
  }

  return remaining;
}

/** Reverses mid-tile: the actor turns around and heads back to the centre it came from. */
export function reverseMover(mover: Mover): void {
  mover.tile = neighbor(mover.tile, oppositeDirection(mover.direction));
  mover.direction = oppositeDirection(mover.direction);
}

/**
 * Picks the direction Pac-Man leaves a tile centre with.
 *
 * Priority: the requested direction (Jev, fallback or keyboard) if it is legal,
 * then straight on, then the only other way out (a corner the engine drives
 * itself), then a reversal if the tile is a dead end.
 */
export function choosePacmanDirection(pacman: PacmanState, maze: Maze): void {
  const canEnter = (direction: Direction) => {
    const next = neighbor(pacman.tile, direction);
    return maze.isPacmanWalkable(next.x, next.y);
  };

  const requested = pacman.requestedDirection;
  if (requested && canEnter(requested)) {
    pacman.direction = requested;
    pacman.requestedDirection = null;
    return;
  }
  if (canEnter(pacman.direction)) return;

  const forced = DIRECTION_ORDER.filter(
    (direction) => direction !== oppositeDirection(pacman.direction) && canEnter(direction),
  );
  pacman.direction = forced.length > 0 ? forced[0] : oppositeDirection(pacman.direction);
  pacman.requestedDirection = null;
}

/**
 * Advances Pac-Man. Reversals take effect immediately, everything else is
 * applied at the next tile centre, which is where the arcade game turns too.
 */
export function updatePacman(pacman: PacmanState, distance: number, maze: Maze): void {
  const requested = pacman.requestedDirection;
  if (requested && requested === oppositeDirection(pacman.direction) && !atTileCenter(pacman)) {
    reverseMover(pacman);
    pacman.requestedDirection = null;
  }

  advanceMover(
    pacman,
    distance,
    (tile) => maze.isPacmanWalkable(tile.x, tile.y),
    (mover) => choosePacmanDirection(mover as PacmanState, maze),
  );
}
