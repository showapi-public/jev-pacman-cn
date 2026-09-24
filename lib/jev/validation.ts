/**
 * Validation of what comes back from the server.
 *
 * The API is trusted for nothing: an answer is a suggestion until it has been
 * checked against the decision it belongs to and the directions that were
 * actually on offer.
 */

import type { Direction } from "../games/pacman/types";
import { DIRECTION_ORDER } from "../games/pacman/types";
import type { DecideRequest, DecisionResult } from "../agent/types";

export function isDirection(value: unknown): value is Direction {
  return typeof value === "string" && (DIRECTION_ORDER as readonly string[]).includes(value);
}

export type ValidationResult =
  | { ok: true; result: DecisionResult }
  | { ok: false; reason: string };

export function validateDecision(payload: unknown, request: DecideRequest): ValidationResult {
  if (typeof payload !== "object" || payload === null) return { ok: false, reason: "回答不是一个对象" };
  const body = payload as Record<string, unknown>;

  if (body.decisionId !== request.decisionId) {
    return { ok: false, reason: `回答对应的决策是 ${String(body.decisionId)}` };
  }

  if (!isDirection(body.direction)) {
    return { ok: false, reason: `回答不是一个方向：${String(body.direction)}` };
  }

  if (!request.legalDirections.includes(body.direction)) {
    return { ok: false, reason: `回答 ${body.direction} 不在合法方向之内` };
  }

  const probabilities: Partial<Record<Direction, number>> = {};
  if (typeof body.probabilities === "object" && body.probabilities !== null) {
    for (const [key, value] of Object.entries(body.probabilities as Record<string, unknown>)) {
      if (isDirection(key) && typeof value === "number" && Number.isFinite(value)) probabilities[key] = value;
    }
  }

  return {
    ok: true,
    result: {
      decisionId: request.decisionId,
      direction: body.direction,
      confidence: typeof body.confidence === "number" ? body.confidence : null,
      probabilities,
      latencyMs: typeof body.latencyMs === "number" && Number.isFinite(body.latencyMs) ? body.latencyMs : 0,
      model: typeof body.model === "string" ? body.model : null,
      source: "JEV",
    },
  };
}
