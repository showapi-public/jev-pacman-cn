import { describe, expect, it } from "vitest";

import { startGame } from "@/lib/game/engine";
import { actorTile } from "@/lib/game/movement";
import { FIXED_DT_MS, PACMAN_SPEED_TILES_PER_SEC, tileOf } from "@/lib/game/types";
import { miniGame, miniMaze, placePacman, stepTicks, tile } from "./helpers";

describe("movement", () => {
  it("walks a corridor at the configured speed", () => {
    const state = miniGame();
    startGame(state);
    placePacman(state, 1, 1, "RIGHT");

    stepTicks(state, 60); // one second at 60 Hz

    expect(state.pacman.position.x).toBeCloseTo(1.5 + PACMAN_SPEED_TILES_PER_SEC, 4);
    expect(state.pacman.position.y).toBeCloseTo(1.5, 6);
    expect(actorTile(state.pacman)).toEqual(tile(7, 1));
  });

  it("never enters the wall ahead", () => {
    const state = miniGame();
    startGame(state);
    placePacman(state, 5, 1, "UP"); // (5, 0) is the outer wall

    const visited = new Set<string>();
    for (let tick = 0; tick < 180; tick += 1) {
      stepTicks(state, 1);
      const occupied = tileOf(state.pacman.position);
      visited.add(`${occupied.x},${occupied.y}`);
      expect(state.maze.isPacmanWalkable(occupied.x, occupied.y)).toBe(true);
    }

    expect(visited.has("5,0")).toBe(false);
    expect(visited.has("0,1")).toBe(false);
    expect(visited.size).toBeGreaterThan(3); // it did keep moving, just not through walls
  });

  it("takes the only way out of a corner without being asked", () => {
    const state = miniGame();
    startGame(state);
    placePacman(state, 2, 1, "LEFT");

    stepTicks(state, 60);

    expect(state.pacman.direction).toBe("DOWN");
    expect(state.pacman.position.x).toBeCloseTo(1.5, 6);
    expect(state.pacman.position.y).toBeGreaterThan(1.5);
  });

  it("is not turned by an illegal request", () => {
    const state = miniGame();
    startGame(state);
    placePacman(state, 5, 1, "RIGHT");
    state.pacman.requestedDirection = "UP"; // a wall above

    stepTicks(state, 30);

    expect(state.pacman.direction).toBe("RIGHT");
    expect(state.pacman.position.y).toBeCloseTo(1.5, 6);
  });

  it("reverses immediately, mid-tile", () => {
    const state = miniGame();
    startGame(state);
    placePacman(state, 5, 1, "RIGHT");
    stepTicks(state, 3);
    const before = state.pacman.position.x;

    state.pacman.requestedDirection = "LEFT";
    stepTicks(state, 1);

    expect(state.pacman.direction).toBe("LEFT");
    stepTicks(state, 3);
    expect(state.pacman.position.x).toBeLessThan(before);
  });

  it("turns at the next tile centre where the turn is legal", () => {
    const state = miniGame();
    startGame(state);
    placePacman(state, 5, 1, "RIGHT");
    stepTicks(state, 3); // heading for the pocket entrance at (6, 1)

    state.pacman.requestedDirection = "DOWN";
    stepTicks(state, 12);

    expect(state.pacman.direction).toBe("DOWN");
    expect(actorTile(state.pacman).x).toBe(6);
  });

  it("turns around at a dead end", () => {
    const state = miniGame();
    startGame(state);
    placePacman(state, 6, 1, "DOWN"); // one-tile pocket below

    stepTicks(state, 15); // 1 tile down, then half a tile back

    expect(state.pacman.direction).toBe("UP");
    expect(state.pacman.position.y).toBeLessThan(2.5);
    expect(state.pacman.position.y).toBeGreaterThan(1.5);
  });

  it("never ends a step inside a wall", () => {
    const state = miniGame();
    startGame(state);
    placePacman(state, 1, 1, "RIGHT");

    for (let tick = 0; tick < 900; tick += 1) {
      if (tick % 37 === 0) state.pacman.requestedDirection = ["UP", "DOWN", "LEFT", "RIGHT"][tick % 4] as never;
      stepTicks(state, 1);
      const occupied = tileOf(state.pacman.position);
      const anchor = state.pacman.tile;
      expect(state.maze.isPacmanWalkable(occupied.x, occupied.y)).toBe(true);
      expect(state.maze.isPacmanWalkable(anchor.x, anchor.y)).toBe(true);
      expect(Number.isFinite(state.pacman.position.x)).toBe(true);
      expect(Number.isFinite(state.pacman.position.y)).toBe(true);
    }

    expect(state.tick).toBe(900);
    expect(FIXED_DT_MS).toBeGreaterThan(0);
  });
});
