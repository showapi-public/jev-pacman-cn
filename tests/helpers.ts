/**
 * Test helpers: a small corridor maze, actors you can place by hand, a game with
 * no game in it, and providers whose answers you control tick by tick.
 */

import type { ActionId, DecideRequest, DecisionProvider, DecisionResult } from "@/lib/agent/types";
import { DecideError } from "@/lib/agent/types";
import { createGame, stepGame } from "@/lib/games/pacman/engine";
import { parseMaze } from "@/lib/games/pacman/maze";
import type {
  Direction,
  PacmanState,
  GhostMode,
  GhostName,
  GhostState,
  Maze,
  TilePosition,
} from "@/lib/games/pacman/types";
import { FIXED_DT_MS, tileCenter, tileKey } from "@/lib/games/pacman/types";
import type { GameDriver, GameState, GameStatus } from "@/lib/games/types";

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

export function miniGame(seed = 1): PacmanState {
  const state = createGame({ maze: miniMaze(), seed });
  state.ghosts = [];
  return state;
}

/** Drops Pac-Man on a tile centre, facing a direction. */
export function placePacman(state: PacmanState, x: number, y: number, direction: Direction = "LEFT"): void {
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

export function putGhosts(state: PacmanState, ghosts: GhostState[]): void {
  state.ghosts = ghosts;
}

/** Removes every pellet except the ones given: keeps expectations readable. */
export function keepPellets(state: PacmanState, keys: [number, number][]): void {
  state.pellets = new Set(keys.map(([x, y]) => tileKey(tile(x, y))));
  state.powerPellets = new Set();
}

export function stepTicks(state: PacmanState, ticks: number): void {
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

/* -------------------------------------------------------------- 假游戏 */

/*
 * The controller is supposed to know nothing about any game, so testing it
 * against Pac-Man would prove the opposite of what the refactor claims. This
 * one-dimensional walk is the smallest thing that still exercises every branch
 * the controller owns: one decision point per gate, an arrival, a forced commit,
 * and a world that can be replaced by bumping `epoch`.
 */

/**
 * The actions are `A`/`B`/`C` on purpose: the controller's tests contain no
 * direction literal at all, so a regression that sneaks Pac-Man knowledge back
 * into `lib/agent` cannot hide behind a reshuffled enum.
 */
export const FAKE_ACTIONS = ["A", "B", "C"] as const;

/** Tiles between two gates — far enough to be asked about three tiles early. */
export const FAKE_GATE_INTERVAL = 6;

/**
 * Distance consumed per tick. Half a tile rather than a whole one, so `arriving`
 * lasts two ticks and the gap between "on the gate" and "out of time" can be
 * told apart: 0.5 is arriving but not yet forced, 0 is forced.
 */
const FAKE_STEP = 0.5;

export const FAKE_PREFETCH = 3;
export const FAKE_COMMIT_WINDOW = 0.25;
export const FAKE_BUDGET_MS = 500;
export const FAKE_INSTRUCTIONS = "Choose one of the three legal actions.";

export interface FakeState extends GameState {
  /** Tiles left before the gate, counted down by `stepFake`. */
  distance: number;
  /** Gates passed; the second half of the decision key. */
  gates: number;
  /** The last action the controller wrote into the world. */
  applied: ActionId | null;
}

export function fakeGame(seed = 1, status: GameStatus = "PLAYING"): FakeState {
  return {
    status,
    tick: 0,
    epoch: 1,
    seed,
    playTimeMs: 0,
    score: 0,
    distance: FAKE_GATE_INTERVAL,
    gates: 0,
    applied: null,
  };
}

/** One fixed step: walk towards the gate, and pass it. */
export function stepFake(state: FakeState): void {
  state.tick += 1;
  state.playTimeMs += 5;
  state.distance -= FAKE_STEP;
  if (state.distance < 0) {
    state.gates += 1;
    state.distance = FAKE_GATE_INTERVAL;
  }
}

export const FAKE_DRIVER: GameDriver<FakeState> = {
  prefetch: FAKE_PREFETCH,
  commitWindow: FAKE_COMMIT_WINDOW,
  budgetMs: FAKE_BUDGET_MS,

  decision(state) {
    if (state.status !== "PLAYING") return null;
    return {
      key: `${state.epoch}:g${state.gates}`,
      at: { x: state.gates, y: 0 },
      actions: [...FAKE_ACTIONS],
      distance: state.distance,
      arriving: state.distance < 1,
      facing: "A",
    };
  },

  observe({ state }) {
    return { gate: state.gates, distance: state.distance };
  },

  frame(state, point) {
    // Carrying the distance in the fact table is not decoration: it lets a test
    // read back the exact position the controller asked at, which is the only
    // external evidence that the request went out at the driver's own `prefetch`
    // distance with no speed scaling on top.
    return {
      instructions: FAKE_INSTRUCTIONS,
      facts: [
        {
          label: "距闸门",
          modelLabel: "Distance to gate",
          values: Object.fromEntries(point.actions.map((action) => [action, state.distance.toFixed(2)])),
        },
      ],
    };
  },

  /** Deliberately a different action from anything a test answers with. */
  fallback() {
    return { action: "B", rule: "假游戏兜底" };
  },

  apply(state, action) {
    state.applied = action;
  },

  debug(state) {
    return { gate: state.gates };
  },
};

/* -------------------------------------------------------------- providers */

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

  respond(action: ActionId, extra: Partial<DecisionResult> = {}): void {
    const resolve = this.resolvers.shift();
    if (!resolve) throw new Error("no request is waiting for an answer");
    this.rejectors.shift();
    resolve({
      decisionId: "",
      action,
      confidence: 0.8,
      probabilities: { [action]: 0.8 },
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
export function constantProvider(action: ActionId): DecisionProvider {
  return {
    name: "JEV",
    async decide(request) {
      return {
        decisionId: request.decisionId,
        action,
        confidence: 0.5,
        probabilities: { [action]: 0.5 },
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

/** Answers after `latencyMs` on a virtual clock, always with a legal action. */
export function virtualLatencyProvider(
  clock: VirtualClock,
  latencyMs: number,
  pick: (request: DecideRequest) => ActionId = (request) => request.actions[0],
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
      const action = pick(request);
      return {
        decisionId: request.decisionId,
        action,
        confidence: 0.66,
        probabilities: { [action]: 0.66 },
        latencyMs,
        model: "virtual",
        source: "JEV",
      };
    },
  };
}
