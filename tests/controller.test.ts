import { describe, expect, it } from "vitest";

import { AgentController } from "@/lib/agent/controller";
import { computeMetrics } from "@/lib/agent/telemetry";
import { respawnActors, startGame, stepGame } from "@/lib/games/pacman/engine";
import { FIXED_DT_MS, tileOf } from "@/lib/games/pacman/types";
import { ManualProvider, flush, keepPellets, miniGame, placePacman, tile, virtualLatencyProvider, VirtualClock } from "./helpers";

/**
 * The controller's contract, played out tick by tick: ask early, hold the
 * answer, apply it at the junction, and stay out of the game loop's way.
 */

interface RunOptions {
  ticks?: number;
  onTick?: (tick: number) => Promise<void> | void;
  stopWhen?: () => boolean;
}

async function run(controller: AgentController, state: ReturnType<typeof miniGame>, options: RunOptions = {}): Promise<number> {
  const ticks = options.ticks ?? 400;
  for (let tick = 0; tick < ticks; tick += 1) {
    controller.tick(state);
    stepGame(state, FIXED_DT_MS);
    await options.onTick?.(tick);
    if (options.stopWhen?.()) return tick;
  }
  return ticks;
}

function approachingJunction(provider: ManualProvider, state: ReturnType<typeof miniGame>): boolean {
  return provider.pending > 0 && state.pacman.tile.x === 1 && state.pacman.tile.y === 4;
}

