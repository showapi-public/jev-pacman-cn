import { describe, expect, it } from "vitest";

import { AgentController } from "@/lib/agent/controller";
import { computeMetrics } from "@/lib/agent/telemetry";
import type { DecisionProvider } from "@/lib/agent/types";
import { createJevProvider } from "@/lib/jev/client";
import { validateDecision } from "@/lib/jev/validation";
import { startGame, stepGame } from "@/lib/game/engine";
import type { Direction } from "@/lib/game/types";
import { FIXED_DT_MS } from "@/lib/game/types";
import { flush, keepPellets, miniGame, placePacman } from "./helpers";

/**
 * The browser/server boundary: what the *real* client does with an answer before
 * the controller ever sees it.
 *
 * This exists because of a claim in the metrics copy. The panel has both a `错误`
 * row and a `无效` row, and the obvious reading — "无效 = Jev answered something
 * unusable" — is wrong: validateDecision rejects those inside the client and the
 * controller files them as ERROR. So `无效` stays at zero in a real session, and
 * these tests are what pins that down.
 */

/** A provider that runs the real client against a stubbed server response. */
function providerAnswering(
  body: Record<string, unknown> | ((request: Record<string, unknown>) => Record<string, unknown>),
  status = 200,
): DecisionProvider {
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const payload = typeof body === "function" ? body(request) : body;
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;

  return createJevProvider("/api/decide", fetchImpl);
}

/**
 * Plays the mini maze until a junction has been resolved by the fallback, which
 * means the provider's answer (however wrong) has already been dealt with.
 * At (1, 4) the choices are DOWN and RIGHT — never UP.
 */
async function playUntilFallback(provider: DecisionProvider) {
  const state = miniGame();
  keepPellets(state, []);
  placePacman(state, 2, 1, "LEFT");
  startGame(state);

  const controller = new AgentController({
    provider,
    now: () => 0,
    scheduleTimeout: () => () => {},
  });

  for (let tick = 0; tick < 400; tick += 1) {
    controller.tick(state);
    stepGame(state, FIXED_DT_MS);
    await flush(4);
    if (controller.snapshot().telemetry.some((record) => record.source === "FALLBACK")) break;
  }

  return { controller, state };
}

describe("validateDecision", () => {
  const request = {
    decisionId: "d1",
    observation: {} as never,
    legalDirections: ["DOWN", "RIGHT"] as Direction[],
  };

  it("rejects a direction that was not on offer, and a mismatched decision id", () => {
    expect(validateDecision({ decisionId: "d1", direction: "UP" }, request)).toMatchObject({ ok: false });
    expect(validateDecision({ decisionId: "other", direction: "RIGHT" }, request)).toMatchObject({ ok: false });
    expect(validateDecision({ decisionId: "d1", direction: "RIGHT" }, request)).toMatchObject({ ok: true });
  });
});

describe("an answer the client rejects becomes `错误`, never `无效`", () => {
  it("files an illegal direction under ERROR and drives the fallback", async () => {
    const provider = providerAnswering((request) => ({
      decisionId: request.decisionId,
      direction: "UP", // never legal at this junction
      confidence: 0.5,
      probabilities: { UP: 0.5 },
      latencyMs: 100,
      model: "fake",
    }));

    const { controller, state } = await playUntilFallback(provider);
    const records = controller.snapshot().telemetry;
    const jev = records.find((record) => record.source === "JEV");

    // The controller's own INVALID branch would have produced "INVALID" here; it
    // never runs, because the client refused the answer before resolving.
    expect(jev?.status).toBe("ERROR");
    expect(jev?.note).toContain("合法方向");
    expect(jev?.applied).toBeNull();

    const metrics = computeMetrics(records, state);
    expect(metrics.invalid).toBe(0); // the row the panel shows can only stay 0
    expect(metrics.errors).toBe(1); // this is where it actually lands
    expect(metrics.fallbacks).toBe(1); // and the game still needed a direction
  });

  it("files a mismatched decision id under ERROR as well", async () => {
    const provider = providerAnswering({ decisionId: "somebody-else", direction: "RIGHT" });

    const { controller, state } = await playUntilFallback(provider);
    const records = controller.snapshot().telemetry;
    const jev = records.find((record) => record.source === "JEV");

    expect(jev?.status).toBe("ERROR");
    expect(jev?.note).toContain("somebody-else");
    expect(computeMetrics(records, state).invalid).toBe(0);
    expect(computeMetrics(records, state).errors).toBe(1);
  });

  it("files a missing API key under ERROR, and raises the flag the console shows", async () => {
    const provider = providerAnswering(
      { error: { kind: "no_api_key", message: "未设置 TYPESAFE_API_KEY（参见 .env.example）" } },
      503,
    );

    const { controller, state } = await playUntilFallback(provider);
    const snapshot = controller.snapshot();
    const jev = snapshot.telemetry.find((record) => record.source === "JEV");

    expect(jev?.status).toBe("ERROR");
    expect(jev?.note).toContain("TYPESAFE_API_KEY");
    // The one error kind the console reports separately: without a key Jev is
    // never really asked, which is why the fallback count is not a lateness count.
    expect(snapshot.apiKeyMissing).toBe(true);

    const metrics = computeMetrics(snapshot.telemetry, state);
    expect(metrics.errors).toBe(1);
    expect(metrics.fallbacks).toBeGreaterThan(0);
  });
});
