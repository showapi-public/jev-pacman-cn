/**
 * Live smoke test: the only test that talks to TypeSafe.
 *
 * It builds a real question out of a real game and calls the app's own
 * /api/decide handler, so the whole chain — the driver's observation and fact
 * table, the prompt assembly, the SDK, answer validation — is exercised end to
 * end. It skips itself when no API key is set, which is why `npm test` needs no
 * secret.
 */

import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/decide/route";
import type { DecisionPoint } from "@/lib/agent/types";
import { PACMAN_DRIVER } from "@/lib/games/pacman/agent";
import { createGame, startGame, stepGame } from "@/lib/games/pacman/engine";
import { PACMAN_META } from "@/lib/games/pacman/meta";
import { FIXED_DT_MS } from "@/lib/games/pacman/types";

const hasKey = Boolean(process.env.TYPESAFE_API_KEY?.trim());

describe.skipIf(!hasKey)("live Jev", () => {
  it("answers with one of the legal actions for a real game state", async () => {
    const state = createGame({ seed: 42 });
    startGame(state);

    // Walk to the first junction on Pac-Man's path.
    let point: DecisionPoint | null = null;
    for (let tick = 0; tick < 60 * 20 && !point; tick += 1) {
      stepGame(state, FIXED_DT_MS);
      point = PACMAN_DRIVER.decision(state);
    }

    expect(point).not.toBeNull();
    if (!point) return;

    expect(point.actions.length).toBeGreaterThanOrEqual(2);

    const question = PACMAN_DRIVER.frame(state, point);
    const observation = PACMAN_DRIVER.observe({ state, point, recent: [] });

    const request = new Request("http://localhost/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisionId: "live-1",
        game: PACMAN_META.id,
        state: observation,
        actions: point.actions,
        instructions: question.instructions,
        facts: question.facts,
      }),
    });

    const started = Date.now();
    const response = await POST(request as never);
    const body = (await response.json()) as Record<string, unknown>;
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    expect(typeof body.action).toBe("string");
    expect(point.actions).toContain(body.action);
    expect(typeof body.latencyMs).toBe("number");
    expect(typeof body.model).toBe("string");

    console.log(
      `[live] junction (${point.at?.x}, ${point.at?.y}) legal ${point.actions.join("/")} -> ` +
        `${String(body.action)} in ${Math.round(body.latencyMs as number)} ms ` +
        `(round trip ${elapsed} ms, model ${String(body.model)}, confidence ${String(body.confidence)})`,
    );
  }, 30_000);

  it("refuses to invent an action for a made-up question", async () => {
    const request = new Request("http://localhost/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionId: "live-2", state: { objective: "nowhere" }, actions: [] }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  }, 30_000);
});
