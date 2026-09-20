import { describe, expect, it } from "vitest";

import { defaultMaze } from "@/lib/game/engine";
import { houseExitTile } from "@/lib/game/ghosts";
import {
  bfs,
  findNextDecisionPoint,
  getGhostChoices,
  getLegalDirections,
  getMeaningfulDirections,
  isDecisionPoint,
  shortestPathDistance,
} from "@/lib/game/pathfinding";
import { miniMaze, tile } from "./helpers";

const maze = miniMaze();

describe("pathfinding", () => {
  it("lists the legal directions of a tile in a fixed order", () => {
    expect(getLegalDirections(maze, tile(1, 1))).toEqual(["DOWN", "RIGHT"]);
    expect(getLegalDirections(maze, tile(5, 1))).toEqual(["LEFT", "RIGHT"]);
    expect(getLegalDirections(maze, tile(1, 4))).toEqual(["UP", "DOWN", "RIGHT"]);
  });

  it("leaves the way back out of the real choices", () => {
    expect(getMeaningfulDirections(maze, tile(1, 4), "UP")).toEqual(["UP", "RIGHT"]);
    expect(getMeaningfulDirections(maze, tile(1, 1), "LEFT")).toEqual(["DOWN"]);
    expect(getMeaningfulDirections(maze, tile(1, 1), "UP")).toEqual(["RIGHT"]);
    expect(getMeaningfulDirections(maze, tile(5, 1), "RIGHT")).toEqual(["RIGHT"]);
    expect(getMeaningfulDirections(maze, tile(6, 2), "DOWN")).toEqual([]);
  });

  it("knows which tiles are worth asking about", () => {
    expect(isDecisionPoint(maze, tile(1, 4), "UP")).toBe(true);
    expect(isDecisionPoint(maze, tile(6, 1), "LEFT")).toBe(true);
    expect(isDecisionPoint(maze, tile(5, 1), "RIGHT")).toBe(false);
    expect(isDecisionPoint(maze, tile(1, 1), "LEFT")).toBe(false);
    expect(isDecisionPoint(maze, tile(6, 2), "DOWN")).toBe(false);
  });

  it("measures exact step distances", () => {
    expect(shortestPathDistance(maze, tile(1, 1), tile(1, 1))).toBe(0);
    expect(shortestPathDistance(maze, tile(1, 1), tile(1, 4))).toBe(3);
    expect(shortestPathDistance(maze, tile(1, 1), tile(6, 2))).toBe(6);
    expect(shortestPathDistance(maze, tile(1, 1), tile(11, 7))).toBe(16);
    expect(shortestPathDistance(maze, tile(11, 7), tile(1, 1))).toBe(16);
    expect(shortestPathDistance(maze, tile(1, 1), tile(5, 2))).toBeNull();
  });

  it("sees the whole maze from any tile", () => {
    expect(bfs(maze, tile(1, 1)).countReachable()).toBe(43);
    expect(bfs(maze, tile(11, 7)).countReachable()).toBe(43);
  });

  it("can treat tiles as unusable", () => {
    const field = bfs(maze, tile(1, 1), (candidate) => candidate.x === 1 && candidate.y === 4);
    expect(field.distanceAt(tile(1, 4))).toBe(-1);
    expect(field.distanceAt(tile(1, 3))).toBe(2);
    expect(field.countReachable()).toBe(42);
  });

  it("walks to the next junction through forced corners", () => {
    expect(findNextDecisionPoint(maze, tile(2, 1), "LEFT")).toEqual({
      junction: tile(1, 4),
      steps: 4,
      heading: "DOWN",
    });
  });

  it("finds the junction behind a dead end", () => {
    expect(findNextDecisionPoint(maze, tile(6, 2), "DOWN")).toEqual({
      junction: tile(6, 1),
      steps: 1,
      heading: "UP",
    });
  });

  it("asks nothing along a straight run, and finds the far corner", () => {
    expect(findNextDecisionPoint(maze, tile(7, 1), "RIGHT")).toEqual({
      junction: tile(11, 4),
      steps: 7,
      heading: "DOWN",
    });
  });

  it("keeps ghosts out of the house, except when they are going home", () => {
    const real = defaultMaze();
    const exit = houseExitTile(real);
    expect(exit).not.toBeNull();
    if (!exit) return;

    // Standing on the tile above the gate, looking along the corridor: with the
    // house shut, the gate below is not a choice; with the house open (a ghost
    // going home) it is.
    const closed = getGhostChoices(real, exit, "LEFT", false);
    expect(closed).not.toContain("DOWN");

    const open = getGhostChoices(real, exit, "LEFT", true);
    expect(open).toContain("DOWN");
  });
});
