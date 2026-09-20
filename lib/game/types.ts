/**
 * Core types for the Pac-Man engine.
 *
 * The engine is pure data + pure functions: no React, no canvas, no network, no
 * Math.random. The Jev observation builder and the canvas renderer both read
 * these structures and nothing else.
 */

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

/** Fixed ordering, used for every deterministic tie-break (spec: UP, LEFT, DOWN, RIGHT). */
export const DIRECTION_ORDER: readonly Direction[] = ["UP", "LEFT", "DOWN", "RIGHT"];

export interface TilePosition {
  x: number;
  y: number;
}

/**
 * Continuous position in tile units. Tile (x, y) covers [x, x+1) x [y, y+1),
 * so the centre of tile (x, y) is (x + 0.5, y + 0.5).
 */
export interface Position {
  x: number;
  y: number;
}

export type TileKind = "wall" | "floor" | "pellet" | "powerPellet" | "gate";

/**
 * A parsed, validated maze.
 *
 * `gate` is the ghost-house door: walkable for ghosts, a wall for Pac-Man and
 * for every pathfinding query Pac-Man's side asks for.
 */
export interface Maze {
  readonly rows: readonly string[];
  readonly width: number;
  readonly height: number;
  /** tiles[y][x] */
  readonly tiles: readonly (readonly TileKind[])[];
  /** Out of bounds reads as wall. */
  tileAt(x: number, y: number): TileKind;
  /** Wall or out of bounds. */
  isWall(x: number, y: number): boolean;
  isGate(x: number, y: number): boolean;
  /** Floor, pellet or power pellet: a tile Pac-Man may occupy. */
  isPacmanWalkable(x: number, y: number): boolean;
  /** Floor, pellet, power pellet or gate: a tile a ghost may occupy. */
  isGhostWalkable(x: number, y: number): boolean;
  readonly pacmanSpawn: TilePosition;
  /** In clock order: Blinky, Pinky, Inky, Clyde. */
  readonly ghostSpawns: readonly TilePosition[];
  /** The ghost house: interior tiles plus the gate, unreachable for Pac-Man. */
  readonly houseTiles: readonly TilePosition[];
  readonly initialPellets: readonly TilePosition[];
  readonly initialPowerPellets: readonly TilePosition[];
}

export interface PacmanState {
  tile: TilePosition;
  position: Position;
  direction: Direction;
  /** Set by the controller (Jev, fallback or the keyboard); applied at the next tile centre. */
  requestedDirection: Direction | null;
}

export type GhostName = "Blinky" | "Pinky" | "Inky" | "Clyde";

/**
 * HOUSE: waiting in (or walking out of) the ghost house — never dangerous, and
 * ghosts in it are absent from Pac-Man's graph, so their distance reads as null.
 * EATEN: eaten during a frightened window; not dangerous either.
 */
export type GhostMode = "CHASE" | "SCATTER" | "FRIGHTENED" | "HOUSE" | "EATEN";

export interface GhostState {
  name: GhostName;
  tile: TilePosition;
  position: Position;
  direction: Direction;
  mode: GhostMode;
  /** Mode a frightened ghost returns to when the frightened window ends. */
  baseMode: "CHASE" | "SCATTER";
  /** ms left before a HOUSE ghost starts walking out (0 = leaving now). */
  houseDelayMs: number;
  /** ms left before an EATEN ghost rejoins play; null when it is not in that state. */
  returnDelayMs: number | null;
  /** The corner this ghost heads for in SCATTER mode. */
  scatterTarget: TilePosition;
}

export type GameStatus = "READY" | "PLAYING" | "PAUSED" | "GAME_OVER" | "CLEARED";

export interface FrightState {
  active: boolean;
  remainingMs: number;
  /** Ghosts eaten during the current frightened window, for the doubling score table. */
  eaten: number;
}

export interface ModeTimer {
  phase: "SCATTER" | "CHASE";
  remainingMs: number;
}

export interface GameState {
  maze: Maze;
  status: GameStatus;
  /** Fixed-timestep ticks since this game started. */
  tick: number;
  /** Simulated play time in ms (ready screen, pause and death pauses excluded). */
  playTimeMs: number;
  /** Bumped whenever the world is replaced (start, restart, death, level change). */
  epoch: number;
  seed: number;
  /** Current state of the seeded RNG (mulberry32). */
  rngState: number;
  score: number;
  lives: number;
  level: number;
  pelletsEaten: number;
  ghostsEaten: number;
  /** Remaining regular pellets, keyed `"x,y"`. */
  pellets: Set<string>;
  /** Remaining power pellets, keyed `"x,y"`. */
  powerPellets: Set<string>;
  pacman: PacmanState;
  ghosts: GhostState[];
  fright: FrightState;
  modeTimer: ModeTimer;
  /** ms left of the pause after Pac-Man dies; null while playing. */
  deathPauseMs: number | null;
}

