import { describe, expect, it } from "vitest";

import { AgentController } from "@/lib/agent/controller";
import { computeMetrics, decisionWindowMs } from "@/lib/agent/telemetry";
import type { DecisionProvider } from "@/lib/agent/types";
import {
  FAKE_ACTIONS,
  FAKE_BUDGET_MS,
  FAKE_COMMIT_WINDOW,
  FAKE_DRIVER,
  FAKE_GATE_INTERVAL,
  FAKE_INSTRUCTIONS,
  FAKE_PREFETCH,
  ManualProvider,
  VirtualClock,
  fakeGame,
  flush,
  stepFake,
  virtualLatencyProvider,
} from "./helpers";
import type { FakeState } from "./helpers";

/**
 * The controller's contract, played out tick by tick: ask early, hold the
 * answer, apply it at the decision point, and stay out of the game loop's way.
 *
 * It is exercised against `FAKE_DRIVER`, a game with one dimension and no
 * Pac-Man in it. That is the point of the refactor: if the controller's own
 * tests needed a junction and a ghost, the "the controller knows no game" claim
 * would be untestable. Pac-Man's side of the seam is covered by
 * `pacman-driver.test.ts`, and the two together by `integration.test.ts`.
 */

const GAME_ID = "fake";

function makeController(options: {
  provider: DecisionProvider | null;
  clock?: VirtualClock;
  speed?: number;
  timeoutMs?: number;
}): AgentController<FakeState> {
  return new AgentController<FakeState>({
    driver: FAKE_DRIVER,
    game: GAME_ID,
    provider: options.provider,
    speed: options.speed,
    now: options.clock?.now,
    scheduleTimeout: options.clock?.scheduleTimeout,
    timeoutMs: options.timeoutMs,
  });
}

interface RunOptions {
  ticks?: number;
  onTick?: (tick: number) => Promise<void> | void;
  stopWhen?: () => boolean;
}

/** One fixed step of the game, immediately preceded by one of the controller. */
async function run(
  controller: AgentController<FakeState>,
  state: FakeState,
  options: RunOptions = {},
): Promise<number> {
  const ticks = options.ticks ?? 400;
  for (let tick = 0; tick < ticks; tick += 1) {
    controller.tick(state);
    stepFake(state);
    await options.onTick?.(tick);
    if (options.stopWhen?.()) return tick;
  }
  return ticks;
}

function records(controller: AgentController<FakeState>) {
  return controller.snapshot().telemetry;
}

function countFallbacks(controller: AgentController<FakeState>): number {
  return records(controller).filter((record) => record.source === "FALLBACK").length;
}

