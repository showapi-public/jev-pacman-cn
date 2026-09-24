/**
 * Validation of what comes back from the server.
 *
 * The API is trusted for nothing: an answer is a suggestion until it has been
 * checked against the decision it belongs to and the actions that were actually
 * on offer. Nothing here knows a game — the actions are whatever the request
 * said they were.
 */

import type { ActionId, DecideRequest, DecisionResult } from "../agent/types";

export type ValidationResult =
  | { ok: true; result: DecisionResult }
  | { ok: false; reason: string };

export function validateDecision(payload: unknown, request: DecideRequest): ValidationResult {
  if (typeof payload !== "object" || payload === null) return { ok: false, reason: "回答不是一个对象" };
  const body = payload as Record<string, unknown>;

  if (body.decisionId !== request.decisionId) {
    return { ok: false, reason: `回答对应的决策是 ${String(body.decisionId)}` };
  }

  if (typeof body.action !== "string") {
    return { ok: false, reason: `回答不是一个动作：${String(body.action)}` };
  }

  if (!request.actions.includes(body.action)) {
    return { ok: false, reason: `回答 ${body.action} 不在合法动作之内` };
  }

  const probabilities: Partial<Record<ActionId, number>> = {};
  if (typeof body.probabilities === "object" && body.probabilities !== null) {
    for (const [key, value] of Object.entries(body.probabilities as Record<string, unknown>)) {
      if (request.actions.includes(key) && typeof value === "number" && Number.isFinite(value)) {
        probabilities[key] = value;
      }
    }
  }

  return {
    ok: true,
    result: {
      decisionId: request.decisionId,
      action: body.action,
      confidence: typeof body.confidence === "number" ? body.confidence : null,
      probabilities,
      latencyMs: typeof body.latencyMs === "number" && Number.isFinite(body.latencyMs) ? body.latencyMs : 0,
      model: typeof body.model === "string" ? body.model : null,
      source: "JEV",
    },
  };
}
