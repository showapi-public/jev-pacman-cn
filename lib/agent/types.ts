/**
 * The agent layer: everything that turns game facts into a decision.
 *
 * The controller never computes a good move itself. It builds an observation
 * out of code-owned facts, asks a DecisionProvider, validates the answer and
 * applies it — or, if the answer is not there in time, applies the deliberately
 * dumb fallback and says so out loud.
 */

import type { Direction, GameEvent, GameState, GhostMode, TilePosition } from "../game/types";
import type { CandidateAnalysis } from "../game/analysis";

/* ------------------------------------------------------------- observation */

export interface GhostObservation {
  name: string;
  tile: TilePosition;
  mode: GhostMode;
  /** BFS distance from Pac-Man to this ghost, null when the ghost is behind the house gate. */
  distanceToPacman: number | null;
}

export interface RecentDecision {
  junction: TilePosition;
  chosen: Direction;
}

export interface JevObservation {
  objective: string;
  game: {
    score: number;
    lives: number;
    pelletsRemaining: number;
    powerPelletsRemaining: number;
  };
  pacman: {
    tile: TilePosition;
    heading: Direction;
  };
  targetJunction: {
    tile: TilePosition;
    legalDirections: Direction[];
  };
  mode: {
    frightened: boolean;
    frightenedRemainingMs: number;
  };
  ghosts: GhostObservation[];
  candidates: Partial<Record<Direction, CandidateAnalysis>>;
  recentDecisions: RecentDecision[];
}

/* ---------------------------------------------------------------- decision */

export type DecisionSource = "JEV" | "MOCK" | "RANDOM" | "HEURISTIC" | "SCRIPTED";

export interface DecideRequest {
  decisionId: string;
  observation: JevObservation;
  legalDirections: Direction[];
}

export interface DecideResponse {
  decisionId: string;
  direction: Direction;
  confidence: number | null;
  probabilities: Partial<Record<Direction, number>>;
  latencyMs: number;
  model: string | null;
}

export interface DecisionResult extends DecideResponse {
  source: DecisionSource;
}

export interface DecisionProvider {
  readonly name: DecisionSource;
  /** Rejects (never resolves) with a DecideError when Jev cannot answer. */
  decide(request: DecideRequest, signal?: AbortSignal): Promise<DecisionResult>;
}

export class DecideError extends Error {
  readonly kind: "timeout" | "connection" | "http" | "no_api_key" | "invalid" | "unknown";
  readonly status?: number;

  constructor(kind: DecideError["kind"], message: string, status?: number) {
    super(message);
    this.name = "DecideError";
    this.kind = kind;
    this.status = status;
  }
}

/* --------------------------------------------------------------- telemetry */

export type TelemetryStatus = "PENDING" | "APPLIED" | "STALE" | "TIMEOUT" | "ERROR" | "INVALID";

export interface DecisionTelemetry {
  decisionId: string;
  tick: number;
  epoch: number;
  junction: TilePosition;
  legalDirections: Direction[];
  requestedAt: number;
  respondedAt: number | null;
  latencyMs: number | null;
  choice: Direction | null;
  /** What Pac-Man actually did at the junction (null while the game has not got there yet). */
  applied: Direction | null;
  probabilities: Partial<Record<Direction, number>>;
  confidence: number | null;
  source: DecisionSource | "FALLBACK";
  status: TelemetryStatus;
  note: string | null;
}

export interface GameLogEntry {
  at: number;
  tick: number;
  event: GameEvent;
}

export { type CandidateAnalysis };
export type { GameState };
