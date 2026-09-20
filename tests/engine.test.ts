import { describe, expect, it } from "vitest";

import { createGame, defaultMaze, startGame, stepGame } from "@/lib/game/engine";
import { bfs } from "@/lib/game/pathfinding";
import {
  DEATH_PAUSE_MS,
  FIXED_DT_MS,
  FRIGHTENED_DURATION_MS,
  GHOST_EATEN_SCORES,
  PELLET_SCORE,
  POWER_PELLET_SCORE,
  STARTING_LIVES,
  tileKey,
  tileOf,
} from "@/lib/game/types";
import { keepPellets, makeGhost, miniGame, placePacman, putGhosts, stepTicks, tile } from "./helpers";

function ticksFor(milliseconds: number): number {
  return Math.ceil(milliseconds / FIXED_DT_MS);
}

describe("pellets", () => {
  it("eats a pellet, scores it and takes it off the board", () => {
    const state = miniGame();
    keepPellets(state, [
      [11, 1],
      [11, 7],
    ]);
    placePacman(state, 9, 1, "RIGHT");
    startGame(state);

    const events = [];
    for (let tick = 0; tick < 20; tick += 1) events.push(...stepGame(state, FIXED_DT_MS));

    expect(events.some((event) => event.type === "PELLET_EATEN")).toBe(true);
    expect(state.pellets.has(tileKey(tile(11, 1)))).toBe(false);
    expect(state.score).toBe(PELLET_SCORE);
    expect(state.pelletsEaten).toBe(1);
    expect(state.pellets.size).toBe(1); // the far one is still there
  });

  it("turns a power pellet into frightened ghosts, and back again", () => {
    const state = miniGame();
    keepPellets(state, [[1, 1]]);
    state.powerPellets = new Set([tileKey(tile(11, 1))]);
    placePacman(state, 9, 1, "RIGHT");
    putGhosts(state, [makeGhost("Blinky", 1, 4, "CHASE"), makeGhost("Pinky", 11, 7, "SCATTER")]);
    startGame(state);

    stepTicks(state, 20);

    expect(state.score).toBe(POWER_PELLET_SCORE);
    expect(state.fright.active).toBe(true);
    expect(state.fright.remainingMs).toBeGreaterThan(FRIGHTENED_DURATION_MS - 1000);
    expect(state.ghosts.map((ghost) => ghost.mode)).toEqual(["FRIGHTENED", "FRIGHTENED"]);

    // Wind the frightened window down to its last ticks and let it expire.
    state.fright.remainingMs = 120;
    stepTicks(state, 10);

    expect(state.fright.active).toBe(false);
    expect(state.ghosts.map((ghost) => ghost.mode)).toEqual(["CHASE", "SCATTER"]);
  });
});

describe("collisions", () => {
  it("loses a life when a dangerous ghost touches Pac-Man, then respawns", () => {
    const state = miniGame();
    keepPellets(state, [[11, 7]]);
    placePacman(state, 5, 1, "RIGHT");
    putGhosts(state, [makeGhost("Blinky", 6, 1, "CHASE")]);
    startGame(state);

    const events = [];
    for (let tick = 0; tick < 40; tick += 1) events.push(...stepGame(state, FIXED_DT_MS));

    expect(events.some((event) => event.type === "PACMAN_DIED")).toBe(true);
    expect(state.lives).toBe(STARTING_LIVES - 1);
    expect(state.status).toBe("PLAYING");
    expect(state.deathPauseMs).not.toBeNull();

    for (let tick = 0; tick < 200 && state.deathPauseMs !== null; tick += 1) {
      stepGame(state, FIXED_DT_MS);
    }

    expect(state.deathPauseMs).toBeNull();
    expect(state.pacman.position).toEqual({ x: 1.5, y: 1.5 });
    expect(state.pacman.direction).toBe("LEFT");
  });

  it("eats a frightened ghost instead of dying", () => {
    const state = miniGame();
    keepPellets(state, [[11, 7]]);
    placePacman(state, 5, 1, "RIGHT");
    state.fright.active = true;
    state.fright.remainingMs = 5000;
    putGhosts(state, [makeGhost("Blinky", 6, 1, "FRIGHTENED")]);
    startGame(state);

    const events = [];
    for (let tick = 0; tick < 40; tick += 1) events.push(...stepGame(state, FIXED_DT_MS));

    const eaten = events.find((event) => event.type === "GHOST_EATEN");
    expect(eaten).toBeDefined();
    expect(state.lives).toBe(STARTING_LIVES);
    expect(state.ghostsEaten).toBe(1);
    expect(state.score).toBeGreaterThanOrEqual(GHOST_EATEN_SCORES[0]);
    expect(state.ghosts[0].mode).toBe("EATEN");
  });

  it("doubles the score for a second ghost in the same frightened window", () => {
    const state = miniGame();
    keepPellets(state, [[11, 7]]);
    placePacman(state, 5, 1, "RIGHT");
    state.fright.active = true;
    state.fright.remainingMs = 5000;
    state.fright.eaten = 1;
    putGhosts(state, [makeGhost("Blinky", 6, 1, "FRIGHTENED")]);
    startGame(state);

    stepTicks(state, 40);

    expect(state.score).toBe(GHOST_EATEN_SCORES[1]);
    expect(state.ghostsEaten).toBe(1);
  });

  it("ends the game when the last life goes", () => {
    const state = miniGame();
    keepPellets(state, [[11, 7]]);
    placePacman(state, 5, 1, "RIGHT");
    putGhosts(state, [makeGhost("Blinky", 6, 1, "CHASE")]);
    state.lives = 1;
    startGame(state);

    const events = [];
    for (let tick = 0; tick < ticksFor(DEATH_PAUSE_MS) + 20; tick += 1) events.push(...stepGame(state, FIXED_DT_MS));

    expect(events.some((event) => event.type === "PACMAN_DIED")).toBe(true);
    expect(events.some((event) => event.type === "GAME_OVER")).toBe(true);
    expect(state.status).toBe("GAME_OVER");
    expect(state.lives).toBe(0);
  });
});

