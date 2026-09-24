/**
 * The Pac-Man engine.
 *
 * Fixed-timestep, deterministic, and independent of rendering: `stepGame` takes
 * one FIXED_DT_MS slice of simulated time and returns what happened. The same
 * seed plus the same sequence of directions replays the same game.
 *
 * Code owns every fact in here. Nothing in this file asks what move would be
 * good — that is the agent's job.
 */

import type {
  Direction,
  PacmanEvent,
  PacmanState,
  GhostState,
  Maze,
  TilePosition,
} from "./types";
import {
  CHASE_DURATION_MS,
  DEATH_PAUSE_MS,
  EATEN_RETURN_MS,
  FIXED_DT_MS,
  FRIGHTENED_GHOST_SPEED_TILES_PER_SEC,
  GHOST_HOUSE_DELAYS_MS,
  GHOST_SPEED_TILES_PER_SEC,
  PACMAN_SPEED_TILES_PER_SEC,
  SCATTER_DURATION_MS,
  STARTING_LIVES,
  tileCenter,
  tileKey,
  seedToRngState,
} from "./types";
import { parseMaze } from "./maze";
import { advanceMover, updatePacman } from "./movement";
import { blockedByHouse, cornerTargets, chooseGhostDirection, GHOST_ORDER, parkInHouse } from "./ghosts";
import { isHouseTile } from "./pathfinding";
import { collectPellets, endFrightened, eatGhost, ghostContacts } from "./collision";

export type CreateGameOptions = {
  seed?: number;
  maze?: Maze;
  level?: number;
  score?: number;
  lives?: number;
  epoch?: number;
};

let mazeCache: Maze | null = null;

/** The default maze, parsed once (validation runs the first time). */
export function defaultMaze(): Maze {
  mazeCache ??= parseMaze();
  return mazeCache;
}

export function createGame(options: CreateGameOptions = {}): PacmanState {
  const maze = options.maze ?? defaultMaze();
  const seed = options.seed ?? 42;
  const corners = cornerTargets(maze);
  const level = options.level ?? 1;

  const state: PacmanState = {
    maze,
    status: "READY",
    tick: 0,
    playTimeMs: 0,
    epoch: options.epoch ?? 1,
    seed,
    rngState: seedToRngState(seed + level * 7919),
    score: options.score ?? 0,
    lives: options.lives ?? STARTING_LIVES,
    level,
    pelletsEaten: 0,
    ghostsEaten: 0,
    pellets: new Set(maze.initialPellets.map((tile) => tileKey(tile))),
    powerPellets: new Set(maze.initialPowerPellets.map((tile) => tileKey(tile))),
    pacman: {
      tile: { ...maze.pacmanSpawn },
      position: tileCenter(maze.pacmanSpawn),
      direction: "LEFT",
      requestedDirection: null,
    },
    ghosts: maze.ghostSpawns.map((spawn, index) => ({
      name: GHOST_ORDER[index] ?? "Blinky",
      tile: { ...spawn },
      position: tileCenter(spawn),
      direction: "UP",
      mode: "HOUSE" as const,
      baseMode: "SCATTER" as const,
      houseDelayMs: GHOST_HOUSE_DELAYS_MS[index] ?? 0,
      returnDelayMs: null,
      scatterTarget: { ...corners[index] },
    })),
    fright: { active: false, remainingMs: 0, eaten: 0 },
    modeTimer: { phase: "SCATTER", remainingMs: SCATTER_DURATION_MS },
    deathPauseMs: null,
  };

  return state;
}

export function startGame(state: PacmanState): void {
  if (state.status === "GAME_OVER" || state.status === "CLEARED") return;
  state.status = "PLAYING";
}

export function pauseGame(state: PacmanState): void {
  if (state.status === "PLAYING") state.status = "PAUSED";
}

export function resumeGame(state: PacmanState): void {
  if (state.status === "PAUSED") state.status = "PLAYING";
}

/** Puts Pac-Man and the ghosts back on their spawns, keeping score, pellets and level. */
export function respawnActors(state: PacmanState): PacmanEvent[] {
  const events: PacmanEvent[] = [];
  state.pacman.tile = { ...state.maze.pacmanSpawn };
  state.pacman.position = tileCenter(state.maze.pacmanSpawn);
  state.pacman.direction = "LEFT";
  state.pacman.requestedDirection = null;

  state.ghosts.forEach((ghost, index) => {
    const spawn = state.maze.ghostSpawns[index] ?? state.maze.ghostSpawns[0] ?? ghost.tile;
    parkInHouse(ghost, spawn);
    ghost.mode = "HOUSE";
    ghost.baseMode = "SCATTER";
    ghost.houseDelayMs = GHOST_HOUSE_DELAYS_MS[index] ?? 0;
    ghost.returnDelayMs = null;
  });

  state.fright.active = false;
  state.fright.remainingMs = 0;
  state.fright.eaten = 0;
  state.modeTimer.phase = "SCATTER";
  state.modeTimer.remainingMs = SCATTER_DURATION_MS;
  state.deathPauseMs = null;
  state.epoch += 1;
  return events;
}