export type GameEvent =
  | { type: "PELLET_EATEN"; tile: TilePosition; score: number }
  | { type: "POWER_PELLET_EATEN"; tile: TilePosition; score: number }
  | { type: "GHOST_EATEN"; ghost: GhostName; score: number }
  | { type: "PACMAN_DIED"; livesLeft: number }
  | { type: "LEVEL_CLEARED"; level: number }
  | { type: "FRIGHTENED_STARTED"; durationMs: number }
  | { type: "FRIGHTENED_ENDED" }
  | { type: "GHOST_RELEASED"; ghost: GhostName }
  | { type: "GAME_OVER" };

/* ------------------------------------------------------------------ timing */

export const FIXED_DT_MS = 1000 / 60;

export const PACMAN_SPEED_TILES_PER_SEC = 6;
export const GHOST_SPEED_TILES_PER_SEC = 5;
export const FRIGHTENED_GHOST_SPEED_TILES_PER_SEC = 3.2;
export const EATEN_GHOST_SPEED_TILES_PER_SEC = 12;

export const FRIGHTENED_DURATION_MS = 7000;
export const FRIGHTENED_FLASH_MS = 2000;
export const SCATTER_DURATION_MS = 7000;
export const CHASE_DURATION_MS = 20000;

export const DEATH_PAUSE_MS = 1200;
export const GHOST_HOUSE_DELAYS_MS = [0, 1200, 2600, 4000] as const;
export const EATEN_RETURN_MS = 2500;

export const GHOST_EATEN_SCORES = [200, 400, 800, 1600] as const;
export const PELLET_SCORE = 10;
export const POWER_PELLET_SCORE = 50;
export const STARTING_LIVES = 3;

/** How many tiles before a junction the controller asks Jev for a decision. */
export const DECISION_PREFETCH_TILES = 3;

/** Minimum spacing between two Jev requests. */
export const MIN_JEV_INTERVAL_MS = 100;

/** Client-side patience for one decision. Slower answers arrive too late to use. */
export const DECISION_TIMEOUT_MS = 1500;

/* --------------------------------------------------------------- direction */

export function directionVector(direction: Direction): Position {
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

export function oppositeDirection(direction: Direction): Direction {
  switch (direction) {
    case "UP":
      return "DOWN";
    case "DOWN":
      return "UP";
    case "LEFT":
      return "RIGHT";
    case "RIGHT":
      return "LEFT";
  }
}

export function turnLeft(direction: Direction): Direction {
  switch (direction) {
    case "UP":
      return "LEFT";
    case "LEFT":
      return "DOWN";
    case "DOWN":
      return "RIGHT";
    case "RIGHT":
      return "UP";
  }
}

export function turnRight(direction: Direction): Direction {
  switch (direction) {
    case "UP":
      return "RIGHT";
    case "RIGHT":
      return "DOWN";
    case "DOWN":
      return "LEFT";
    case "LEFT":
      return "UP";
  }
}

/* ------------------------------------------------------------------- tiles */

export function tileKey(tile: TilePosition): string;
export function tileKey(x: number, y: number): string;
export function tileKey(a: TilePosition | number, b?: number): string {
  return typeof a === "number" ? `${a},${b}` : `${a.x},${a.y}`;
}

export function parseTileKey(key: string): TilePosition {
  const [x, y] = key.split(",");
  return { x: Number(x), y: Number(y) };
}

/** The tile a continuous position sits in. */
export function tileOf(position: Position): TilePosition {
  return { x: Math.floor(position.x), y: Math.floor(position.y) };
}

export function tileCenter(tile: TilePosition): Position {
  return { x: tile.x + 0.5, y: tile.y + 0.5 };
}

export function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

export function tileDistance(a: TilePosition, b: TilePosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function squaredTileDistance(a: TilePosition, b: TilePosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function neighbor(tile: TilePosition, direction: Direction): TilePosition {
  const vector = directionVector(direction);
  return { x: tile.x + vector.x, y: tile.y + vector.y };
}

/** Distance from a continuous position to its tile centre, in tiles. */
export function distanceToCenter(position: Position): number {
  const tile = tileOf(position);
  const center = tileCenter(tile);
  return Math.hypot(position.x - center.x, position.y - center.y);
}

/* --------------------------------------------------------------- seeded rng */

/** mulberry32: a small deterministic PRNG so a seed replays a whole game. */
export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: t | 0 };
}

export function seedToRngState(seed: number): number {
  return seed | 0;
}
