/**
 * The agent layer's own types: the protocol between the controller and whatever
 * answers its questions, plus the telemetry record the panels read.
 *
 * The contract between the agent layer and the *games* lives in
 * `lib/games/types.ts`. Whatever both sides need is re-exported here, so that
 * `lib/agent/*`, `components/*` and the API routes can keep importing from one
 * place without having to know which module a name was born in.
 */

import type {
  ActionId,
  DecideRequest,
  DecisionPoint,
  FactRow,
  GameEvent,
  GameState,
  GameStatus,
  Observation,
  Question,
  RecentDecision,
} from "../games/types";

export type {
  ActionId,
  DecideRequest,
  DecisionPoint,
  FactRow,
  GameEvent,
  GameState,
  GameStatus,
  Observation,
  Question,
  RecentDecision,
};

/* ---------------------------------------------------------------- decision */

/** How the answer was produced. *Who* produced it is `DecisionTelemetry.model`. */
export type DecisionSource = "JEV" | "MOCK" | "RANDOM" | "HEURISTIC" | "SCRIPTED";

export interface DecideResponse {
  decisionId: string;
  action: ActionId;
  confidence: number | null;
  probabilities: Partial<Record<ActionId, number>>;
  latencyMs: number;
  /** The model or channel that answered, when the provider knows it. */
  model: string | null;
}

export interface DecisionResult extends DecideResponse {
  source: DecisionSource;
}

export interface DecisionProvider {
  readonly name: DecisionSource;
  /** Rejects (never resolves) with a DecideError when the model cannot answer. */
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
  /** The decision point this answer belongs to (`DecisionPoint.key`). */
  pointKey: string;
  /** Where the decision was taken, in tiles; null for games that have no such place. */
  at: { x: number; y: number } | null;
  tick: number;
  epoch: number;
  legalActions: ActionId[];
  requestedAt: number;
  respondedAt: number | null;
  latencyMs: number | null;
  choice: ActionId | null;
  /** What the game actually did at the decision point (null while it has not got there yet). */
  applied: ActionId | null;
  probabilities: Partial<Record<ActionId, number>>;
  confidence: number | null;
  source: DecisionSource | "FALLBACK";
  /** Who answered (channel or model name); `source` says how. */
  model: string | null;
  status: TelemetryStatus;
  note: string | null;
}

export interface GameLogEntry {
  at: number;
  tick: number;
  event: GameEvent;
}
