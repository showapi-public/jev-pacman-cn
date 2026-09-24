/**
 * Test helpers: a small corridor maze, actors you can place by hand, and
 * providers whose answers you control tick by tick.
 */

import type { DecisionProvider, DecideRequest, DecisionResult } from "@/lib/agent/types";
import { DecideError } from "@/lib/agent/types";
import { createGame, stepGame } from "@/lib/games/pacman/engine";
import { parseMaze } from "@/lib/games/pacman/maze";
import type {
  Direction,
  GameState,
  GhostMode,
  GhostName,
  GhostState,
  Maze,
  TilePosition,
} from "@/lib/games/pacman/types";
import { FIXED_DT_MS, tileCenter, tileKey } from "@/lib/games/pacman/types";

/**
 * A 13 x 9 corridor maze: two vertical corridors (x = 1 and x = 11) joined by
 * three horizontal rungs (rows 1, 4, 7), plus one-tile pockets at (6, 2) and
 * (6, 6).
 *
 * It has, on purpose:
 *   (1, 4)  a junction           — arriving from below, UP and RIGHT are both open
 *   (1, 1)  a forced corner      — arriving from the right, DOWN is the only way on
 *   (6, 1)  a junction           — arriving from the left, LEFT and DOWN are both open
 *   (6, 2)  a dead end           — one tile deep
 *   8, 1    a long straight run  — no decision at all until the far corner
 */
export const MINI_ROWS: readonly string[] = [
  "#############",
  "#P..........#",
  "#.####.####.#",
  "#.#########.#",
  "#...........#",
  "#.#########.#",
  "#.####.####.#",
  "#...........#",
  "#############",
];

export function miniMaze(): Maze {
  return parseMaze(MINI_ROWS, { requireGhostHouse: false });
}

export function tile(x: number, y: number): TilePosition {
  return { x, y };
}

export function miniGame(seed = 1): GameState {
  const state = createGame({ maze: miniMaze(), seed });
  state.ghosts = [];
  return state;
}

/** Drops Pac-Man on a tile centre, facing a direction. */
export function placePacman(state: GameState, x: number, y: number, direction: Direction = "LEFT"): void {
  state.pacman.tile = tile(x, y);
  state.pacman.position = tileCenter(tile(x, y));
  state.pacman.direction = direction;
  state.pacman.requestedDirection = null;
}

export function makeGhost(
  name: GhostName,
  x: number,
  y: number,
  mode: GhostMode = "CHASE",
  direction: Direction = "LEFT",
): GhostState {
  return {
    name,
    tile: tile(x, y),
    position: tileCenter(tile(x, y)),
    direction,
    mode,
    baseMode: "CHASE",
    houseDelayMs: 0,
    returnDelayMs: null,
    scatterTarget: tile(1, 1),
  };
}

export function putGhosts(state: GameState, ghosts: GhostState[]): void {
  state.ghosts = ghosts;
}

/** Removes every pellet except the ones given: keeps expectations readable. */
export function keepPellets(state: GameState, keys: [number, number][]): void {
  state.pellets = new Set(keys.map(([x, y]) => tileKey(tile(x, y))));
  state.powerPellets = new Set();
}

export function stepTicks(state: GameState, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) {
    stepGame(state, FIXED_DT_MS);
  }
}

/** Runs queued promise callbacks without waiting on wall-clock time. */
export async function flush(rounds = 4): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

/** Provider that answers on demand: the test decides what and when. */
export class ManualProvider implements DecisionProvider {
  readonly name = "JEV" as const;
  calls: DecideRequest[] = [];
  private resolvers: ((result: DecisionResult) => void)[] = [];
  private rejectors: ((error: unknown) => void)[] = [];

  async decide(request: DecideRequest): Promise<DecisionResult> {
    this.calls.push(request);
    return new Promise<DecisionResult>((resolve, reject) => {
      this.resolvers.push((result) => resolve({ ...result, decisionId: request.decisionId }));
      this.rejectors.push(reject);
    });
  }

  get pending(): number {
    return this.resolvers.length;
  }

  respond(direction: Direction, extra: Partial<DecisionResult> = {}): void {
    const resolve = this.resolvers.shift();
    if (!resolve) throw new Error("no request is waiting for an answer");
    this.rejectors.shift();
    resolve({
      decisionId: "",
      direction,
      confidence: 0.8,
      probabilities: { [direction]: 0.8 },
      latencyMs: 120,
      model: "fake",
      source: "JEV",
      ...extra,
    });
  }

  fail(message = "boom", kind: DecideError["kind"] = "connection"): void {
    const reject = this.rejectors.shift();
    if (!reject) throw new Error("no request is waiting for a failure");
    this.resolvers.shift();
    reject(new DecideError(kind, message));
  }

  /** Runs queued promise callbacks without waiting on wall-clock time. */
  async settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }
}

/** A provider that always answers the same way, with no promise queue. */
export function constantProvider(direction: Direction): DecisionProvider {
  return {
    name: "JEV",
    async decide(request) {
      return {
        decisionId: request.decisionId,
        direction,
        confidence: 0.5,
        probabilities: { [direction]: 0.5 },
        latencyMs: 10,
        model: "fake",
        source: "JEV",
      };
    },
  };
}

/**
 * A clock the test drives by hand, so a decision that takes 1500 ms costs the
 * suite no wall-clock time at all.
 */
export class VirtualClock {
  nowMs = 0;
  private timers: { at: number; callback: () => void }[] = [];

  now = (): number => this.nowMs;

  scheduleTimeout = (callback: () => void, ms: number): (() => void) => {
    const timer = { at: this.nowMs + ms, callback };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((candidate) => candidate !== timer);
    };
  };

  advance(ms: number): void {
    this.nowMs += ms;
    const due = this.timers.filter((timer) => timer.at <= this.nowMs).sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((timer) => timer.at > this.nowMs);
    for (const timer of due) timer.callback();
  }
}

/** Answers after `latencyMs` on a virtual clock, always with a legal direction. */
export function virtualLatencyProvider(
  clock: VirtualClock,
  latencyMs: number,
  pick: (request: DecideRequest) => Direction = (request) => request.legalDirections[0],
): DecisionProvider {
  return {
    name: "JEV",
    async decide(request, signal) {
      await new Promise<void>((resolve, reject) => {
        const cancel = clock.scheduleTimeout(() => resolve(), latencyMs);
        signal?.addEventListener("abort", () => {
          cancel();
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
      const direction = pick(request);
      return {
        decisionId: request.decisionId,
        direction,
        confidence: 0.66,
        probabilities: { [direction]: 0.66 },
        latencyMs,
        model: "virtual",
        source: "JEV",
      };
    },
  };
}