describe("agent controller", () => {
  it("asks once, holds the answer, and applies it at the decision point", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });

    let responded = false;
    await run(controller, state, {
      onTick: async () => {
        if (!responded && provider.pending > 0) {
          responded = true;
          provider.respond("C");
          await provider.settle();
        }
      },
      stopWhen: () => state.applied !== null,
    });

    expect(responded).toBe(true);
    expect(provider.calls).toHaveLength(1);

    const [record] = records(controller);
    expect(record.status).toBe("APPLIED");
    expect(record.choice).toBe("C");
    expect(record.applied).toBe("C");
    expect(record.pointKey).toBe("1:g0");
    expect(record.at).toEqual({ x: 0, y: 0 });
    expect(record.legalActions).toEqual([...FAKE_ACTIONS]);
    expect(record.source).toBe("JEV");
    expect(record.model).toBe("fake");

    // Applied on the gate, not a tile earlier: the run stops on the tick the
    // action landed, and that tick began with one step left to the gate.
    expect(state.applied).toBe("C");
    expect(state.gates).toBe(0);
    expect(state.distance).toBe(0);

    const metrics = computeMetrics(records(controller));
    expect(metrics.requests).toBe(1);
    expect(metrics.applied).toBe(1);
    expect(metrics.fallbacks).toBe(0);
    expect(metrics.appliedRate).toBe(1);
  });

  it("never stops the game while it waits", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });
    const distances: number[] = [];

    await run(controller, state, {
      onTick: () => {
        if (provider.pending > 0) distances.push(state.distance);
      },
      stopWhen: () => distances.length > 5,
    });

    // The answer is still in flight, and the walk has kept going regardless.
    expect(provider.pending).toBe(1);
    expect(new Set(distances).size).toBeGreaterThanOrEqual(4);
    expect(state.status).toBe("PLAYING");
  });

  it("falls back when the gate arrives before the answer", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });

    await run(controller, state, { stopWhen: () => countFallbacks(controller) > 0 });

    expect(provider.calls).toHaveLength(1);

    const jevRecord = records(controller).find((record) => record.source === "JEV");
    const fallbackRecord = records(controller).find((record) => record.source === "FALLBACK");

    expect(jevRecord?.status).toBe("STALE");
    expect(jevRecord?.note).toContain("抵达");
    expect(fallbackRecord?.applied).toBe("B");
    expect(fallbackRecord?.note).toBe("假游戏兜底");
    expect(state.applied).toBe("B");
    expect(state.status).toBe("PLAYING");
  });

  it("throws away an answer that arrives after the fallback", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });

    await run(controller, state, { stopWhen: () => countFallbacks(controller) > 0 });

    provider.respond("C"); // far too late to matter
    await provider.settle();
    await run(controller, state, { ticks: 20 });

    const jevRecord = records(controller).find((record) => record.source === "JEV");
    expect(jevRecord?.status).toBe("STALE");
    expect(jevRecord?.choice).toBe("C"); // recorded, but never applied
    expect(jevRecord?.applied).toBeNull();
    expect(records(controller).some((record) => record.status === "APPLIED" && record.source === "JEV")).toBe(false);
  });

  it("refuses an answer that is not one of the legal actions", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });

    let rejected = false;
    await run(controller, state, {
      onTick: async () => {
        if (!rejected && provider.pending > 0) {
          rejected = true;
          provider.respond("Z");
          await provider.settle();
        }
      },
      stopWhen: () => countFallbacks(controller) > 0,
    });

    const jevRecord = records(controller).find((record) => record.source === "JEV");
    expect(jevRecord?.status).toBe("INVALID");
    expect(jevRecord?.note).toContain("合法动作");
    expect(jevRecord?.applied).toBeNull();
    expect(state.applied).toBe("B");
  });

  it("keeps playing when the provider fails", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });

    let failed = false;
    await run(controller, state, {
      onTick: async () => {
        if (!failed && provider.pending > 0) {
          failed = true;
          provider.fail("connection reset", "connection");
          await provider.settle();
        }
      },
      stopWhen: () => countFallbacks(controller) > 0,
    });

    const snapshot = controller.snapshot();
    expect(snapshot.lastError?.kind).toBe("connection");
    expect(snapshot.telemetry.find((record) => record.source === "JEV")?.status).toBe("ERROR");
    expect(countFallbacks(controller)).toBeGreaterThan(0);
    expect(state.status).toBe("PLAYING");

    await run(controller, state, { ticks: 40 });
    expect(state.status).toBe("PLAYING");
  });

  it("reports a missing API key instead of crashing", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });

    await run(controller, state, {
      onTick: async () => {
        if (provider.pending > 0) {
          provider.fail("TYPESAFE_API_KEY is not set (see .env.example)", "no_api_key");
          await provider.settle();
        }
      },
      ticks: 20,
    });

    expect(controller.snapshot().apiKeyMissing).toBe(true);
    expect(controller.snapshot().status).toBe("OFFLINE");
    expect(state.status).toBe("PLAYING");
  });

  it("drops anything still in flight when the game epoch changes", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });

    await run(controller, state, { stopWhen: () => provider.pending > 0 });
    expect(provider.calls).toHaveLength(1);

    state.epoch += 1; // models a death: the world has been replaced
    provider.respond("C");
    await provider.settle();
    controller.tick(state);

    expect(state.applied).toBeNull();
    expect(records(controller)[0].status).toBe("STALE");
    expect(records(controller)[0].applied).toBeNull();
  });

  it("asks nothing at all in manual mode", async () => {
    const state = fakeGame();
    const controller = makeController({ provider: null });

    await run(controller, state, { ticks: 60 });

    expect(controller.snapshot().status).toBe("MANUAL");
    expect(records(controller)).toHaveLength(0);
    // It still tracks the decision point ahead, for the debug panel.
    const target = controller.snapshot().target;
    expect(target).not.toBeNull();
    expect(target?.at).not.toBeNull();
    expect(target?.actions.length).toBeGreaterThanOrEqual(2);
  });

  it("puts the game id, the legal actions and the point key in every request", async () => {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider });

    await run(controller, state, { stopWhen: () => provider.calls.length > 0 });

    const request = provider.calls[0];
    expect(request.game).toBe(GAME_ID);
    expect(request.pointKey).toBe("1:g0");
    expect(request.actions).toEqual([...FAKE_ACTIONS]);
    expect(request.instructions).toBe(FAKE_INSTRUCTIONS);
    expect(request.facts.map((row) => row.modelLabel)).toEqual(["Distance to gate"]);
    expect(request.state).toEqual({ gate: 0, distance: 3 });
  });

  it("waits once on the gate, then commits when the window closes", async () => {
    const state = fakeGame();
    const provider = new ManualProvider(); // never answers
    const controller = makeController({ provider });

    // Read the position *at the moment the controller saw it*, before the step.
    const seen: { distance: number; arriving: boolean; fallbacks: number }[] = [];
    for (let tick = 0; tick < 40; tick += 1) {
      controller.tick(state);
      const point = controller.snapshot().target;
      seen.push({ distance: state.distance, arriving: point?.arriving ?? false, fallbacks: countFallbacks(controller) });
      if (countFallbacks(controller) > 0) break;
      stepFake(state);
    }

    const arriving = seen.filter((frame) => frame.arriving);
    expect(arriving.length).toBeGreaterThanOrEqual(2);
    // Half a tile out: on the gate, but not yet out of time.
    expect(arriving[0].distance).toBeGreaterThan(FAKE_COMMIT_WINDOW);
    expect(arriving[0].fallbacks).toBe(0);
    // At the gate centre: the commit window has closed and the fallback fired.
    expect(arriving.at(-1)?.distance).toBeLessThanOrEqual(FAKE_COMMIT_WINDOW);
    expect(arriving.at(-1)?.fallbacks).toBe(1);
  });

  it("gives up on a decision that times out while the walk is still far away", async () => {
    const state = fakeGame();
    const clock = new VirtualClock();
    const provider = virtualLatencyProvider(clock, 60_000);
    const controller = makeController({ provider, clock, timeoutMs: 100 });

    for (let tick = 0; tick < 10 && records(controller)[0]?.status !== "TIMEOUT"; tick += 1) {
      controller.tick(state);
      stepFake(state);
      await flush(2);
      clock.advance(50);
      await flush(2);
    }

    const [record] = records(controller);
    expect(record.status).toBe("TIMEOUT");
    expect(record.applied).toBeNull();
    expect(controller.snapshot().lastError?.kind).toBe("timeout");
    expect(state.status).toBe("PLAYING");
    expect(state.gates).toBe(0); // the gate is still ahead
    expect(state.applied).toBeNull();
  });
});

