/**
 * The agent controller: the only place that decides what the game asked for.
 *
 * It knows no game. Everything game-shaped arrives through `GameDriver<S>`:
 * where the next decision is, what to ask, how to fall back, how to apply an
 * answer. Everything else here — asking early, holding the answer, timing out,
 * discarding answers from a dead world, logging every outcome — is the same for
 * every game, and is what this file exists to own.
 *
 * Contract with the rest of the app:
 *  - It runs once per fixed step, synchronously, right before the engine steps.
 *    Nothing here awaits, so the game loop can never stall on the network.
 *  - It asks at most one question at a time, and only about the decision point
 *    the game is actually heading for, `prefetch` tiles before it gets there.
 *  - An answer is applied if it is legal, belongs to this decision and this game
 *    epoch, and arrived before the game had to commit. Otherwise the
 *    deliberately dumb fallback fires and the record says FALLBACK.
 */

import type {
  ActionId,
  DecideRequest,
  DecisionPoint,
  GameDriver,
  GameState,
  Observation,
  Question,
} from "../games/types";
import { DecideError } from "./types";
import type { DecisionProvider, DecisionResult, DecisionTelemetry, RecentDecision } from "./types";

export type ControllerStatus = "MANUAL" | "IDLE" | "REQUESTING" | "READY" | "OFFLINE";

export interface ControllerSnapshot {
  status: ControllerStatus;
  epoch: number;
  /** Where the next decision will be taken; null when the game is not playing or has none ahead. */
  target: DecisionPoint | null;
  lastObservation: Observation | null;
  /**
   * The last question the game was actually asked, with the decision it was
   * framed for.
   *
   * It is kept *with* its `decisionId` rather than on its own because the panel
   * that renders it must show the facts of the record on screen — a fallback or
   * a failed request leaves the previous question behind, and pairing the two
   * is what lets the reader tell "these are the numbers the model read" from
   * "these are some other decision's numbers".
   */
  lastQuestion: { decisionId: string; question: Question } | null;
  lastResult: DecisionResult | null;
  lastError: { kind: string; message: string } | null;
  apiKeyMissing: boolean;
  telemetry: DecisionTelemetry[];
  recentDecisions: RecentDecision[];
}

export interface ControllerOptions<S extends GameState> {
  /** The game's agent side. Everything this controller knows about the game comes from here. */
  driver: GameDriver<S>;
  /** The game's id, sent with every request. The server logs it and does not interpret it. */
  game: string;
  /** Which catalogue entry to ask; null or absent = whatever the server prefers. */
  modelId?: string | null;
  provider: DecisionProvider | null;
  /** Simulation speed multiplier. It compresses the decision window, see `setSpeed`. */
  speed?: number;
  now?: () => number;
  prefetchTiles?: number;
  minIntervalMs?: number;
  timeoutMs?: number;
  /** How close to the decision point the game may get before a decision is forced. */
  commitWindowTiles?: number;
  /** Schedules the decision timeout. Tests inject a virtual clock here. */
  scheduleTimeout?: (callback: () => void, ms: number) => () => void;
}

interface PendingDecision {
  decisionId: string;
  /** Identifies the decision point, so an answer can be matched to the place it was about. */
  pointKey: string;
  /** Where that decision point is, in the game's own tiles. */
  at: { x: number; y: number } | null;
  epoch: number;
  legalActions: ActionId[];
  record: DecisionTelemetry;
  phase: "REQUESTING" | "RESPONDED" | "ABANDONED";
  result: DecisionResult | null;
}

/**
 * How many recent decisions the controller keeps for the games to look at.
 *
 * A buffer, not a display window: each game slices off the number it wants in
 * its own observation, and a game is free to want more than another one.
 */
const RECENT_DECISION_BUFFER = 8;

/** Minimum spacing between two requests, whatever the game. */
const MIN_REQUEST_INTERVAL_MS = 100;

/**
 * How long a socket is held before the request is aborted outright.
 *
 * This is NOT the decision window — that one comes from the game (`budgetMs`,
 * divided by the speed multiplier) and is *shorter*. This only bounds how long a
 * socket is held, and is deliberately left past the window: an answer that
 * missed it is already unusable, but letting it land anyway means the record
 * still carries its *measured* latency. Aborting at the window would turn every
 * slow answer into a bare TIMEOUT with a null latency, hiding the very
 * distribution that makes the miss rate legible.
 *
 * 1500 ms also stays the outer bound the integration test exercises: a response
 * that slow must be discarded safely rather than crash the game.
 *
 * Exported because the metrics panel quotes both limits and must not carry a
 * second copy of either number.
 */
