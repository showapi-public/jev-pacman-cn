/**
 * The agent controller: the only place that decides what Pac-Man asked for.
 *
 * Contract with the rest of the app:
 *  - It runs once per fixed step, synchronously, right before the engine steps.
 *    Nothing here awaits, so the game loop can never stall on the network.
 *  - It asks at most one question at a time, and only about the junction
 *    Pac-Man is actually heading for, three tiles before he gets there.
 *  - An answer is applied if it is legal, belongs to this decision and this
 *    game epoch, and arrived before Pac-Man had to commit. Otherwise the
 *    deliberately dumb fallback fires and the record says FALLBACK.
 */

import { analyzeCandidates } from "../game/analysis";
import { requestDirection } from "../game/engine";
import { distanceToTileCenter } from "../game/movement";
import { findNextDecisionPoint, getMeaningfulDirections } from "../game/pathfinding";
import type { Direction, GameState, TilePosition } from "../game/types";
import {
  DECISION_PREFETCH_TILES,
  DECISION_TIMEOUT_MS,
  MIN_JEV_INTERVAL_MS,
  neighbor,
  tileKey,
} from "../game/types";
import { ghostTarget } from "../game/ghosts";
import { chooseFallback } from "./fallback";
import { buildObservation } from "./observation";
import { MAX_RECENT_DECISIONS } from "./observation";
import { DecideError } from "./types";
import type {
  DecisionProvider,
  DecisionResult,
  DecisionTelemetry,
  JevObservation,
  RecentDecision,
} from "./types";

export type ControllerStatus = "MANUAL" | "IDLE" | "REQUESTING" | "READY" | "OFFLINE";

export interface TargetInfo {
  junction: TilePosition;
  heading: Direction;
  legalDirections: Direction[];
  /** Tiles still to travel before Pac-Man reaches the junction centre. */
  tilesAway: number;
}

export interface ControllerSnapshot {
  status: ControllerStatus;
  epoch: number;
  target: TargetInfo | null;
  lastObservation: JevObservation | null;
  lastResult: DecisionResult | null;
  lastError: { kind: string; message: string } | null;
  apiKeyMissing: boolean;
  telemetry: DecisionTelemetry[];
  recentDecisions: RecentDecision[];
}

export interface ControllerOptions {
  provider: DecisionProvider | null;
  now?: () => number;
  prefetchTiles?: number;
  minIntervalMs?: number;
  timeoutMs?: number;
  /** How close to the junction centre Pac-Man may get before a decision is forced. */
  commitWindowTiles?: number;
  /** Schedules the decision timeout. Tests inject a virtual clock here. */
  scheduleTimeout?: (callback: () => void, ms: number) => () => void;
}

interface PendingDecision {
  decisionId: string;
  junction: TilePosition;
  epoch: number;
  legalDirections: Direction[];
  record: DecisionTelemetry;
  phase: "REQUESTING" | "RESPONDED" | "ABANDONED";
  result: DecisionResult | null;
}

export class AgentController {
  private provider: DecisionProvider | null;
  private readonly now: () => number;
  private readonly prefetchTiles: number;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly commitWindowTiles: number;
  private readonly scheduleTimeout: (callback: () => void, ms: number) => () => void;

  private pending: PendingDecision | null = null;
  private epoch = 0;
  private committedKey: string | null = null;
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private sequence = 0;

  private telemetry: DecisionTelemetry[] = [];
  private recentDecisions: RecentDecision[] = [];
  private target: TargetInfo | null = null;
  private lastObservation: JevObservation | null = null;
  private lastResult: DecisionResult | null = null;
  private lastError: { kind: string; message: string } | null = null;
  private apiKeyMissing = false;

  constructor(options: ControllerOptions) {
    this.provider = options.provider;
    this.now = options.now ?? (() => performance.now());
    this.prefetchTiles = options.prefetchTiles ?? DECISION_PREFETCH_TILES;
    this.minIntervalMs = options.minIntervalMs ?? MIN_JEV_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? DECISION_TIMEOUT_MS;
    this.commitWindowTiles = options.commitWindowTiles ?? 0.15;
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
    this.abandonPending("provider changed");
    this.apiKeyMissing = false;
    this.lastError = null;
  }

