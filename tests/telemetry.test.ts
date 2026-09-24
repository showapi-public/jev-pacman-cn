import { describe, expect, it } from "vitest";

import { AgentController } from "@/lib/agent/controller";
import { computeMetrics, latencyHistogram, mean, overDeadlineCount, percentile } from "@/lib/agent/telemetry";
import type { DecisionTelemetry } from "@/lib/agent/types";
import { startGame, stepGame } from "@/lib/games/pacman/engine";
import {
  DECISION_DEADLINE_MS,
  DECISION_PREFETCH_TILES,
  FIXED_DT_MS,
  PACMAN_SPEED_TILES_PER_SEC,
} from "@/lib/games/pacman/types";
import { ManualProvider, flush, keepPellets, miniGame, placePacman, tile } from "./helpers";

/** A minimal record; only the fields an assertion reads need to be right. */
function record(overrides: Partial<DecisionTelemetry> = {}): DecisionTelemetry {
  return {
    decisionId: "d1",
    tick: 0,
    epoch: 1,
    junction: tile(1, 4),
    legalDirections: ["UP", "RIGHT"],
    requestedAt: 0,
    respondedAt: null,
    latencyMs: null,
    choice: null,
    applied: null,
    probabilities: {},
    confidence: null,
    source: "JEV",
    status: "PENDING",
    note: null,
    ...overrides,
  };
}

/** Which bucket a single latency lands in, by label. */
function bucketOf(latencyMs: number): string {
  const buckets = latencyHistogram([record({ latencyMs })]);
  const hit = buckets.find((bucket) => bucket.count > 0);
  if (!hit) throw new Error(`latency ${latencyMs} landed in no bucket`);
  return hit.label;
}

/**
 * Plays the mini maze until the controller has a request in flight, and leaves it
 * there. `now` is pinned and the timeout is a no-op: nothing answers in these
 * tests, so nothing should fire behind them either.
 */
async function untilRequestInFlight(provider: ManualProvider) {
  const state = miniGame();
  keepPellets(state, []);
  placePacman(state, 2, 1, "LEFT"); // the walk leads through (1, 1) to the junction (1, 4)
  startGame(state);

  const controller = new AgentController({
    provider,
    now: () => 0,
    scheduleTimeout: () => () => {},
  });

  for (let tick = 0; tick < 200 && provider.pending === 0; tick += 1) {
    controller.tick(state);
    stepGame(state, FIXED_DT_MS);
  }
  expect(provider.pending).toBe(1);

  return { controller, state };
}

describe("latency buckets", () => {
  it("puts each latency in the first bucket whose ceiling it is under", () => {
    expect(bucketOf(0)).toBe("<150");
    expect(bucketOf(149)).toBe("<150");
    expect(bucketOf(150)).toBe("150–300");
    expect(bucketOf(299)).toBe("150–300");
    expect(bucketOf(300)).toBe("300–500");
    expect(bucketOf(499)).toBe("300–500");
    // The edge that carries meaning: the deadline is 500, so 500 is already out.
    expect(bucketOf(500)).toBe("500–800");
    expect(bucketOf(799)).toBe("500–800");
    expect(bucketOf(800)).toBe("800–1200");
    expect(bucketOf(1199)).toBe("800–1200");
    expect(bucketOf(1200)).toBe("≥1200");
  });

  it("ignores records with no usable latency", () => {
    const buckets = latencyHistogram([
      record({ latencyMs: null }),
      record({ latencyMs: Number.NaN }),
      record({ latencyMs: Number.POSITIVE_INFINITY }),
      record({ latencyMs: 120 }),
    ]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1);
  });
});

describe("the deadline split", () => {
  it("follows from the prefetch distance and Pac-Man's speed, not a magic number", () => {
    expect(DECISION_DEADLINE_MS).toBe((DECISION_PREFETCH_TILES / PACMAN_SPEED_TILES_PER_SEC) * 1000);
  });

  it("marks exactly the buckets at or under the deadline as within it", () => {
    // If this fails after a retune, the bucket edges have to move with the
    // deadline — otherwise the chart's split stops meaning "arrived too late"
    // (design-system §6.5). It does *not* have to match the `过期回答` count:
    // that counts discards, this counts lateness, and see the last block here.
    const flags = latencyHistogram([]).map((bucket) => [bucket.label, bucket.withinDeadline] as const);
    expect(flags).toEqual([
      ["<150", true],
      ["150–300", true],
      ["300–500", true],
      ["500–800", false],
      ["800–1200", false],
      ["≥1200", false],
    ]);
  });

  it("never counts an answer at or past the deadline as within it", () => {
    // The invariant the chart's conclusion rests on: right of the edge really
    // is "too late", so the label can say so without lying.
    const bucketFor = (latencyMs: number) =>
      latencyHistogram([record({ latencyMs })]).find((bucket) => bucket.count > 0);

    for (const latencyMs of [500, 700, 900, 1500]) {
      expect(bucketFor(latencyMs)?.withinDeadline).toBe(false);
    }
    for (const latencyMs of [0, 120, 499]) {
      expect(bucketFor(latencyMs)?.withinDeadline).toBe(true);
    }
  });
});

