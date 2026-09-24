import { describe, expect, it } from "vitest";

import type { DecideRequest, DecisionPoint } from "@/lib/agent/types";
import { PACMAN_DRIVER, PACMAN_INSTRUCTIONS } from "@/lib/games/pacman/agent";
import type { PacmanObservation } from "@/lib/games/pacman/agent";
import { QUESTION_ID, buildCriteria } from "@/lib/jev/prompt";
import { validateDecision } from "@/lib/jev/validation";
import { keepPellets, makeGhost, miniGame, putGhosts, tile } from "./helpers";

/**
 * What the model is shown, and what it is allowed to answer.
 *
 * Both halves used to live in `lib/agent/` as Pac-Man-shaped modules; they are
 * now Pac-Man's own (`PACMAN_DRIVER.observe` / `frame`) plus two game-free
 * helpers on the server side. This file is the seam's contract test: the
 * observation is opaque to the framework, so this is where its shape is pinned,
 * and `buildCriteria` must turn the *same* fact rows into the prose the model
 * reads.
 */

/** A junction on the mini maze, with two open directions, as the driver would frame it. */
function junctionPoint(): DecisionPoint {
  return {
    key: "1:1,4",
    at: tile(1, 4),
    actions: ["UP", "RIGHT"],
    distance: 3,
    arriving: false,
    facing: "UP",
  };
}

function sampleObservation(): PacmanObservation {
  const state = miniGame();
  keepPellets(state, [
    [1, 2],
    [1, 1],
    [2, 1],
  ]);
  putGhosts(state, [makeGhost("Blinky", 2, 4, "CHASE")]);

  return PACMAN_DRIVER.observe({
    state,
    point: junctionPoint(),
    recent: [{ key: "1:1,1", at: tile(1, 1), action: "DOWN" }],
  }) as PacmanObservation;
}

describe("观察", () => {
  it("形状与约定一致：八个键，一个不多一个不少", () => {
    const observation = sampleObservation();

    expect(Object.keys(observation)).toEqual([
      "objective",
      "game",
      "pacman",
      "targetJunction",
      "mode",
      "ghosts",
      "candidates",
      "recentDecisions",
    ]);

    expect(observation.objective).toContain("Survive");
    expect(observation.pacman).toEqual({ tile: { x: 1, y: 1 }, heading: "UP" });
    expect(observation.targetJunction).toEqual({ tile: { x: 1, y: 4 }, legalDirections: ["UP", "RIGHT"] });
    expect(observation.game.pelletsRemaining).toBe(3);
    expect(observation.mode).toEqual({ frightened: false, frightenedRemainingMs: 0 });
    expect(observation.ghosts).toHaveLength(1);
    expect(observation.ghosts[0]).toEqual({
      name: "Blinky",
      tile: { x: 2, y: 4 },
      mode: "CHASE",
      distanceToPacman: 4,
    });
    expect(Object.keys(observation.candidates)).toEqual(["UP", "RIGHT"]);
    expect(observation.recentDecisions).toEqual([{ junction: { x: 1, y: 1 }, chosen: "DOWN" }]);
  });

  it("只送模型能据以行动的东西，从不送整张迷宫", () => {
    const json = JSON.stringify(sampleObservation());

    expect(json).not.toContain("houseTiles");
    expect(json).not.toContain("MAZE_ROWS");
    expect(json).not.toContain("#");
    // The first tile of a candidate is a *position*, not a fact about the
    // choice: the model is asked about outcomes, not coordinates.
    expect(sampleObservation().candidates.UP).not.toHaveProperty("firstTile");
  });

  it("从不携带超过三条过往决策", () => {
    const state = miniGame();
    const observation = PACMAN_DRIVER.observe({
      state,
      point: junctionPoint(),
      recent: [
        { key: "1:1,1", at: tile(1, 1), action: "DOWN" },
        { key: "1:1,4", at: tile(1, 4), action: "RIGHT" },
        { key: "1:6,1", at: tile(6, 1), action: "LEFT" },
        { key: "1:11,4", at: tile(11, 4), action: "DOWN" },
      ],
    }) as PacmanObservation;

    expect(observation.recentDecisions).toHaveLength(3);
  });
});