export const DECISION_TIMEOUT_MS = 1500;

export class AgentController<S extends GameState> {
  private readonly driver: GameDriver<S>;
  private readonly gameId: string;
  private provider: DecisionProvider | null;
  private readonly now: () => number;
  private readonly prefetchOverride: number | null;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly commitWindowTiles: number;
  private readonly scheduleTimeout: (callback: () => void, ms: number) => () => void;

  private speed: number;
  private modelId: string | null;

  private pending: PendingDecision | null = null;
  private epoch = 0;
  private committedKey: string | null = null;
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private sequence = 0;

  private telemetry: DecisionTelemetry[] = [];
  private recentDecisions: RecentDecision[] = [];
  private target: DecisionPoint | null = null;
  private lastObservation: Observation | null = null;
  private lastQuestion: { decisionId: string; question: Question } | null = null;
  private lastResult: DecisionResult | null = null;
  private lastError: { kind: string; message: string } | null = null;
  private apiKeyMissing = false;

  constructor(options: ControllerOptions<S>) {
    this.driver = options.driver;
    this.gameId = options.game;
    this.provider = options.provider;
    this.speed = options.speed ?? 1;
    this.modelId = options.modelId ?? null;
    this.now = options.now ?? (() => performance.now());
    this.prefetchOverride = options.prefetchTiles ?? null;
    this.minIntervalMs = options.minIntervalMs ?? MIN_REQUEST_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? DECISION_TIMEOUT_MS;
    this.commitWindowTiles = options.commitWindowTiles ?? options.driver.commitWindow;
    this.scheduleTimeout =
      options.scheduleTimeout ??
      ((callback, ms) => {
        const handle = setTimeout(callback, ms);
        return () => clearTimeout(handle);
      });
  }

  setProvider(provider: DecisionProvider | null): void {
    if (this.provider === provider) return;
    this.provider = provider;
    this.abandonPending("玩家模式已切换");
    this.apiKeyMissing = false;
    this.lastError = null;
  }

  /**
   * Change the simulation speed.
   *
   * It is not cosmetic: the multiplier scales the game clock, so the wall-clock
   * time the game takes to cover `prefetch` tiles is `prefetch / speed`. Asking
   * after `prefetch` tiles at 2× would leave half the window the budget promises.
   * Scaling the trigger point by the same factor is what keeps the *effective*
   * window equal to `budgetMs / speed` — and keeps "the model had 500 ms" a true
   * statement at 1×, which is the only speed two games can be compared at.
   */
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /**
   * Change which catalogue entry answers. `null` means the server's own default.
   *
   * The request in flight is dropped rather than left to land: it was asked of a
   * different model, and applying its answer would put the old model's decision
   * into a session the reader believes was handed over. The next decision point
   * asks the new one.
   */
  setModel(modelId: string | null): void {
    if (this.modelId === modelId) return;
    this.modelId = modelId;
    this.abandonPending("模型已切换");
  }

