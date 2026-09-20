/**
 * Decision providers other than Jev.
 *
 * These exist to test the game and to compare against Jev's choices. They are
 * never wired into Jev mode: the only thing that may stand in for Jev at a
 * junction is the fallback, which is logged and dumb on purpose.
 */

import type { CandidateAnalysis } from "../game/analysis";
import { DIRECTION_ORDER, nextRandom } from "../game/types";
import type { Direction } from "../game/types";
import type { DecideRequest, DecisionProvider, DecisionResult } from "./types";

function answer(
  request: DecideRequest,
  direction: Direction,
  source: DecisionResult["source"],
  probabilities: Partial<Record<Direction, number>> = {},
): DecisionResult {
  return {
    decisionId: request.decisionId,
    direction,
    confidence: null,
    probabilities,
    latencyMs: 0,
    model: null,
    source,
  };
}

/** Picks a legal direction with a seeded RNG: the baseline that says "is Jev better than chance?". */
export function createRandomProvider(seed = 1): DecisionProvider {
  let state = seed >>> 0 || 1;
  return {
    name: "RANDOM",
    async decide(request) {
      const draw = nextRandom(state);
      state = draw.state;
      const index = Math.min(request.legalDirections.length - 1, Math.floor(draw.value * request.legalDirections.length));
      return answer(request, request.legalDirections[index], "RANDOM");
    },
  };
}

/**
 * A deterministic player built from the candidate facts: the yardstick Jev is
 * measured against. Weights are hand-picked, not learned.
 */
export function createHeuristicProvider(): DecisionProvider {
  return {
    name: "HEURISTIC",
    async decide(request) {
      return answer(request, heuristicChoice(request), "HEURISTIC");
    },
  };
}

export function heuristicChoice(request: DecideRequest): Direction {
  const candidates = request.legalDirections
    .map((direction) => request.observation.candidates[direction])
    .filter((candidate): candidate is CandidateAnalysis => Boolean(candidate));

  let best = request.legalDirections[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const danger = candidate.nearestDangerousGhostDistance ?? 12;
    const pellet = candidate.nearestPelletDistance ?? 12;
    const frightened =
      candidate.nearestFrightenedGhostDistance !== null && candidate.nearestFrightenedGhostDistance <= 4 ? 1 : 0;

    const score =
      3 * Math.min(danger, 12) +
      0.6 * candidate.pelletsWithin6Tiles -
      0.5 * Math.min(pellet, 12) +
      2 * frightened +
      0.02 * candidate.reachableSafeArea -
      (candidate.deadEnd ? 8 : 0) +
      (candidate.continuesForward ? 0.7 : 0);

    const orderedBetter =
      score > bestScore ||
      (score === bestScore &&
        DIRECTION_ORDER.indexOf(candidate.direction) < DIRECTION_ORDER.indexOf(best));

    if (orderedBetter) {
      bestScore = score;
      best = candidate.direction;
    }
  }

  return best;
}

export interface ScriptedDecision {
  junction: { x: number; y: number };
  direction: Direction;
}

/** Replays a recorded session without touching the network (tests and replay). */
export function createScriptedProvider(script: readonly ScriptedDecision[]): DecisionProvider {
  let index = 0;
  return {
    name: "SCRIPTED",
    async decide(request) {
      const entry =
        script.find((candidate) => {
          const junction = request.observation.targetJunction.tile;
          return candidate.junction.x === junction.x && candidate.junction.y === junction.y;
        }) ?? script[Math.min(index++, script.length - 1)];
      const direction = request.legalDirections.includes(entry.direction)
        ? entry.direction
        : request.legalDirections[0];
      return answer(request, direction, "SCRIPTED");
    },
  };
}

/** Wraps a provider so every answer takes `latencyMs`: used to rehearse slow answers. */
export function withLatency(provider: DecisionProvider, latencyMs: number): DecisionProvider {
  return {
    name: provider.name,
    async decide(request, signal) {
      const started = Date.now();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, latencyMs);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
      const result = await provider.decide(request, signal);
      return { ...result, latencyMs: Date.now() - started };
    },
  };
}
