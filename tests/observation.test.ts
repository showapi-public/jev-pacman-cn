import { describe, expect, it } from "vitest";

import { buildCriteria, candidateText } from "@/lib/agent/candidates";
import { buildObservation } from "@/lib/agent/observation";
import type { JevObservation } from "@/lib/agent/types";
import { analyzeCandidates } from "@/lib/games/pacman/analysis";
import { DECISION_INSTRUCTIONS, QUESTION_ID, buildCriteria as buildQuestionCriteria } from "@/lib/jev/prompt";
import { isDirection, validateDecision } from "@/lib/jev/validation";
import type { Direction } from "@/lib/games/pacman/types";
import { keepPellets, makeGhost, miniGame, putGhosts, tile } from "./helpers";

function sampleObservation(): JevObservation {
  const state = miniGame();
  keepPellets(state, [
    [1, 2],
    [1, 1],
    [2, 1],
  ]);
  putGhosts(state, [makeGhost("Blinky", 2, 4, "CHASE")]);

  const junction = tile(1, 4);
  const heading = "UP" as const;
  const legalDirections = ["UP", "RIGHT"] as const;

  return buildObservation({
    state,
    junction,
    heading,
    legalDirections: [...legalDirections],
    candidates: analyzeCandidates(state, junction, heading, legalDirections),
    recentDecisions: [{ junction: tile(1, 1), chosen: "DOWN" }],
  });
}

describe("observation", () => {
  it("has exactly the shape the plan asks for", () => {
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
    expect(observation.ghosts[0]).toEqual({ name: "Blinky", tile: { x: 2, y: 4 }, mode: "CHASE", distanceToPacman: 4 });
    expect(Object.keys(observation.candidates)).toEqual(["UP", "RIGHT"]);
    expect(observation.recentDecisions).toEqual([{ junction: { x: 1, y: 1 }, chosen: "DOWN" }]);
  });

  it("sends only what Jev can act on, never the whole maze", () => {
    const observation = sampleObservation();
    const json = JSON.stringify(observation);

    expect(json).not.toContain("houseTiles");
    expect(json).not.toContain("MAZE_ROWS");
    expect(json).not.toContain("#");
    expect(observation.candidates.UP).not.toHaveProperty("firstTile");
  });

  it("writes one option sentence per legal direction, using the same words as the numbers", () => {
    const observation = sampleObservation();
    const criteria = buildQuestionCriteria(observation.candidates, ["UP", "RIGHT"]);

    expect(Object.keys(criteria)).toEqual(["UP", "RIGHT"]);
    expect(criteria.UP).toContain("Move UP.");
    expect(criteria.UP).toContain("Nearest pellet is 1 tile away");
    expect(criteria.UP).toContain("3 pellets within 6 tiles");
    expect(criteria.UP).toMatch(/Nearest dangerous ghost is \d+ tiles? away/);
    expect(criteria.UP).toContain("Not a dead end.");
    expect(criteria.UP).toContain("Keeps the current heading.");
    expect(criteria.RIGHT).not.toContain("Keeps the current heading.");

    expect(DECISION_INSTRUCTIONS).toContain("Choose exactly one legal direction.");
    expect(DECISION_INSTRUCTIONS).toContain("Stay alive.");
    expect(QUESTION_ID).toBe("direction");
  });

  it("says so when a direction has nothing behind it", () => {
    const observation = sampleObservation();
    const text = candidateText("DOWN", {
      ...(observation.candidates.UP as NonNullable<typeof observation.candidates.UP>),
      nearestPelletDistance: null,
      nearestPowerPelletDistance: null,
      nearestDangerousGhostDistance: null,
      continuesForward: false,
    });
    expect(text).toContain("No pellet is reachable that way.");
    expect(text).toContain("No dangerous ghost on this side of the maze.");
  });

  it("never sends more than three past decisions", () => {
    const state = miniGame();
    const observation = buildObservation({
      state,
      junction: tile(1, 4),
      heading: "UP",
      legalDirections: ["UP", "RIGHT"],
      candidates: analyzeCandidates(state, tile(1, 4), "UP", ["UP", "RIGHT"]),
      recentDecisions: [
        { junction: tile(1, 1), chosen: "DOWN" },
        { junction: tile(1, 4), chosen: "RIGHT" },
        { junction: tile(6, 1), chosen: "LEFT" },
        { junction: tile(11, 4), chosen: "DOWN" },
      ],
    });
    expect(observation.recentDecisions).toHaveLength(3);
  });

  it("builds the criteria map from candidates only", () => {
    const observation = sampleObservation();
    const criteria = buildCriteria([
      { direction: "UP", analysis: observation.candidates.UP as never, text: criteriaUp(observation) },
    ]);
    expect(Object.keys(criteria)).toEqual(["UP"]);
  });
});

function criteriaUp(observation: JevObservation): string {
  return candidateText("UP", observation.candidates.UP as never);
}

describe("answer validation", () => {
  const observation = sampleObservation();
  const request = { decisionId: "d7", observation, legalDirections: ["UP", "RIGHT"] as Direction[] };
  const legal: string[] = [...request.legalDirections];

  it("knows a direction when it sees one", () => {
    expect(isDirection("UP")).toBe(true);
    expect(isDirection("SIDEWAYS")).toBe(false);
    expect(isDirection(3)).toBe(false);
  });

  it("accepts a legal answer for this decision", () => {
    const result = validateDecision(
      { decisionId: "d7", direction: "RIGHT", confidence: 0.72, probabilities: { UP: 0.1, RIGHT: 0.9 }, latencyMs: 118, model: "jev-latest" },
      request,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.direction).toBe("RIGHT");
    expect(result.result.probabilities.RIGHT).toBe(0.9);
    expect(result.result.latencyMs).toBe(118);
    expect(result.result.source).toBe("JEV");
  });

  it("rejects an answer for another decision", () => {
    const result = validateDecision({ decisionId: "d8", direction: "UP" }, request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("d8");
  });

  it("rejects an answer that is not on offer", () => {
    const result = validateDecision({ decisionId: "d7", direction: "LEFT" }, request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("合法方向");
    expect(legal).toEqual(["UP", "RIGHT"]);
  });

  it("rejects nonsense instead of guessing", () => {
    expect(validateDecision({ decisionId: "d7", direction: "PARKOUR" }, request).ok).toBe(false);
    expect(validateDecision(null, request).ok).toBe(false);
    expect(validateDecision({ decisionId: "d7" }, request).ok).toBe(false);
  });
});