  /** New game: forget everything from the old one. */
  reset(): void {
    this.abandonPending("game restarted");
    this.pending = null;
    this.telemetry = [];
    this.recentDecisions = [];
    this.target = null;
    this.lastObservation = null;
    this.lastResult = null;
    this.lastError = null;
    this.apiKeyMissing = false;
    this.committedKey = null;
    this.lastRequestAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * One fixed step. Call this immediately before `stepGame`, so a direction
   * applied here is the one the engine uses at the junction it is heading for.
   */
  tick(state: GameState): void {
    if (state.epoch !== this.epoch) {
      this.epoch = state.epoch;
      this.abandonPending("game epoch changed");
      this.recentDecisions = [];
      this.committedKey = null;
    }

    if (state.status !== "PLAYING") {
      this.target = null;
      return;
    }

    const heading = state.pacman.direction;
    const decisionPoint = findNextDecisionPoint(state.maze, state.pacman.tile, heading);
    if (!decisionPoint) {
      this.target = null;
      return;
    }

    const { junction } = decisionPoint;
    const legalDirections = getMeaningfulDirections(state.maze, junction, decisionPoint.heading);
    const tilesAway = distanceToTileCenter(state.pacman) + decisionPoint.steps;
    this.target = { junction, heading: decisionPoint.heading, legalDirections, tilesAway };

    if (!this.provider) return;

    const anchor = state.pacman.tile;
    const arriving = anchor.x === junction.x && anchor.y === junction.y;
    const commitKey = `${state.epoch}:${tileKey(junction)}`;

    if (arriving) {
      if (this.committedKey === commitKey) return;

      const ready =
        this.pending &&
        this.pending.epoch === state.epoch &&
        samePosition(this.pending.junction, junction) &&
        this.pending.phase === "RESPONDED" &&
        this.pending.result
          ? this.pending
          : null;

      if (ready) {
        this.applyResult(state, ready, ready.result as DecisionResult);
        this.committedKey = commitKey;
        return;
      }

      // Last chance: the engine will reach the junction centre within a step.
      if (distanceToTileCenter(state.pacman) <= this.commitWindowTiles) {
        if (this.pending && samePosition(this.pending.junction, junction)) {
          this.closePending(this.pending, "STALE", "junction reached before the answer arrived");
          this.pending = null;
        } else if (this.pending) {
          this.abandonPending("superseded by a later junction");
        }
        this.applyFallback(state, junction, decisionPoint.heading, legalDirections);
        this.committedKey = commitKey;
      }
      return;
    }

    // On the way there: ask early. The answer waits in hand until Pac-Man is
    // actually approaching the junction, because a direction applied any
    // earlier would be taken at the next tile centre, not at the junction.
    this.committedKey = null;
    if (tilesAway <= this.prefetchTiles) this.request(state, junction, decisionPoint.heading, legalDirections);
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
      lastResult: this.lastResult,
      lastError: this.lastError,
      apiKeyMissing: this.apiKeyMissing,
      telemetry: this.telemetry,
      recentDecisions: this.recentDecisions,
    };
  }

  /** Everything the debug overlay draws: read-only, no side effects. */
  debugInfo(state: GameState) {
    const target = this.target;
    return {
      junction: target?.junction ?? null,
      legalDirections: target?.legalDirections ?? [],
      candidateTiles: target
        ? target.legalDirections.map((direction) => neighbor(target.junction, direction))
        : [],
      ghostTargets: state.ghosts
        .filter((ghost) => ghost.mode === "CHASE" || ghost.mode === "SCATTER")
        .map((ghost) => ghostTarget(ghost, state)),
      pending: this.pending ? `${this.pending.decisionId} ${this.pending.phase.toLowerCase()}` : null,
    };
  }

  /* --------------------------------------------------------------- internals */

