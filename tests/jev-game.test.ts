/**
 * Live game: Jev plays a whole game, in real time, through the real route.
 *
 * It runs only when TYPESAFE_API_KEY is set. The simulation is paced to
 * wall-clock time so the answers have the same race against Pac-Man's driving
 * that they have in the browser; the whole session is written to
 * /tmp/jev-game-report.json for the record.
 */

import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/decide/route";
import { AgentController } from "@/lib/agent/controller";
import { computeMetrics } from "@/lib/agent/telemetry";
import { PACMAN_DRIVER } from "@/lib/games/pacman/agent";
import { createGame, startGame, stepGame } from "@/lib/games/pacman/engine";
import { PACMAN_META } from "@/lib/games/pacman/meta";
import { FIXED_DT_MS } from "@/lib/games/pacman/types";
import { createJevProvider } from "@/lib/jev/client";

const hasKey = Boolean(process.env.TYPESAFE_API_KEY?.trim());
const GAME_SECONDS = 45;
const TICKS = Math.round(GAME_SECONDS / (FIXED_DT_MS / 1000));

/** Routes the browser client at the Next route handler, in-process. */
const inProcessFetch: typeof fetch = async (input, init) =>
  (await POST(new Request(String(input), init as RequestInit))) as unknown as Response;

describe.skipIf(!hasKey)("live game", () => {
  it(`plays ${GAME_SECONDS} seconds with the real Jev`, async () => {
    const controller = new AgentController({
      driver: PACMAN_DRIVER,
      game: PACMAN_META.id,
      provider: createJevProvider("http://localhost/api/decide", inProcessFetch),
    });
    const state = createGame({ seed: 42 });
    startGame(state);

    const startedAt = Date.now();
    for (let tick = 0; tick < TICKS; tick += 1) {
      controller.tick(state);
      stepGame(state, FIXED_DT_MS);
      const target = startedAt + (tick + 1) * FIXED_DT_MS;
      const wait = target - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }

    const snapshot = controller.snapshot();
    const metrics = computeMetrics(snapshot.telemetry);
    const report = {
      seed: 42,
      game: PACMAN_META.id,
      gameSeconds: GAME_SECONDS,
      playTimeMs: state.playTimeMs,
      status: state.status,
      score: state.score,
      pelletsEaten: state.pelletsEaten,
      ghostsEaten: state.ghostsEaten,
      lives: state.lives,
      level: state.level,
      metrics,
      decisions: snapshot.telemetry.map((record) => ({
        decisionId: record.decisionId,
        pointKey: record.pointKey,
        at: record.at === null ? null : `(${record.at.x},${record.at.y})`,
        legal: record.legalActions.join("/"),
        model: record.model,
        choice: record.choice,
        applied: record.applied,
        source: record.source,
        status: record.status,
        latencyMs: record.latencyMs === null ? null : Math.round(record.latencyMs),
        confidence: record.confidence,
        probabilities: record.probabilities,
        note: record.note,
      })),
    };

    const { writeFileSync } = await import("node:fs");
    writeFileSync("/tmp/jev-game-report.json", JSON.stringify(report, null, 2));

    expect(metrics.requests).toBeGreaterThan(5);
    expect(metrics.applied).toBeGreaterThan(0);
    expect(state.status === "PLAYING" || state.status === "GAME_OVER").toBe(true);
    expect(state.score).toBeGreaterThan(0);

    console.log(
      `[live game] score ${state.score}, pellets ${state.pelletsEaten}, ghosts ${state.ghostsEaten}, ` +
        `lives ${state.lives}, level ${state.level} — Jev applied ${metrics.applied}/${metrics.requests} ` +
        `(fallbacks ${metrics.fallbacks}, stale ${metrics.stale}, mean ${Math.round(metrics.meanLatencyMs ?? 0)} ms)`,
    );
  }, 180_000);
});
