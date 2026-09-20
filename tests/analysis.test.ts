import { describe, expect, it } from "vitest";

import { DANGER_RADIUS, analyzeCandidates } from "@/lib/game/analysis";
import { keepPellets, makeGhost, miniGame, putGhosts, tile } from "./helpers";

/**
 * These tests check the facts the analyzer reports. They never check which move
 * is "better": that judgement belongs to Jev, not to this code.
 */
describe("candidate analysis", () => {
  it("counts and measures pellets for each direction", () => {
    const state = miniGame();
    keepPellets(state, [
      [1, 2],
      [1, 1],
      [2, 1],
      [11, 2],
    ]);

    const candidates = analyzeCandidates(state, tile(1, 4), "UP", ["UP", "RIGHT"]);

    // From (1, 3): the pellet at (1, 2) is one step away.
    expect(candidates.UP.nearestPelletDistance).toBe(1);
    expect(candidates.UP.pelletsWithin6Tiles).toBe(3);
    expect(candidates.UP.continuesForward).toBe(true);
    expect(candidates.UP.reversesDirection).toBe(false);

    // From (2, 4) the only way to (1, 2) runs back through the junction: 3 steps.
    expect(candidates.RIGHT.nearestPelletDistance).toBe(3);
    expect(candidates.RIGHT.continuesForward).toBe(false);
    expect(candidates.RIGHT.reversesDirection).toBe(false);

    expect(candidates.UP.nearestPowerPelletDistance).toBeNull();
    expect(candidates.UP.reachableArea).toBe(43);
  });

  it("puts a dangerous ghost on the right side of the junction and nowhere else", () => {
    const state = miniGame();
    keepPellets(state, [[1, 1]]);
    putGhosts(state, [makeGhost("Blinky", 2, 4, "CHASE")]);

    const candidates = analyzeCandidates(state, tile(1, 4), "UP", ["UP", "RIGHT"]);

    expect(candidates.RIGHT.nearestDangerousGhostDistance).toBe(0);
    expect(candidates.UP.nearestDangerousGhostDistance).toBe(2);
    expect(candidates.RIGHT.nearestDangerousGhostDistance).toBeLessThan(
      candidates.UP.nearestDangerousGhostDistance as number,
    );

    // The tiles around the ghost are unsafe, so the safe area is smaller.
    expect(candidates.UP.reachableSafeArea).toBeLessThan(candidates.UP.reachableArea);
  });

  it("does not treat frightened ghosts as dangerous", () => {
    const state = miniGame();
    putGhosts(state, [makeGhost("Blinky", 2, 4, "FRIGHTENED")]);

    const candidates = analyzeCandidates(state, tile(1, 4), "UP", ["UP", "RIGHT"]);

    expect(candidates.RIGHT.nearestDangerousGhostDistance).toBeNull();
    expect(candidates.RIGHT.nearestFrightenedGhostDistance).toBe(0);
    expect(candidates.UP.nearestFrightenedGhostDistance).toBe(2);
    expect(candidates.RIGHT.reachableSafeArea).toBe(candidates.RIGHT.reachableArea);
  });

  it("ignores ghosts Pac-Man cannot reach at all", () => {
    const state = miniGame();
    // No ghosts anywhere on Pac-Man's map, and the real maze's house ghosts
    // would be unreachable too: both report null rather than a made-up number.
    const candidates = analyzeCandidates(state, tile(1, 4), "UP", ["UP", "RIGHT"]);
    expect(candidates.UP.nearestDangerousGhostDistance).toBeNull();
    expect(candidates.UP.nearestFrightenedGhostDistance).toBeNull();
  });

  it("measures how deep the dead ends are", () => {
    const state = miniGame();
    const candidates = analyzeCandidates(state, tile(6, 1), "LEFT", ["LEFT", "DOWN", "RIGHT"]);

    expect(candidates.DOWN.firstTile).toEqual(tile(6, 2));
    expect(candidates.DOWN.deadEnd).toBe(true);
    expect(candidates.DOWN.deadEndDepth).toBe(1);

    expect(candidates.LEFT.deadEnd).toBe(false);
    expect(candidates.LEFT.deadEndDepth).toBeNull();

    expect(candidates.RIGHT.continuesForward).toBe(false);
    expect(candidates.RIGHT.reversesDirection).toBe(true);
    expect(candidates.LEFT.continuesForward).toBe(true);
    expect(DANGER_RADIUS).toBe(2);
  });

  it("reports square roots of nothing: every field is finite or null", () => {
    const state = miniGame();
    keepPellets(state, []);
    putGhosts(state, [makeGhost("Pinky", 11, 7, "SCATTER")]);

    const candidates = analyzeCandidates(state, tile(1, 4), "UP", ["UP", "RIGHT"]);
    const values = Object.values(candidates.UP);

    for (const value of values) {
      expect(typeof value === "number" ? Number.isFinite(value) : true).toBe(true);
    }
    expect(candidates.UP.nearestPelletDistance).toBeNull();
    expect(candidates.UP.nearestPowerPelletDistance).toBeNull();
    expect(candidates.UP.pelletsWithin6Tiles).toBe(0);
  });
});