  private request(state: GameState, junction: TilePosition, heading: Direction, legalDirections: Direction[]): void {
    if (
      this.pending &&
      this.pending.epoch === state.epoch &&
      samePosition(this.pending.junction, junction) &&
      this.pending.phase !== "ABANDONED"
    ) {
      return; // already asked about this junction
    }
    if (this.pending) this.abandonPending("moved on to another junction");

    const now = this.now();
    if (now - this.lastRequestAt < this.minIntervalMs) return;

    const provider = this.provider;
    if (!provider) return;

    const candidates = analyzeCandidates(state, junction, heading, legalDirections);
    const observation = buildObservation({
      state,
      junction,
      heading,
      legalDirections,
      candidates,
      recentDecisions: this.recentDecisions,
    });

    const decisionId = `d${++this.sequence}`;
    const record: DecisionTelemetry = {
      decisionId,
      tick: state.tick,
      epoch: state.epoch,
      junction: { ...junction },
      legalDirections: [...legalDirections],
      requestedAt: now,
      respondedAt: null,
      latencyMs: null,
      choice: null,
      applied: null,
      probabilities: {},
      confidence: null,
      source: provider.name,
      status: "PENDING",
      note: null,
    };

    this.telemetry.push(record);
    this.lastObservation = observation;
    this.lastRequestAt = now;

    const pending: PendingDecision = {
      decisionId,
      junction: { ...junction },
      epoch: state.epoch,
      legalDirections: [...legalDirections],
      record,
      phase: "REQUESTING",
      result: null,
    };
    this.pending = pending;

    const controller = new AbortController();
    const cancelTimer = this.scheduleTimeout(() => controller.abort(), this.timeoutMs);

    try {
      provider
        .decide({ decisionId, observation, legalDirections: [...legalDirections] }, controller.signal)
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
    pending.record.choice = result.direction;
    pending.record.probabilities = result.probabilities ?? {};
    pending.record.confidence = result.confidence ?? null;
    this.lastResult = result;
    this.lastError = null;

    if (pending.phase === "ABANDONED") return; // already recorded as stale

    if (result.decisionId !== pending.decisionId) {
      pending.record.status = "INVALID";
      pending.record.note = "answer carried the wrong decision id";
      pending.phase = "ABANDONED";
      if (this.pending === pending) this.pending = null;
      return;
    }

    if (!pending.legalDirections.includes(result.direction)) {
      pending.record.status = "INVALID";
      pending.record.note = `answer ${result.direction} was not one of the legal directions`;
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

  private applyResult(state: GameState, pending: PendingDecision, result: DecisionResult): void {
    requestDirection(state, result.direction);
    pending.record.status = "APPLIED";
    pending.record.applied = result.direction;
    pending.record.note = null;
    this.pushRecent(pending.junction, result.direction);
    if (this.pending === pending) this.pending = null;
  }

  private applyFallback(state: GameState, junction: TilePosition, heading: Direction, legalDirections: Direction[]): void {
    const choice = chooseFallback(state, junction, heading, legalDirections);
    requestDirection(state, choice.direction);

    const now = this.now();
    this.telemetry.push({
      decisionId: `f${++this.sequence}`,
      tick: state.tick,
      epoch: state.epoch,
      junction: { ...junction },
      legalDirections: [...legalDirections],
      requestedAt: now,
      respondedAt: now,
      latencyMs: null,
      choice: choice.direction,
      applied: choice.direction,
      probabilities: {},
      confidence: null,
      source: "FALLBACK",
      status: "APPLIED",
      note: choice.rule,
    });
    this.pushRecent(junction, choice.direction);
  }

  private pushRecent(junction: TilePosition, chosen: Direction): void {
    this.recentDecisions.push({ junction: { ...junction }, chosen });
    if (this.recentDecisions.length > MAX_RECENT_DECISIONS) {
      this.recentDecisions.splice(0, this.recentDecisions.length - MAX_RECENT_DECISIONS);
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

function samePosition(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function asDecideError(error: unknown): DecideError {
  if (error instanceof Error && error.name === "DecideError") return error as DecideError;
  if (error instanceof Error) {
    if (error.name === "AbortError") return new DecideError("timeout", "decision timed out");
    return new DecideError("unknown", error.message);
  }
  return new DecideError("unknown", String(error));
}