  /** New game: forget everything from the old one. */
  reset(): void {
    this.abandonPending("游戏已重开");
    this.pending = null;
    this.telemetry = [];
    this.recentDecisions = [];
    this.target = null;
    this.lastObservation = null;
    this.lastQuestion = null;
    this.lastResult = null;
    this.lastError = null;
    this.apiKeyMissing = false;
    this.committedKey = null;
    this.lastRequestAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * One fixed step. Call this immediately before stepping the engine, so an
   * action applied here is the one the game uses at the decision point it is
   * heading for.
   */
  tick(state: S): void {
    if (state.epoch !== this.epoch) {
      this.epoch = state.epoch;
      this.abandonPending("游戏世代已变更");
      this.recentDecisions = [];
      this.committedKey = null;
    }

    if (state.status !== "PLAYING") {
      this.target = null;
      return;
    }

    const point = this.driver.decision(state);
    if (!point) {
      this.target = null;
      return;
    }
    this.target = point;

    if (!this.provider) return;

    if (point.arriving) {
      if (this.committedKey === point.key) return;

      const ready =
        this.pending &&
        this.pending.epoch === state.epoch &&
        this.pending.pointKey === point.key &&
        this.pending.phase === "RESPONDED" &&
        this.pending.result
          ? this.pending
          : null;

      if (ready) {
        this.applyResult(state, ready, ready.result as DecisionResult);
        this.committedKey = point.key;
        return;
      }

      // Last chance: the engine will reach the decision point within a step.
      if (point.distance <= this.commitWindowTiles) {
        if (this.pending && this.pending.pointKey === point.key) {
          this.closePending(this.pending, "STALE", "还没收到回答就已抵达路口");
          this.pending = null;
        } else if (this.pending) {
          this.abandonPending("已被后面的路口取代");
        }
        this.applyFallback(state, point);
        this.committedKey = point.key;
      }
      return;
    }

    // On the way there: ask early. The answer waits in hand until the game is
    // actually approaching the decision point, because an action applied any
    // earlier would be taken at the next tile centre, not at the junction.
    this.committedKey = null;
    if (point.distance <= this.effectivePrefetchTiles) this.request(state, point);
  }

  snapshot(): ControllerSnapshot {
    const status: ControllerStatus = !this.provider
      ? "MANUAL"
      : this.pending?.phase === "REQUESTING"
        ? "REQUESTING"
        : this.pending?.phase === "RESPONDED"
          ? "READY"
          : this.lastError
            ? "OFFLINE"
            : "IDLE";

    return {
      status,
      epoch: this.epoch,
      target: this.target,
      lastObservation: this.lastObservation,
      lastQuestion: this.lastQuestion,
      lastResult: this.lastResult,
      lastError: this.lastError,
      apiKeyMissing: this.apiKeyMissing,
      // Copies, not the live arrays. The controller appends to both in place and
      // keeps mutating the records inside them as answers arrive, so handing out
      // the live reference would freeze the array's identity for the whole
      // session — and a useMemo keyed on it (the confidence series) would compute
      // once, against an empty list, and never run again. Copying the array costs
      // a few reference copies per snapshot and keeps such memos honest. Note the
      // elements are still shared: the records themselves are mutated in place,
      // which is fine for the panels because each snapshot is a fresh object.
      telemetry: [...this.telemetry],
      recentDecisions: [...this.recentDecisions],
    };
  }

  /** True while a decision request is in flight: cheap enough to ask every frame. */
  isRequesting(): boolean {
    return this.pending !== null;
  }

  /* --------------------------------------------------------------- internals */

  /**
   * The prefetch distance the game is actually asked at.
   *
   * `prefetch × speed`, because the answer has to be in hand one *wall-clock*
   * window before the decision, and the game clock runs `speed` times faster
   * than the wall clock.
   */
  private get effectivePrefetchTiles(): number {
    const prefetch = this.prefetchOverride ?? this.driver.prefetch;
    return prefetch * this.speed;
  }

  private request(state: S, point: DecisionPoint): void {
    if (
      this.pending &&
      this.pending.epoch === state.epoch &&
      this.pending.pointKey === point.key &&
      this.pending.phase !== "ABANDONED"
    ) {
      return; // already asked about this decision point
    }
    if (this.pending) this.abandonPending("已转向另一个决策点");

    const now = this.now();
    if (now - this.lastRequestAt < this.minIntervalMs) return;

    const provider = this.provider;
    if (!provider) return;

    const question = this.driver.frame(state, point);
    const observation = this.driver.observe({ state, point, recent: this.recentDecisions });

    const decisionId = `d${++this.sequence}`;
    const record: DecisionTelemetry = {
      decisionId,
      pointKey: point.key,
      at: point.at ? { ...point.at } : null,
      tick: state.tick,
      epoch: state.epoch,
      legalActions: [...point.actions],
      requestedAt: now,
      respondedAt: null,
      latencyMs: null,
      choice: null,
      applied: null,
      probabilities: {},
      confidence: null,
      source: provider.name,
      model: null,
      status: "PENDING",
      note: null,
    };

    this.telemetry.push(record);
    this.lastObservation = observation;
    // Kept so the panel can render the very same `facts` the server flattened
    // into the model's criteria: one object, so the reader and the model cannot
    // drift apart. See `docs/design-system.md` §6.3.
    this.lastQuestion = { decisionId, question };
    this.lastRequestAt = now;

    const pending: PendingDecision = {
      decisionId,
      pointKey: point.key,
      at: point.at ? { ...point.at } : null,
      epoch: state.epoch,
      legalActions: [...point.actions],
      record,
      phase: "REQUESTING",
      result: null,
    };
    this.pending = pending;

    const request: DecideRequest = {
      decisionId,
      game: this.gameId,
      modelId: this.modelId ?? undefined,
      state: observation,
      actions: [...point.actions],
      instructions: question.instructions,
      facts: question.facts,
      pointKey: point.key,
    };

    const controller = new AbortController();
    const cancelTimer = this.scheduleTimeout(() => controller.abort(), this.timeoutMs);

    try {
      provider
        .decide(request, controller.signal)
        .then((result) => {
          cancelTimer();
          this.onResponse(pending, result);
        })
        .catch((error: unknown) => {
          cancelTimer();
          this.onFailure(pending, error);
        });
    } catch (error) {
      cancelTimer();
      this.onFailure(pending, error);
    }
  }

  private onResponse(pending: PendingDecision, result: DecisionResult): void {
    const respondedAt = this.now();
    pending.record.respondedAt = respondedAt;
    pending.record.latencyMs = result.latencyMs;
    pending.record.choice = result.action;
    pending.record.probabilities = result.probabilities ?? {};
    pending.record.confidence = result.confidence ?? null;
    pending.record.model = result.model ?? null;
    this.lastResult = result;
    this.lastError = null;

    if (pending.phase === "ABANDONED") return; // already recorded as stale

    if (result.decisionId !== pending.decisionId) {
      pending.record.status = "INVALID";
      pending.record.note = "回答携带了错误的决策 ID";
      pending.phase = "ABANDONED";
      if (this.pending === pending) this.pending = null;
      return;
    }

    if (!pending.legalActions.includes(result.action)) {
      pending.record.status = "INVALID";
      pending.record.note = `回答 ${result.action} 不在合法动作之内`;
      pending.phase = "ABANDONED";
      if (this.pending === pending) this.pending = null;
      return;
    }

    pending.phase = "RESPONDED";
    pending.result = result;
    pending.record.status = "PENDING";
  }

  private onFailure(pending: PendingDecision, error: unknown): void {
    const decidedError = asDecideError(error);
    const timedOut = decidedError.kind === "timeout" || (error instanceof Error && error.name === "AbortError");
    if (pending.phase !== "ABANDONED") {
      pending.record.status = timedOut ? "TIMEOUT" : "ERROR";
      pending.record.note = decidedError.message;
      pending.record.respondedAt = this.now();
      pending.phase = "ABANDONED";
    }
    this.lastError = { kind: timedOut ? "timeout" : decidedError.kind, message: decidedError.message };
    this.apiKeyMissing = decidedError.kind === "no_api_key";
    if (this.pending === pending) this.pending = null;
  }

  private applyResult(state: S, pending: PendingDecision, result: DecisionResult): void {
    this.driver.apply(state, result.action);
    pending.record.status = "APPLIED";
    pending.record.applied = result.action;
    pending.record.note = null;
    this.pushRecent(pending.pointKey, pending.at, result.action);
    if (this.pending === pending) this.pending = null;
  }

  private applyFallback(state: S, point: DecisionPoint): void {
    const choice = this.driver.fallback(state, point);
    this.driver.apply(state, choice.action);

    const now = this.now();
    this.telemetry.push({
      decisionId: `f${++this.sequence}`,
      pointKey: point.key,
      at: point.at ? { ...point.at } : null,
      tick: state.tick,
      epoch: state.epoch,
      legalActions: [...point.actions],
      requestedAt: now,
      respondedAt: now,
      latencyMs: null,
      choice: choice.action,
      applied: choice.action,
      probabilities: {},
      confidence: null,
      source: "FALLBACK",
      model: null,
      status: "APPLIED",
      note: choice.rule,
    });
    this.pushRecent(point.key, point.at, choice.action);
  }

  private pushRecent(pointKey: string, at: { x: number; y: number } | null, action: ActionId): void {
    this.recentDecisions.push({ key: pointKey, at: at ? { ...at } : null, action });
    if (this.recentDecisions.length > RECENT_DECISION_BUFFER) {
      this.recentDecisions.splice(0, this.recentDecisions.length - RECENT_DECISION_BUFFER);
    }
  }

  private abandonPending(note: string): void {
    if (!this.pending) return;
    this.closePending(this.pending, "STALE", note);
    this.pending = null;
  }

  private closePending(pending: PendingDecision, status: DecisionTelemetry["status"], note: string): void {
    if (pending.record.status === "APPLIED" || pending.record.status === "STALE") return;
    pending.record.status = status;
    pending.record.note = note;
    pending.phase = "ABANDONED";
  }
}

function asDecideError(error: unknown): DecideError {
  if (error instanceof Error && error.name === "DecideError") return error as DecideError;
  if (error instanceof Error) {
    if (error.name === "AbortError") return new DecideError("timeout", "决策超时");
    return new DecideError("unknown", error.message);
  }
  return new DecideError("unknown", String(error));
}
