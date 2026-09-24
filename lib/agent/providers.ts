/**
 * Decision providers other than the model.
 *
 * These exist to test the game and to compare against the model's choices. They
 * are never wired into model mode: the only thing that may stand in for the
 * model at a decision point is the fallback, which is logged and dumb on purpose.
 *
 * Nothing here knows a game. The random player only needs the legal actions; the
 * scripted player only needs the decision point key; the heuristic player is
 * game code, so the shell hands it over as a pair of functions (see
 * `HeuristicBinding`) rather than this file importing a game.
 */

import type { ActionId, DecideRequest, DecisionProvider, DecisionResult, GameState } from "./types";
import { nextRandom } from "../rng";

function answer(
  request: DecideRequest,
  action: ActionId,
  source: DecisionResult["source"],
  probabilities: Partial<Record<ActionId, number>> = {},
): DecisionResult {
  return {
    decisionId: request.decisionId,
    action,
    confidence: null,
    probabilities,
    latencyMs: 0,
    model: null,
    source,
  };
}

/** Picks a legal action with a seeded RNG: the baseline that says "is the model better than chance?". */
export function createRandomProvider(seed = 1): DecisionProvider {
  let state = seed >>> 0 || 1;
  return {
    name: "RANDOM",
    async decide(request) {
      const draw = nextRandom(state);
      state = draw.state;
      const index = Math.min(request.actions.length - 1, Math.floor(draw.value * request.actions.length));
      return answer(request, request.actions[index], "RANDOM");
    },
  };
}

/**
 * What the shell must hand over for the heuristic player to exist.
 *
 * A reference player has to see the live position, and a `DecideRequest` only
 * carries the observation the model is shown — deliberately, since the panel and
 * the model read the same object and neither is the world. So the shell supplies
 * the two things the agent layer cannot have: a way to read the position, and the
 * game's own chooser.
 */
export interface HeuristicBinding<S extends GameState> {
  /** The live position, or null before the game exists. */
  state(): S | null;
  /** The game's own hand-weighted chooser. */
  choose(state: S, actions: readonly ActionId[]): ActionId;
}

/**
 * A deterministic player built from hand-picked weights: the yardstick the model
 * is measured against. Weights are chosen, not learned.
 *
 * It falls back to the first legal action if the position has gone, which is the
 * same "do something legal" guarantee every provider owes the controller.
 */
export function createHeuristicProvider<S extends GameState>(binding: HeuristicBinding<S>): DecisionProvider {
  return {
    name: "HEURISTIC",
    async decide(request) {
      const state = binding.state();
      const action = state ? binding.choose(state, request.actions) : request.actions[0];
      return answer(request, request.actions.includes(action) ? action : request.actions[0], "HEURISTIC");
    },
  };
}

export interface ScriptedDecision {
  /** `DecisionPoint.key` of the decision to answer. */
  pointKey: string;
  action: ActionId;
}

/**
 * Replays a recorded session without touching the network (tests and replay).
 *
 * Keyed on the decision point, not on a tile: a game may ask at the same tile
 * twice in one epoch, and a replay has to answer the same question twice in a row
 * as well as it answers two different ones.
 */
export function createScriptedProvider(script: readonly ScriptedDecision[]): DecisionProvider {
  let index = 0;
  return {
    name: "SCRIPTED",
    async decide(request) {
      const entry =
        script.find((candidate) => candidate.pointKey === request.pointKey) ??
        script[Math.min(index++, script.length - 1)];
      const action = entry && request.actions.includes(entry.action) ? entry.action : request.actions[0];
      return answer(request, action, "SCRIPTED");
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
