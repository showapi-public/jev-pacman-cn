/**
 * Live smoke test: the only test that talks to TypeSafe.
 *
 * It builds a real observation out of a real game and calls the app's own
 * /api/decide handler, so the whole chain — observation, prompt, SDK, answer
 * validation — is exercised end to end. It skips itself when no API key is set,
 * which is why `npm test` needs no secret.
 */

import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/decide/route";
import { buildObservation } from "@/lib/agent/observation";
import { analyzeCandidates } from "@/lib/game/analysis";
import { createGame, startGame, stepGame } from "@/lib/game/engine";
import { findNextDecisionPoint, getMeaningfulDirections } from "@/lib/game/pathfinding";
import type { Direction, TilePosition } from "@/lib/game/types";
import { FIXED_DT_MS } from "@/lib/game/types";
import { isDirection } from "@/lib/jev/validation";

const hasKey = Boolean(process.env.TYPESAFE_API_KEY?.trim());

describe.skipIf(!hasKey)("live Jev", () => {
  it("answers with one of the legal directions for a real game state", async () => {
    const state = createGame({ seed: 42 });
    startGame(state);

    // Walk to the first junction on Pac-Man's path.
    let junction: TilePosition | null = null;
    let heading: Direction = "LEFT";
    for (let tick = 0; tick < 60 * 20 && !junction; tick += 1) {
      stepGame(state, FIXED_DT_MS);
      const point = findNextDecisionPoint(state.maze, state.pacman.tile, state.pacman.direction);
      if (point) {
        junction = point.junction;
        heading = point.heading;
      }
    }

    expect(junction).not.toBeNull();
    if (!junction) return;

    const legalDirections = getMeaningfulDirections(state.maze, junction, heading);
    expect(legalDirections.length).toBeGreaterThanOrEqual(2);

    const observation = buildObservation({
      state,
      junction,
      heading,
      legalDirections,
      candidates: analyzeCandidates(state, junction, heading, legalDirections),
      recentDecisions: [],
    });

    const request = new Request("http://localhost/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionId: "live-1", observation, legalDirections }),
    });

    const started = Date.now();
    const response = await POST(request as never);
    const body = (await response.json()) as Record<string, unknown>;
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    expect(isDirection(body.direction)).toBe(true);
    expect(legalDirections).toContain(body.direction);
    expect(typeof body.latencyMs).toBe("number");
    expect(typeof body.model).toBe("string");

    console.log(
      `[live] junction (${junction.x}, ${junction.y}) legal ${legalDirections.join("/")} -> ` +
        `${String(body.direction)} in ${Math.round(body.latencyMs as number)} ms ` +
        `(round trip ${elapsed} ms, model ${String(body.model)}, confidence ${String(body.confidence)})`,
    );
  }, 30_000);

  it("refuses to invent a direction for a made-up state", async () => {
    const request = new Request("http://localhost/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionId: "live-2", observation: { objective: "nowhere" }, legalDirections: [] }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  }, 30_000);
});
