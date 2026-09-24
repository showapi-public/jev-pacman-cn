/**
 * Ghost behaviour: where each ghost wants to be, and which way it turns when it
 * reaches a tile centre.
 *
 * Ghosts are never driven by Jev — this is plain deterministic game logic, with
 * one seeded random draw for frightened ghosts so a seed replays a whole game.
 */

import type { Direction, PacmanState, GhostName, GhostState, Maze, TilePosition } from "./types";
import { nextRandom, neighbor, squaredTileDistance, tileCenter } from "./types";
import { getGhostChoices, isHouseTile } from "./pathfinding";
import { occupiedTile } from "./collision";

/** ORDER matters: Blinky is the ghost Inky uses as a pivot, and the maze's four spawns come in this order. */
export const GHOST_ORDER: readonly GhostName[] = ["Blinky", "Pinky", "Inky", "Clyde"];

/** Distance at which Clyde loses his nerve and runs for his corner (tiles). */
const CLYDE_RANGE = 8;

/** Where each ghost runs in SCATTER mode: Blinky top-right, Pinky top-left, Inky bottom-right, Clyde bottom-left. */
export function cornerTargets(maze: Maze): TilePosition[] {
  const walkable: TilePosition[] = [];
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if (maze.isPacmanWalkable(x, y)) walkable.push({ x, y });
    }
  }

  const pick = (score: (tile: TilePosition) => number): TilePosition => {
    let best = walkable[0];
    let bestScore = Infinity;
    for (const tile of walkable) {
      const value = score(tile);
      if (value < bestScore) {
        bestScore = value;
        best = tile;
      }
    }
    return best;
  };

  const corners = [
    pick((t) => maze.width - 1 - t.x + t.y), // top-right
    pick((t) => t.x + t.y), // top-left
    pick((t) => maze.width - 1 - t.x + (maze.height - 1 - t.y)), // bottom-right
    pick((t) => t.x + (maze.height - 1 - t.y)), // bottom-left
  ];
  return corners;
}

/** The tile just outside the ghost-house gate: where a ghost walks out of the house. */
export function houseExitTile(maze: Maze): TilePosition | null {
  for (const gate of maze.houseTiles) {
    if (!maze.isGate(gate.x, gate.y)) continue;
    const above = { x: gate.x, y: gate.y - 1 };
    if (maze.isPacmanWalkable(above.x, above.y)) return above;
    for (const candidate of [
      { x: gate.x, y: gate.y + 1 },
      { x: gate.x - 1, y: gate.y },
      { x: gate.x + 1, y: gate.y },
    ]) {
      if (maze.isPacmanWalkable(candidate.x, candidate.y)) return candidate;
    }
  }
  return null;
}

/** The tile a ghost is currently aiming at. */
export function ghostTarget(ghost: GhostState, state: PacmanState): TilePosition {
  const { maze } = state;

  if (ghost.mode === "HOUSE" || ghost.mode === "EATEN") {
    return houseExitTile(maze) ?? ghost.tile;
  }

  if (ghost.mode === "SCATTER") return ghost.scatterTarget;

  const pacmanTile = occupiedTile(state.pacman);
  const blinky = state.ghosts[0];

  switch (ghost.name) {
    case "Blinky":
      return pacmanTile;
    case "Pinky": {
      const ahead = 4;
      return {
        x: pacmanTile.x + directionStep(state.pacman.direction).x * ahead,
        y: pacmanTile.y + directionStep(state.pacman.direction).y * ahead,
      };
    }
    case "Inky": {
      // Two tiles ahead of Pac-Man, doubled away from Blinky: the shape the
      // arcade game uses, which is what makes Inky feel the most dangerous.
      const pivot = {
        x: pacmanTile.x + directionStep(state.pacman.direction).x * 2,
        y: pacmanTile.y + directionStep(state.pacman.direction).y * 2,
      };
      const blinkyTile = blinky ? occupiedTile(blinky) : pacmanTile;
      return { x: pivot.x * 2 - blinkyTile.x, y: pivot.y * 2 - blinkyTile.y };
    }
    case "Clyde": {
      const away = squaredTileDistance(ghost.tile, pacmanTile) > CLYDE_RANGE * CLYDE_RANGE;
      return away ? pacmanTile : ghost.scatterTarget;
    }
  }
}

/**
 * Picks the direction a ghost leaves a tile centre with. Chase modes minimise
 * the straight-line distance to the target (the arcade rule); frightened ghosts
 * draw from the seeded RNG instead.
 */
export function chooseGhostDirection(ghost: GhostState, state: PacmanState): void {
  const { maze } = state;
  const allowHouse = ghost.mode === "HOUSE" || ghost.mode === "EATEN";
  const choices = getGhostChoices(maze, ghost.tile, ghost.direction, allowHouse);
  if (choices.length === 0) return; // boxed in: keep facing the wall

  if (ghost.mode === "FRIGHTENED") {
    const draw = nextRandom(state.rngState);
    state.rngState = draw.state;
    const index = Math.min(choices.length - 1, Math.floor(draw.value * choices.length));
    ghost.direction = choices[index];
    return;
  }

  const target = ghostTarget(ghost, state);
  let best: Direction = choices[0];
  let bestDistance = Infinity;
  for (const direction of choices) {
    const candidate = neighbor(ghost.tile, direction);
    const distance = squaredTileDistance(candidate, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = direction;
    }
  }
  ghost.direction = best;
}

/** True when `tile` is part of the house and the ghost is not allowed back in. */
export function blockedByHouse(maze: Maze, tile: TilePosition, mode: GhostState["mode"]): boolean {
  if (mode === "HOUSE" || mode === "EATEN") return false;
  return isHouseTile(maze, tile);
}

/** Parks a ghost in the house (spawn tile) after it has been eaten. */
export function parkInHouse(ghost: GhostState, spawn: TilePosition): void {
  ghost.tile = { ...spawn };
  ghost.position = tileCenter(spawn);
  ghost.direction = "UP";
}

function directionStep(direction: Direction): { x: number; y: number } {
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