describe("criteria 装配", () => {
  const state = miniGame();
  keepPellets(state, [
    [1, 2],
    [1, 1],
    [2, 1],
  ]);
  putGhosts(state, [makeGhost("Blinky", 2, 4, "CHASE")]);
  const point = junctionPoint();
  const question = PACMAN_DRIVER.frame(state, point);

  it("按动作把同一张事实表拍成文字，每个动作都拿全所有行", () => {
    const criteria = buildCriteria(question.facts, point.actions);

    expect(Object.keys(criteria)).toEqual(["UP", "RIGHT"]);
    for (const action of point.actions) {
      expect(criteria[action].split("\n")).toHaveLength(question.facts.length);
      for (const row of question.facts) {
        expect(criteria[action]).toContain(`${row.modelLabel}: ${row.values[action]}`);
      }
    }
  });

  it("说的是数字，不是形容词：每一行都是可核对的读数", () => {
    const criteria = buildCriteria(question.facts, point.actions);

    expect(criteria.UP).toContain("Nearest pellet: 1 tile away");
    expect(criteria.UP).toContain("Pellets within 6 tiles: 3");
    expect(criteria.UP).toMatch(/Nearest dangerous ghost: \d+ tiles? away/);
    expect(criteria.UP).toContain("Dead end: no");
    expect(criteria.UP).toContain("Heading: keeps heading");
    expect(criteria.RIGHT).not.toContain("Heading: keeps heading");
  });

  it("系统提示词与后端校验口径一致：一次单选题，只在一个动作里挑", () => {
    expect(question.instructions).toContain("Choose Pac-Man's next direction");
    expect(question.instructions).toContain("Choose exactly one legal direction");
    expect(question.instructions).toBe(PACMAN_INSTRUCTIONS);
    expect(QUESTION_ID).toBe("action");
  });
});

describe("答案校验", () => {
  const request: DecideRequest = {
    decisionId: "d7",
    game: "pacman",
    state: { objective: "test" },
    actions: ["UP", "RIGHT"],
    instructions: PACMAN_INSTRUCTIONS,
    facts: [{ label: "朝向", modelLabel: "Heading", values: { UP: "keeps heading", RIGHT: "turns" } }],
    pointKey: "1:1,4",
  };

  it("接受这一问的合法答案", () => {
    const result = validateDecision(
      {
        decisionId: "d7",
        action: "RIGHT",
        confidence: 0.72,
        probabilities: { UP: 0.1, RIGHT: 0.9 },
        latencyMs: 118,
        model: "jev-latest",
      },
      request,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.action).toBe("RIGHT");
    expect(result.result.probabilities.RIGHT).toBe(0.9);
    expect(result.result.latencyMs).toBe(118);
    expect(result.result.model).toBe("jev-latest");
    expect(result.result.source).toBe("JEV");
  });

  it("丢掉概率里那些不在合法动作内的键", () => {
    const result = validateDecision(
      { decisionId: "d7", action: "UP", probabilities: { UP: 0.6, LEFT: 0.4, RIGHT: 0.2 } },
      request,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.probabilities).toEqual({ UP: 0.6, RIGHT: 0.2 });
  });

  it("拒收别的决策的答案", () => {
    const result = validateDecision({ decisionId: "d8", action: "UP" }, request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("d8");
  });

  it("拒收不在选项里的答案", () => {
    const result = validateDecision({ decisionId: "d7", action: "LEFT" }, request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("合法动作");
  });

  it("拒收胡话，而不是猜一个", () => {
    expect(validateDecision({ decisionId: "d7", action: "PARKOUR" }, request).ok).toBe(false);
    expect(validateDecision(null, request).ok).toBe(false);
    expect(validateDecision({ decisionId: "d7" }, request).ok).toBe(false);
  });
});