/** The maze's pellets come back; the level number goes up. */
export function startNextLevel(state: PacmanState): PacmanEvent[] {
  state.level += 1;
  state.pellets = new Set(state.maze.initialPellets.map((tile) => tileKey(tile)));
  state.powerPellets = new Set(state.maze.initialPowerPellets.map((tile) => tileKey(tile)));
  state.rngState = seedToRngState(state.seed + state.level * 7919);
  const events = respawnActors(state);
  state.status = "PLAYING";
  return events;
}

/** The one and only call site that changes Pac-Man's requested direction. */
export function requestDirection(state: PacmanState, direction: Direction | null): void {
  state.pacman.requestedDirection = direction;
}

/**
 * Advances the world by one fixed step. Everything the game decides on its own
 * happens here: pellets, ghost AI, collisions, lives, levels.
 */
export function stepGame(state: PacmanState, dtMs: number = FIXED_DT_MS): PacmanEvent[] {
  const events: PacmanEvent[] = [];
  if (state.status !== "PLAYING") return events;

  state.tick += 1;

  if (state.deathPauseMs !== null) {
    state.deathPauseMs -= dtMs;
    if (state.deathPauseMs > 0) return events;
    state.deathPauseMs = null;
    if (state.lives <= 0) {
      state.status = "GAME_OVER";
      events.push({ type: "GAME_OVER" });
      return events;
    }
    respawnActors(state);
    return events;
  }

  state.playTimeMs += dtMs;
  const dt = dtMs / 1000;

  advanceTimers(state, dtMs, events);

  updatePacman(state.pacman, PACMAN_SPEED_TILES_PER_SEC * dt, state.maze);
  events.push(...collectPellets(state));

  for (const ghost of state.ghosts) {
    events.push(...updateGhost(ghost, state, dtMs, dt));
  }

  events.push(...resolveContacts(state));

  if (state.pellets.size === 0 && state.powerPellets.size === 0) {
    events.push({ type: "LEVEL_CLEARED", level: state.level });
    events.push(...startNextLevel(state));
  }

  return events;
}

function advanceTimers(state: PacmanState, dtMs: number, events: PacmanEvent[]): void {
  if (state.fright.active) {
    state.fright.remainingMs -= dtMs;
    if (state.fright.remainingMs <= 0) events.push(...endFrightened(state));
  }

  state.modeTimer.remainingMs -= dtMs;
  if (state.modeTimer.remainingMs <= 0) {
    state.modeTimer.phase = state.modeTimer.phase === "SCATTER" ? "CHASE" : "SCATTER";
    state.modeTimer.remainingMs =
      state.modeTimer.phase === "SCATTER" ? SCATTER_DURATION_MS : CHASE_DURATION_MS;
    for (const ghost of state.ghosts) {
      if (ghost.mode === "CHASE" || ghost.mode === "SCATTER") ghost.mode = state.modeTimer.phase;
      else if (ghost.mode === "FRIGHTENED") ghost.baseMode = state.modeTimer.phase;
    }
  }
}

function updateGhost(ghost: GhostState, state: PacmanState, dtMs: number, dt: number): PacmanEvent[] {
  const events: PacmanEvent[] = [];
  const { maze } = state;

  if (ghost.mode === "EATEN") {
    ghost.returnDelayMs = (ghost.returnDelayMs ?? 0) - dtMs;
    ghost.position = tileCenter(ghost.tile);
    if (ghost.returnDelayMs <= 0) {
      ghost.returnDelayMs = null;
      ghost.mode = "HOUSE";
      ghost.houseDelayMs = 0;
    }
    return events;
  }

  if (ghost.mode === "HOUSE" && ghost.houseDelayMs > 0) {
    ghost.houseDelayMs -= dtMs;
    ghost.position = tileCenter(ghost.tile);
    return events;
  }

  const speed =
    ghost.mode === "FRIGHTENED"
      ? FRIGHTENED_GHOST_SPEED_TILES_PER_SEC
      : GHOST_SPEED_TILES_PER_SEC;

  const allowHouse = ghost.mode === "HOUSE";
  advanceMover(
    ghost,
    speed * dt,
    (tile) => maze.isGhostWalkable(tile.x, tile.y) && !blockedByHouse(maze, tile, ghost.mode),
    (mover) => chooseGhostDirection(mover as GhostState, state),
  );

  if (allowHouse && !isHouseTile(maze, ghost.tile)) {
    ghost.mode = ghost.baseMode;
    events.push({ type: "GHOST_RELEASED", ghost: ghost.name });
  }

  return events;
}

function resolveContacts(state: PacmanState): PacmanEvent[] {
  const events: PacmanEvent[] = [];
  const contacts = ghostContacts(state);

  for (const contact of contacts) {
    if (contact.kind === "EATEN") {
      events.push(...eatGhost(state, contact.ghost));
      const index = state.ghosts.indexOf(contact.ghost);
      const spawn = state.maze.ghostSpawns[index] ?? state.maze.ghostSpawns[0] ?? contact.ghost.tile;
      contact.ghost.mode = "EATEN";
      contact.ghost.returnDelayMs = EATEN_RETURN_MS;
      parkInHouse(contact.ghost, spawn);
      continue;
    }

    // Caught: lose a life, freeze, then respawn (or end the game).
    state.lives -= 1;
    state.epoch += 1;
    state.deathPauseMs = DEATH_PAUSE_MS;
    state.pacman.requestedDirection = null;
    events.push({ type: "PACMAN_DIED", livesLeft: state.lives });
    break;
  }

  return events;
}