describe("levels", () => {
  it("clears the level, restores the pellets and moves up a level", () => {
    const state = miniGame();
    keepPellets(state, [[11, 1]]);
    placePacman(state, 9, 1, "RIGHT");
    startGame(state);

    const events = [];
    for (let tick = 0; tick < 40 && state.level === 1; tick += 1) {
      events.push(...stepGame(state, FIXED_DT_MS));
    }

    expect(events.some((event) => event.type === "LEVEL_CLEARED")).toBe(true);
    expect(state.level).toBe(2);
    expect(state.pellets.size).toBe(state.maze.initialPellets.length);
    expect(state.pacman.position).toEqual({ x: 1.5, y: 1.5 });
  });
});

describe("determinism", () => {
  it("replays the same seed and the same decisions to the same game", () => {
    const script = ["RIGHT", "DOWN", "LEFT", "DOWN", "RIGHT", "UP"] as const;

    const play = () => {
      const state = createGame({ maze: defaultMaze(), seed: 7 });
      startGame(state);
      for (let tick = 0; tick < 1800; tick += 1) {
        if (tick % 60 === 0) state.pacman.requestedDirection = script[(tick / 60) % script.length];
        stepGame(state, FIXED_DT_MS);
      }
      return state;
    };

    const first = play();
    const second = play();

    expect(second.score).toBe(first.score);
    expect(second.pelletsEaten).toBe(first.pelletsEaten);
    expect(second.pacman.position).toEqual(first.pacman.position);
    expect(second.ghosts.map((ghost) => ghost.position)).toEqual(first.ghosts.map((ghost) => ghost.position));
    expect(second.rngState).toBe(first.rngState);
    expect(second.tick).toBe(first.tick);
  });

  it("gives the ghosts a start in the house and lets them out", () => {
    const state = createGame({ seed: 3 });
    const house = new Set(state.maze.houseTiles.map(tileKey));

    expect(state.ghosts).toHaveLength(4);
    expect(state.ghosts.every((ghost) => house.has(tileKey(ghost.tile)))).toBe(true);
    expect(state.ghosts.every((ghost) => ghost.mode === "HOUSE")).toBe(true);

    startGame(state);
    stepTicks(state, 60 * 12); // twelve seconds: every release timer has expired

    for (const ghost of state.ghosts) {
      expect(house.has(tileKey(ghost.tile)), `${ghost.name} is still in the house`).toBe(false);
      expect(ghost.mode, `${ghost.name} mode`).not.toBe("HOUSE");
      expect(state.maze.isPacmanWalkable(ghost.tile.x, ghost.tile.y), `${ghost.name} tile`).toBe(true);
    }
  });
});

describe("ghosts", () => {
  it("chases: Blinky closes the distance to Pac-Man", () => {
    const state = miniGame();
    keepPellets(state, [[11, 7]]);
    placePacman(state, 11, 7, "LEFT");
    putGhosts(state, [makeGhost("Blinky", 1, 7, "CHASE")]);
    startGame(state);

    const before = bfs(state.maze, state.ghosts[0].tile).distanceAt(tileOf(state.pacman.position));
    stepTicks(state, 120);
    const after = bfs(state.maze, state.ghosts[0].tile).distanceAt(tileOf(state.pacman.position));

    expect(before).toBe(10);
    expect(after).toBeLessThan(before);
  });

  it("never turns back on itself in an open corridor", () => {
    const state = createGame({ seed: 9 });
    startGame(state);
    stepTicks(state, 60 * 12); // let every ghost leave the house first

    const house = new Set(state.maze.houseTiles.map(tileKey));
    const ghost = state.ghosts[0];
    let reversals = 0;
    let previous = ghost.direction;

    for (let tick = 0; tick < 900; tick += 1) {
      stepGame(state, FIXED_DT_MS);
      const current = ghost.direction;
      const reversed =
        (previous === "RIGHT" && current === "LEFT") ||
        (previous === "LEFT" && current === "RIGHT") ||
        (previous === "UP" && current === "DOWN") ||
        (previous === "DOWN" && current === "UP");

      // Inside the house a ghost may be boxed in and have to turn around; in the
      // maze it never does.
      if (reversed && !house.has(tileKey(ghost.tile))) reversals += 1;
      previous = current;
    }

    expect(reversals).toBe(0);
  });
});