describe("the speed multiplier is not cosmetic", () => {
  /**
   * The distance the controller asked at is read back out of the request's own
   * fact table, so this is the position the game was in, not an inference.
   */
  async function askedAt(speed: number): Promise<number> {
    const state = fakeGame();
    const provider = new ManualProvider();
    const controller = makeController({ provider, speed });
    await run(controller, state, { stopWhen: () => provider.calls.length > 0 });

    const value = provider.calls[0]?.facts[0]?.values.A;
    if (value === undefined) throw new Error("the request carried no fact row");
    return Number(value);
  }

  it("asks `prefetch × speed` tiles early, so the wall-clock window holds", async () => {
    // At 1× the trigger point is the prefetch distance itself.
    expect(await askedAt(1)).toBe(FAKE_PREFETCH);
    // At 2× the game clock runs twice as fast, so the same *wall-clock* window
    // is twice as many tiles — the whole gate interval, asked on the first tick.
    expect(await askedAt(2)).toBe(FAKE_GATE_INTERVAL);
  });

  it("leaves the budget a driver declares alone: the speed compresses the window", () => {
    expect(FAKE_DRIVER.budgetMs).toBe(FAKE_BUDGET_MS);
    expect(decisionWindowMs(FAKE_DRIVER.budgetMs, 1)).toBe(500);
    expect(decisionWindowMs(FAKE_DRIVER.budgetMs, 2)).toBe(250);
    expect(decisionWindowMs(FAKE_DRIVER.budgetMs, 0.5)).toBe(1000);
  });
});
