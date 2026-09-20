import { describe, expect, it } from "vitest";

import { AgentController } from "@/lib/agent/controller";
import { createHeuristicProvider, createRandomProvider } from "@/lib/agent/providers";
import type { DecisionProvider } from "@/lib/agent/types";
import { createGame, startGame, stepGame } from "@/lib/game/engine";
import { DIRECTION_ORDER, FIXED_DT_MS, tileOf } from "@/lib/game/types";
import { VirtualClock, flush, virtualLatencyProvider } from "./helpers";

/** Latencies to rehearse: fast, ordinary, slow, and slower than the timeout. */
const LATENCIES = [0, 100, 300, 700, 1600];
const TICKS = 60 * 45;

function checkWorld(state: ReturnType<typeof createGame>, violations: string[], tick: number): void {
  const occupied = tileOf(state.pacman.position);
  if (!state.maze.isPacmanWalkable(occupied.x, occupied.y)) violations.push(`tick ${tick}: Pac-Man inside a wall`);
  if (!Number.isFinite(state.pacman.position.x) || !Number.isFinite(state.pacman.position.y)) {
    violations.push(`tick ${tick}: Pac-Man position is NaN`);
  }
  if (!DIRECTION_ORDER.includes(state.pacman.direction)) violations.push(`tick ${tick}: bad Pac-Man direction`);

  for (const ghost of state.ghosts) {
    if (!Number.isFinite(ghost.position.x) || !Number.isFinite(ghost.position.y)) {
      violations.push(`tick ${tick}: ${ghost.name} position is NaN`);
    }
    const tile = tileOf(ghost.position);
    if (!state.maze.isGhostWalkable(tile.x, tile.y)) violations.push(`tick ${tick}: ${ghost.name} inside a wall`);
  }
}

describe("slow answers", () => {
  for (const latency of LATENCIES) {
    it(`keeps playing through ${latency} ms answers`, async () => {
      const clock = new VirtualClock();
      const provider = virtualLatencyProvider(clock, latency);
      const controller = new AgentController({
        provider,
        now: clock.now,
        scheduleTimeout: clock.scheduleTimeout,
      });
      const state = createGame({ seed: 5 });
      startGame(state);

      const violations: string[] = [];
      for (let tick = 0; tick < TICKS; tick += 1) {
        controller.tick(state);
        stepGame(state, FIXED_DT_MS);
        await flush(4);
        clock.advance(FIXED_DT_MS);
        await flush(4);
        checkWorld(state, violations, tick);
      }

      expect(violations.slice(0, 5)).toEqual([]);

      const records = controller.snapshot().telemetry;
      expect(records.length).toBeGreaterThan(3);
      for (const record of records) {
        expect(["APPLIED", "STALE", "TIMEOUT", "ERROR", "INVALID", "PENDING"]).toContain(record.status);
      }

      if (latency <= 300) {
        expect(records.filter((record) => record.status === "APPLIED").length).toBeGreaterThan(0);
        expect(records.filter((record) => record.status === "TIMEOUT")).toHaveLength(0);
      }
      if (latency >= 700) {
        // Too slow to answer in time: the game must have moved on without it.
        expect(records.filter((record) => record.status !== "APPLIED").length).toBeGreaterThan(0);
      }
      if (latency > 1500) {
        // Slower even than the timeout: nothing Jev says can land in time, so
        // every junction is played by the fallback and every answer is dropped.
        const dropped = records.filter((record) => record.status === "STALE" || record.status === "TIMEOUT");
        expect(dropped.length).toBeGreaterThan(0);
        expect(records.filter((record) => record.source === "JEV" && record.status === "APPLIED")).toHaveLength(0);
        expect(records.filter((record) => record.source === "FALLBACK").length).toBeGreaterThan(0);
      }

      expect(state.status === "PLAYING" || state.status === "GAME_OVER").toBe(true);
    }, 60_000);
  }
});

describe("long run", () => {
  it("holds every invariant for 10,000 ticks of a seeded random player", async () => {
    const provider = createRandomProvider(11);
    const controller = new AgentController({
      provider,
      now: () => 0,
      // The random player answers instantly, so no timeout ever fires.
      scheduleTimeout: () => () => {},
    });
    const state = createGame({ seed: 11 });
    state.lives = 99; // ten thousand ticks of play, not ten thousand ticks of game over
    startGame(state);

    const violations: string[] = [];
    for (let tick = 0; tick < 10_000; tick += 1) {
      controller.tick(state);
      stepGame(state, FIXED_DT_MS);
      await flush(1);
      checkWorld(state, violations, tick);
      if (state.score < 0) violations.push(`tick ${tick}: negative score`);
    }

    expect(violations.slice(0, 5)).toEqual([]);
    expect(state.tick).toBe(10_000);
    expect(state.pelletsEaten).toBeGreaterThan(0);
    expect(state.score).toBeGreaterThan(0);
    expect(Number.isFinite(state.playTimeMs)).toBe(true);
    expect(controller.snapshot().telemetry.length).toBeGreaterThan(0);
  }, 120_000);

  it("runs the baselines on the same seed without surprises", async () => {
    const play = async (provider: DecisionProvider, ticks: number) => {
      const controller = new AgentController({
        provider,
        now: () => 0,
        scheduleTimeout: () => () => {},
      });
      const state = createGame({ seed: 3 });
      startGame(state);
      for (let tick = 0; tick < ticks; tick += 1) {
        controller.tick(state);
        stepGame(state, FIXED_DT_MS);
        await flush(1);
      }
      return { state, records: controller.snapshot().telemetry };
    };

    const random = await play(createRandomProvider(3), 3000);
    const heuristic = await play(createHeuristicProvider(), 3000);

    expect(random.state.pelletsEaten).toBeGreaterThan(0);
    expect(heuristic.state.pelletsEaten).toBeGreaterThan(0);
    expect(random.records.some((record) => record.status === "APPLIED")).toBe(true);
    expect(heuristic.records.some((record) => record.status === "APPLIED")).toBe(true);
    expect(
      heuristic.state.pelletsEaten,
      "the heuristic baseline should not lose to random on the same seed",
    ).toBeGreaterThanOrEqual(random.state.pelletsEaten);
  }, 60_000);
});
