/**
 * Browser side of the Jev connection.
 *
 * The browser asks this app's own /api/decide route, which is the only thing
 * that knows the API key. Nothing here can leak it.
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
          body: JSON.stringify(request),
          signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new DecideError("timeout", "decision timed out");
        }
        throw new DecideError("connection", error instanceof Error ? error.message : String(error));
      }

      if (!response.ok) {
        const body = await safeJson(response);
        const kind = (body.error?.kind ?? "http") as DecideError["kind"];
        throw new DecideError(kind, body.error?.message ?? `request failed with ${response.status}`, response.status);
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
