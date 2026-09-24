/**
 * Browser side of the model connection.
 *
 * The browser asks this app's own /api/decide route, which is the only thing
 * that knows the API key. Nothing here can leak it.
 *
 * The body is written out field by field rather than by serialising the request:
 * the in-process request carries a couple of things that are not part of the wire
 * protocol (`pointKey`), and one day it may carry more. Building the payload
 * explicitly is what keeps that difference visible.
 */

import { DecideError } from "../agent/types";
import type { DecisionProvider } from "../agent/types";
import { validateDecision } from "./validation";

export const DECIDE_ENDPOINT = "/api/decide";

export function createJevProvider(endpoint = DECIDE_ENDPOINT, fetchImpl: typeof fetch = fetch): DecisionProvider {
  return {
    name: "JEV",
    async decide(request, signal) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decisionId: request.decisionId,
            game: request.game,
            // Absent when the server's default entry should answer. The route
            // treats a missing id and an explicit one the same way; the key is
            // simply dropped when there is nothing to send.
            modelId: request.modelId,
            state: request.state,
            actions: request.actions,
            instructions: request.instructions,
            facts: request.facts,
          }),
          signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new DecideError("timeout", "决策超时");
        }
        throw new DecideError("connection", error instanceof Error ? error.message : String(error));
      }

      if (!response.ok) {
        const body = await safeJson(response);
        const kind = (body.error?.kind ?? "http") as DecideError["kind"];
        throw new DecideError(kind, body.error?.message ?? `请求失败（HTTP ${response.status}）`, response.status);
      }

      const body = await safeJson(response);
      const validated = validateDecision(body, request);
      if (!validated.ok) throw new DecideError("invalid", validated.reason);
      return validated.result;
    },
  };
}

async function safeJson(response: Response): Promise<Record<string, any>> {
  try {
    return (await response.json()) as Record<string, any>;
  } catch {
    return {};
  }
}
