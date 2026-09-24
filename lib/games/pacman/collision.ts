/**
 * Collisions: pellets eaten, ghosts eaten, Pac-Man caught.
 *
 * These functions mutate the game state and return what happened, so the engine
 * can decide what to do with the events (score chimes, respawns, telemetry).
 */

import type { PacmanEvent, PacmanState, GhostState, Position, TilePosition } from "./types";
import {
  GHOST_EATEN_SCORES,
  PELLET_SCORE,
  POWER_PELLET_SCORE,
  FRIGHTENED_DURATION_MS,
  tileKey,
  tileOf,
} from "./types";

/** Two actors are touching when they share a tile or their centres are this close (tiles). */
const TOUCH_DISTANCE = 0.7;

export function positionsTouch(a: Position, b: Position): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < TOUCH_DISTANCE;
}

/** Pac-Man's tile right now, by position rather than by anchor tile. */
export function occupiedTile(actor: { position: Position }): TilePosition {
  return tileOf(actor.position);
}

export function actorsTouch(
  a: { position: Position },
  b: { position: Position },
): boolean {
  const tileA = occupiedTile(a);
  const tileB = occupiedTile(b);
  if (tileA.x === tileB.x && tileA.y === tileB.y) return true;
  return positionsTouch(a.position, b.position);
}

/** Eats any pellet or power pellet under Pac-Man and scores it. */
export function collectPellets(state: PacmanState): PacmanEvent[] {
  const events: PacmanEvent[] = [];
  const tile = occupiedTile(state.pacman);
  const key = tileKey(tile);

  if (state.pellets.delete(key)) {
    state.score += PELLET_SCORE;
    state.pelletsEaten += 1;
    events.push({ type: "PELLET_EATEN", tile, score: PELLET_SCORE });
  }

  if (state.powerPellets.delete(key)) {
    state.score += POWER_PELLET_SCORE;
    events.push({ type: "POWER_PELLET_EATEN", tile, score: POWER_PELLET_SCORE });
    startFrightened(state, events);
  }

  return events;
}

export function startFrightened(state: PacmanState, events: PacmanEvent[] = []): PacmanEvent[] {
  state.fright.active = true;
  state.fright.remainingMs = FRIGHTENED_DURATION_MS;
  state.fright.eaten = 0;

  for (const ghost of state.ghosts) {
    if (ghost.mode === "HOUSE" || ghost.mode === "EATEN") continue;
    ghost.baseMode = ghost.mode === "SCATTER" ? "SCATTER" : "CHASE";
    ghost.mode = "FRIGHTENED";
  }

  events.push({ type: "FRIGHTENED_STARTED", durationMs: FRIGHTENED_DURATION_MS });
  return events;
}

export function endFrightened(state: PacmanState, events: PacmanEvent[] = []): PacmanEvent[] {
  state.fright.active = false;
  state.fright.remainingMs = 0;
  for (const ghost of state.ghosts) {
    if (ghost.mode === "FRIGHTENED") ghost.mode = ghost.baseMode;
  }
  events.push({ type: "FRIGHTENED_ENDED" });
  return events;
}

export type GhostContact = { ghost: GhostState; kind: "CAUGHT" | "EATEN" };

/** Who is touching Pac-Man, and what that means. */
export function ghostContacts(state: PacmanState): GhostContact[] {
  const contacts: GhostContact[] = [];
  for (const ghost of state.ghosts) {
    // Ghosts in the house are behind a wall Pac-Man cannot cross, and eaten ones
    // are parked there: neither can touch him.
    if (ghost.mode === "EATEN" || ghost.mode === "HOUSE") continue;
    if (!actorsTouch(state.pacman, ghost)) continue;
    contacts.push({ ghost, kind: ghost.mode === "FRIGHTENED" ? "EATEN" : "CAUGHT" });
  }
  return contacts;
}

/** Scores an eaten ghost and sends it back to the house. */
export function eatGhost(state: PacmanState, ghost: GhostState): PacmanEvent[] {
  const tableIndex = Math.min(state.fright.eaten, GHOST_EATEN_SCORES.length - 1);
  const score = GHOST_EATEN_SCORES[tableIndex];
  state.fright.eaten += 1;
  state.score += score;
  state.ghostsEaten += 1;
  return [{ type: "GHOST_EATEN", ghost: ghost.name, score }];
}