describe("agent controller", () => {
  it("asks once, holds the answer, and applies it at the junction", async () => {
    const state = miniGame();
    keepPellets(state, []);
    placePacman(state, 2, 1, "LEFT"); // the walk leads through (1, 1) to the junction (1, 4)
    startGame(state);

    const provider = new ManualProvider();
    const controller = new AgentController({ provider });

    let responded = false;
    const turns: { x: number; y: number }[] = [];

    await run(controller, state, {
      onTick: async () => {
        if (!responded && provider.pending > 0) {
          responded = true;
          provider.respond("RIGHT");
          await provider.settle();
        }
        if (turns.length === 0 && state.pacman.direction === "RIGHT") {
          turns.push({ x: state.pacman.position.x, y: state.pacman.position.y });
        }
      },
      stopWhen: () => turns.length > 0,
    });

    expect(responded).toBe(true);
    expect(provider.calls).toHaveLength(1);

    const [record] = controller.snapshot().telemetry;
    expect(record.status).toBe("APPLIED");
    expect(record.choice).toBe("RIGHT");
    expect(record.junction).toEqual(tile(1, 4));
    expect(record.source).toBe("JEV");

    // Applied at the junction centre, not a tile earlier.
    expect(turns[0]?.x).toBeCloseTo(1.5, 6);
    expect(turns[0]?.y).toBeCloseTo(4.5, 6);

    const metrics = computeMetrics(controller.snapshot().telemetry, state);
    expect(metrics.requests).toBe(1);
    expect(metrics.applied).toBe(1);
    expect(metrics.fallbacks).toBe(0);
    expect(metrics.appliedRate).toBe(1);
  });

  it("never stops the game while it waits", async () => {
    const state = miniGame();
    keepPellets(state, []);
    placePacman(state, 2, 1, "LEFT");
    startGame(state);

    const provider = new ManualProvider();
    const controller = new AgentController({ provider });
    const positions: string[] = [];

    await run(controller, state, {
      onTick: () => {
        if (provider.pending > 0) {
          positions.push(`${state.pacman.position.x.toFixed(2)},${state.pacman.position.y.toFixed(2)}`);
        }
      },
      stopWhen: () => positions.length > 5,
    });

    // The answer is still in flight, and Pac-Man has kept moving regardless.
    expect(provider.pending).toBe(1);
    expect(new Set(positions).size).toBeGreaterThanOrEqual(4);
    expect(state.status).toBe("PLAYING");
  });

  it("falls back when the junction arrives before the answer", async () => {
    const state = miniGame();
    keepPellets(state, []);
    placePacman(state, 2, 1, "LEFT"); // arrives at (1, 4) heading DOWN: keep heading is DOWN
    startGame(state);

    const provider = new ManualProvider();
    const controller = new AgentController({ provider });

    const fallbackSeen = { value: false };
    await run(controller, state, {
      onTick: () => {
        if (controller.snapshot().telemetry.some((record) => record.source === "FALLBACK")) fallbackSeen.value = true;
      },
      stopWhen: () => fallbackSeen.value,
    });

    expect(fallbackSeen.value).toBe(true);
    expect(provider.calls).toHaveLength(1);

    const records = controller.snapshot().telemetry;
    const jevRecord = records.find((record) => record.source === "JEV");
    const fallbackRecord = records.find((record) => record.source === "FALLBACK");

    expect(jevRecord?.status).toBe("STALE");
    expect(jevRecord?.note).toContain("抵达路口");
    expect(fallbackRecord?.applied).toBe("DOWN");
    expect(fallbackRecord?.note).toBe("保持当前朝向");
    expect(state.pacman.direction).toBe("DOWN");
    expect(state.status).toBe("PLAYING");
  });

  it("throws away an answer that arrives after the fallback", async () => {
    const state = miniGame();
    keepPellets(state, []);
    placePacman(state, 2, 1, "LEFT");
    startGame(state);

    const provider = new ManualProvider();
    const controller = new AgentController({ provider });

    await run(controller, state, {
      stopWhen: () => controller.snapshot().telemetry.some((record) => record.source === "FALLBACK"),
    });

    provider.respond("RIGHT"); // far too late to matter
    await provider.settle();
    await run(controller, state, { ticks: 60 });

    const records = controller.snapshot().telemetry;
    const jevRecord = records.find((record) => record.source === "JEV");
    expect(jevRecord?.status).toBe("STALE");
    expect(jevRecord?.choice).toBe("RIGHT"); // recorded, but never applied
    expect(jevRecord?.applied).toBeNull();
    expect(records.some((record) => record.status === "APPLIED" && record.source === "JEV")).toBe(false);
  });

  it("refuses an answer that is not one of the legal directions", async () => {
    const state = miniGame();
    keepPellets(state, []);
    placePacman(state, 2, 1, "LEFT"); // at (1, 4): DOWN and RIGHT are the choices, never UP
    startGame(state);

    const provider = new ManualProvider();
    const controller = new AgentController({ provider });

    let rejected = false;
    await run(controller, state, {
      onTick: async () => {
        if (!rejected && provider.pending > 0) {
          rejected = true;
          provider.respond("UP");
          await provider.settle();
        }
      },
      stopWhen: () => controller.snapshot().telemetry.some((record) => record.source === "FALLBACK"),
    });

    const records = controller.snapshot().telemetry;
    const jevRecord = records.find((record) => record.source === "JEV");
    expect(jevRecord?.status).toBe("INVALID");
    expect(jevRecord?.note).toContain("合法方向");
    expect(jevRecord?.applied).toBeNull();
    expect(records.some((record) => record.source === "FALLBACK")).toBe(true);
    expect(state.pacman.direction).toBe("DOWN");
  });

  it("keeps playing when the provider fails", async () => {
    const state = miniGame();
    keepPellets(state, []);
    placePacman(state, 2, 1, "LEFT");
    startGame(state);

    const provider = new ManualProvider();
    const controller = new AgentController({ provider });

    let failed = false;
    await run(controller, state, {
      onTick: async () => {
        if (!failed && provider.pending > 0) {
          failed = true;
          provider.fail("connection reset", "connection");
          await provider.settle();
        }
      },
      stopWhen: () => controller.snapshot().telemetry.some((record) => record.source === "FALLBACK"),
    });

    const snapshot = controller.snapshot();
    expect(snapshot.lastError?.kind).toBe("connection");
    expect(snapshot.telemetry.find((record) => record.source === "JEV")?.status).toBe("ERROR");
    expect(snapshot.telemetry.some((record) => record.source === "FALLBACK")).toBe(true);
    expect(state.status).toBe("PLAYING");

    await run(controller, state, { ticks: 120 });
    expect(state.status === "PLAYING" || state.status === "GAME_OVER").toBe(true);
  });

  it("reports a missing API key instead of crashing", async () => {
    const state = miniGame();
    placePacman(state, 2, 1, "LEFT");
    startGame(state);

    const provider: ManualProvider = new ManualProvider();
    const controller = new AgentController({ provider });

    await run(controller, state, {
      onTick: async () => {
        if (provider.pending > 0) {
          provider.fail("TYPESAFE_API_KEY is not set (see .env.example)", "no_api_key");
          await provider.settle();
        }
      },
      ticks: 60,
    });

    expect(controller.snapshot().apiKeyMissing).toBe(true);
    expect(controller.snapshot().status).toBe("OFFLINE");
    expect(state.status).toBe("PLAYING");
  });

  it("drops anything still in flight when the game epoch changes", async () => {
    const state = miniGame();
    keepPellets(state, []);
    placePacman(state, 2, 1, "LEFT");
    startGame(state);

    const provider = new ManualProvider();
    const controller = new AgentController({ provider });

    await run(controller, state, { stopWhen: () => provider.pending > 0 });
    expect(provider.calls).toHaveLength(1);

    respawnActors(state); // models a death: the epoch moves on
    provider.respond("RIGHT");
    await provider.settle();
    controller.tick(state);

    expect(state.pacman.requestedDirection).toBeNull();
    expect(controller.snapshot().telemetry[0].status).toBe("STALE");
    expect(controller.snapshot().telemetry[0].applied).toBeNull();
  });

  it("asks nothing at all in manual mode", async () => {
    const state = miniGame();
    placePacman(state, 2, 1, "LEFT");
    startGame(state);

    const controller = new AgentController({ provider: null });
    await run(controller, state, { ticks: 200 });

    expect(controller.snapshot().status).toBe("MANUAL");
    expect(controller.snapshot().telemetry).toHaveLength(0);
    // It still tracks the junction Pac-Man is heading for, for the debug panel.
    expect(controller.snapshot().target?.junction).toBeDefined();
    expect(controller.snapshot().target?.legalDirections.length).toBeGreaterThanOrEqual(2);
  });

  it("gives up on a decision that times out while Pac-Man is still far away", async () => {
    const state = miniGame();
    keepPellets(state, [[11, 7]]);
    placePacman(state, 2, 1, "LEFT"); // junction (1, 4) is four tiles away
    startGame(state);

    const clock = new VirtualClock();
    const provider = virtualLatencyProvider(clock, 60_000);
    const controller = new AgentController({
      provider,
      now: clock.now,
      scheduleTimeout: clock.scheduleTimeout,
      timeoutMs: 100, // far shorter than the three tiles left to travel
    });

    for (let tick = 0; tick < 25; tick += 1) {
      controller.tick(state);
      stepGame(state, FIXED_DT_MS);
      await flush(2);
      clock.advance(FIXED_DT_MS);
      await flush(2);
    }

    const [record] = controller.snapshot().telemetry;
    expect(record.status).toBe("TIMEOUT");
    expect(record.applied).toBeNull();
    expect(controller.snapshot().lastError?.kind).toBe("timeout");
    expect(state.status).toBe("PLAYING");
    expect(state.pacman.tile).not.toEqual(tile(1, 4)); // the junction is still ahead
  });
});