describe("computeMetrics", () => {
  it("counts only provider requests in `requests` and only provider answers in `applied`", () => {
    // The trap this pins: a FALLBACK record is a decision, but it is not a
    // *request*, and its answer did not come from Jev. Counting it as either
    // makes the applied rate look far worse than it is.
    const records = [
      record({ decisionId: "d1", source: "JEV", status: "APPLIED", applied: "UP", latencyMs: 200 }),
      record({ decisionId: "f1", source: "FALLBACK", status: "APPLIED", applied: "RIGHT" }),
      record({ decisionId: "d2", source: "JEV", status: "STALE" }),
    ];
    const metrics = computeMetrics(records, miniGame());

    expect(metrics.requests).toBe(2); // d1 + d2 — the fallback is not a request
    expect(metrics.applied).toBe(1); // only d1 was a provider answer that landed
    expect(metrics.fallbacks).toBe(1);
    expect(metrics.stale).toBe(1);
    expect(metrics.appliedRate).toBeCloseTo(0.5); // 1 / 2
  });

  it("reports no applied rate before any request has been made", () => {
    expect(computeMetrics([], miniGame()).appliedRate).toBeNull();
  });
});

describe("overDeadlineCount", () => {
  it("adds up only the buckets past the deadline", () => {
    const buckets = latencyHistogram([
      record({ latencyMs: 100 }), // <150      in time
      record({ latencyMs: 100 }), // <150      in time
      record({ latencyMs: 400 }), // 300–500   in time
      record({ latencyMs: 600 }), // 500–800   too late
      record({ latencyMs: 2000 }), // ≥1200     too late
      record({ latencyMs: null }), // unmeasured
    ]);
    expect(overDeadlineCount(buckets)).toBe(2);
  });

  it("is zero when every measured answer landed inside the deadline", () => {
    const buckets = latencyHistogram([record({ latencyMs: 90 }), record({ latencyMs: 480 })]);
    expect(overDeadlineCount(buckets)).toBe(0);
  });
});

/**
 * The two counts are easy to conflate — both are "answers that did not get used",
 * and the histogram's edge is cut at the same 500 ms. They are not the same
 * population, and these two tests are the proof: the controller really does close
 * records STALE that the histogram cannot see, in both directions of the mistake.
 */
describe("overDeadlineCount is not `stale`", () => {
  it("misses a request discarded before any answer arrived", async () => {
    const provider = new ManualProvider();
    const { controller, state } = await untilRequestInFlight(provider);

    // Nothing has come back yet, so there is no latency to bucket — but the
    // request is still a decision that was thrown away.
    expect(controller.snapshot().telemetry[0].latencyMs).toBeNull();

    controller.setProvider(null); // the player takes over mid-flight

    const records = controller.snapshot().telemetry;
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("STALE");
    expect(records[0].latencyMs).toBeNull();

    expect(computeMetrics(records, state).stale).toBe(1);
    expect(overDeadlineCount(latencyHistogram(records))).toBe(0);
  });

  it("misses an answer that arrived in time but was discarded anyway", async () => {
    const provider = new ManualProvider();
    const { controller, state } = await untilRequestInFlight(provider);

    provider.respond("RIGHT"); // ManualProvider reports a 120 ms latency
    await flush(4);

    const answered = controller.snapshot().telemetry[0];
    expect(answered.latencyMs).toBe(120);
    expect(answered.status).toBe("PENDING"); // in hand, waiting for the junction

    // Discarded for the same non-latency reason as above. This time there *is* a
    // measurement, and it sits well inside the deadline: `stale` counts it, the
    // histogram files it under "<150" and the chart calls it perfectly healthy.
    controller.setProvider(null);

    const records = controller.snapshot().telemetry;
    expect(records[0].status).toBe("STALE");
    expect(records[0].latencyMs).toBe(120);
    expect(computeMetrics(records, state).stale).toBe(1);
    expect(overDeadlineCount(latencyHistogram(records))).toBe(0);
  });
});

/**
 * The estimators behind 平均延迟 / p50 / p95. Both use the *nearest rank* method:
 * the answer is always a latency that was actually measured, never a number
 * interpolated between two of them. That suits a panel whose whole point is "these
 * are real measurements" — but it has consequences the copy has to own, which is
 * what these tests are for.
 */
describe("mean and percentile", () => {
  it("reports nothing for an empty series rather than NaN", () => {
    expect(mean([])).toBeNull();
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([], 0.95)).toBeNull();
  });

  it("ignores input order", () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20);
    expect(mean([40, 10, 30, 20])).toBe(25);
  });

  it("takes the lower of the two middles when the count is even (no interpolation)", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20); // not 25
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
    // With two samples p50 is the *minimum*, so "half the answers are faster"
    // would be false — which is why the tooltip says 取中间那个样本 instead.
    expect(percentile([10, 20], 0.5)).toBe(10);
    expect(percentile([10], 0.5)).toBe(10);
  });

  it("makes p95 the slowest sample until there are 20 of them", () => {
    // The property the p95 tooltip now states out loud: in a session younger than
    // 20 decisions, that tile is showing the single worst call.
    const nineteen = Array.from({ length: 19 }, (_, index) => (index + 1) * 10);
    expect(percentile(nineteen, 0.95)).toBe(190); // the maximum

    const twenty = Array.from({ length: 20 }, (_, index) => (index + 1) * 10);
    expect(percentile(twenty, 0.95)).toBe(190); // the 19th — no longer the max
    expect(Math.max(...twenty)).toBe(200);
  });

  it("never returns a value that was not measured", () => {
    const latencies = [15, 240, 1200, 480];
    for (const fraction of [0.5, 0.95]) {
      expect(latencies).toContain(percentile(latencies, fraction));
    }
  });
});
