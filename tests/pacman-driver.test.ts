import { describe, expect, it } from "vitest";

import { PACMAN_DRIVER } from "@/lib/games/pacman/agent";
import { createGame, startGame } from "@/lib/games/pacman/engine";
import { PACMAN } from "@/lib/games/pacman/index";
import { parseMaze } from "@/lib/games/pacman/maze";
import { TILE } from "@/lib/games/pacman/render";
import type { Direction, PacmanEvent, PacmanState, TilePosition } from "@/lib/games/pacman/types";
import { neighbor } from "@/lib/games/pacman/types";
import { miniGame, placePacman, tile } from "./helpers";

/**
 * The driver is the seam the whole refactor turns on: the controller only ever
 * sees a `DecisionPoint`, a `Question` and an action. These tests pin the parts
 * of that seam the controller's prefetch/commit/timeout loop relies on.
 */

function playing(state: PacmanState): PacmanState {
  startGame(state);
  return state;
}

/** The flattening rule the server applies to `facts` before showing them to the model. */
function flatten(facts: readonly { modelLabel: string; values: Record<string, string> }[], action: string): string {
  return facts.map((row) => `${row.modelLabel}: ${row.values[action]}`).join("\n");
}

/** A single corridor with walls at both ends: no junction exists anywhere in it. */
function deadEndCorridor(): PacmanState {
  const rows = ["#####", "#####", "#P..#", "#####", "#####"];
  const state = createGame({ maze: parseMaze(rows, { requireGhostHouse: false }), seed: 1 });
  state.ghosts = [];
  return playing(state);
}

describe("吃豆人 driver：决策点", () => {
  it("未开局时不给决策点", () => {
    const state = miniGame();
    expect(state.status).not.toBe("PLAYING");
    expect(PACMAN_DRIVER.decision(state)).toBeNull();
  });

  it("前方没有任何路口时返回 null", () => {
    expect(PACMAN_DRIVER.decision(deadEndCorridor())).toBeNull();
  });

  it("把路口、距离、朝向与合法动作填对", () => {
    const state = playing(miniGame());
    // A straight run towards the junction at (6,1); two tiles to go.
    placePacman(state, 8, 1, "LEFT");

    const point = PACMAN_DRIVER.decision(state);
    expect(point).not.toBeNull();
    expect(point?.at).toEqual(tile(6, 1));
    expect(point?.key).toBe(`${state.epoch}:6,1`);
    expect(point?.distance).toBe(2);
    expect(point?.arriving).toBe(false);
    // The heading at the junction, which is what every rule reasons about.
    expect(point?.facing).toBe("LEFT");
    // LEFT and DOWN are open at (6,1); UP is a wall and RIGHT is the way back.
    expect(point?.actions).toEqual(["LEFT", "DOWN"]);
  });

  it("站在路口上时 arriving 为真、距离为 0", () => {
    const state = playing(miniGame());
    placePacman(state, 1, 4, "UP");

    const point = PACMAN_DRIVER.decision(state);
    expect(point?.at).toEqual(tile(1, 4));
    expect(point?.distance).toBe(0);
    expect(point?.arriving).toBe(true);
    // Arriving from below: DOWN is the way he came, so it is not on offer.
    expect(point?.actions).toEqual(["UP", "RIGHT"]);
  });

  it("合法动作里没有一个指向墙", () => {
    const state = playing(miniGame());
    const starts: [number, number, Direction][] = [
      [8, 1, "LEFT"],
      [1, 4, "UP"],
      [6, 1, "LEFT"],
      [11, 4, "DOWN"],
    ];

    for (const [x, y, heading] of starts) {
      placePacman(state, x, y, heading);
      const point = PACMAN_DRIVER.decision(state);
      expect(point, `从 ${x},${y} 朝 ${heading}`).not.toBeNull();
      const junction = point?.at as TilePosition;
      expect(point?.actions.length, `从 ${x},${y} 朝 ${heading}`).toBeGreaterThan(1);
      for (const action of point?.actions ?? []) {
        const next = neighbor(junction, action as Direction);
        expect(state.maze.isPacmanWalkable(next.x, next.y), `${action} → ${next.x},${next.y}`).toBe(true);
      }
    }
  });
});

describe("吃豆人 driver：事实表", () => {
  const state = playing(miniGame());
  placePacman(state, 1, 4, "UP");
  const point = PACMAN_DRIVER.decision(state) as NonNullable<ReturnType<typeof PACMAN_DRIVER.decision>>;
  const question = PACMAN_DRIVER.frame(state, point);

  it("行数是固定的 8 行，标签不重不漏且中英各就各位", () => {
    expect(question.facts.length).toBe(8);
    const labels = question.facts.map((row) => row.label);
    const modelLabels = question.facts.map((row) => row.modelLabel);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(modelLabels).size).toBe(modelLabels.length);

    for (const row of question.facts) {
      expect(row.label.trim()).toBeTruthy();
      expect(row.modelLabel.trim()).toBeTruthy();
      // 表头是中文、送模型的是英文：混了说明某一侧写错位置了。
      expect(/[\u4e00-\u9fff]/.test(row.label), row.label).toBe(true);
      expect(/[\u4e00-\u9fff]/.test(row.modelLabel), row.modelLabel).toBe(false);
    }
  });

  it("每一行都覆盖全部合法动作，且没有一个空值或洞", () => {
    const actions = [...point.actions].sort();
    for (const row of question.facts) {
      expect(Object.keys(row.values).sort(), `${row.modelLabel} 的列`).toEqual(actions);
      for (const action of actions) {
        const value = row.values[action];
        expect(typeof value, `${row.modelLabel} / ${action}`).toBe("string");
        expect(value.trim(), `${row.modelLabel} / ${action}`).toBeTruthy();
        // A missing fact must read as a word ("none"), never as a hole.
        expect(value, `${row.modelLabel} / ${action}`).not.toMatch(/undefined|null|NaN/);
      }
    }
  });

  it("拍平成 criteria 后每个动作都拿全 8 行", () => {
    for (const action of point.actions) {
      const lines = flatten(question.facts, action).split("\n");
      expect(lines.length).toBe(question.facts.length);
      for (const row of question.facts) {
        expect(lines).toContain(`${row.modelLabel}: ${row.values[action]}`);
      }
    }
  });

  it("指令说的是一次单选题，与后端校验口径一致", () => {
    expect(question.instructions).toContain("Choose Pac-Man's next direction");
    expect(question.instructions).toContain("Choose exactly one legal direction");
  });
});

describe("吃豆人 driver：兜底、落地与调试", () => {
  it("兜底永不选回头路，且只在合法动作里挑", () => {
    const state = playing(miniGame());
    placePacman(state, 8, 1, "LEFT");
    const point = PACMAN_DRIVER.decision(state) as NonNullable<ReturnType<typeof PACMAN_DRIVER.decision>>;

    const choice = PACMAN_DRIVER.fallback(state, point);
    expect(point.actions).toContain(choice.action);
    expect(choice.action).not.toBe("RIGHT");
    expect(choice.rule.trim()).toBeTruthy();
  });

  it("apply 把动作写成下一格要执行的方向", () => {
    const state = playing(miniGame());
    placePacman(state, 8, 1, "LEFT");
    expect(state.pacman.requestedDirection).toBeNull();

    PACMAN_DRIVER.apply(state, "DOWN");
    expect(state.pacman.requestedDirection).toBe("DOWN");
  });

  it("debug 只给游戏侧那一半（路口、合法动作、候选格、幽灵目标）", () => {
    const state = playing(miniGame());
    placePacman(state, 8, 1, "LEFT");
    const info = PACMAN_DRIVER.debug(state) as {
      junction: TilePosition | null;
      legalDirections: string[];
      candidateTiles: TilePosition[];
      ghostTargets: unknown[];
    };

    expect(info.junction).toEqual(tile(6, 1));
    expect(info.legalDirections).toEqual(["LEFT", "DOWN"]);
    expect(info.candidateTiles).toEqual([tile(5, 1), tile(6, 2)]);
    expect(info.ghostTargets).toEqual([]);
  });
});

describe("吃豆人 GameDefinition", () => {
  it("六个读数出口都在，且都是引擎现成的函数", () => {
    const state = PACMAN.createState({ seed: 7 });
    expect(state.seed).toBe(7);
    expect(PACMAN.meta.id).toBe("pacman");
    expect(PACMAN.vocab.order).toEqual(["UP", "LEFT", "DOWN", "RIGHT"]);

    PACMAN.start(state);
    expect(state.status).toBe("PLAYING");
    PACMAN.pause(state);
    expect(state.status).toBe("PAUSED");
    PACMAN.resume(state);
    expect(state.status).toBe("PLAYING");

    expect(PACMAN.bitmap(state)).toEqual({ width: state.maze.width * TILE, height: state.maze.height * TILE });
    expect(PACMAN.summary(state)).toMatchObject({ score: 0, lives: 3, level: 1, pelletsEaten: 0, ghostsEaten: 0 });
  });

  it("启发式玩家永远给一个合法动作", () => {
    const state = playing(miniGame());
    placePacman(state, 8, 1, "LEFT");

    const point = PACMAN.agent.decision(state) as NonNullable<ReturnType<typeof PACMAN.agent.decision>>;
    const action = PACMAN.heuristic(state, point.actions);
    expect(point.actions).toContain(action);
  });

  it("react 把引擎事件翻成表现层的动词（音效 + 粒子），不改玩法", () => {
    const state = playing(miniGame());
    const calls: string[] = [];
    const fx = {
      sound: (name: string) => calls.push(`sound:${name}`),
      trauma: () => calls.push("trauma"),
      freeze: () => calls.push("freeze"),
      flash: () => calls.push("flash"),
      spark: () => calls.push("spark"),
      burst: () => calls.push("burst"),
      popup: () => calls.push("popup"),
      confetti: () => calls.push("confetti"),
    };

    const before = { direction: state.pacman.direction, score: state.score };
    const events: PacmanEvent[] = [
      { type: "PELLET_EATEN", tile: tile(1, 1), score: 10 },
      { type: "GHOST_EATEN", ghost: "Blinky", score: 200 },
    ];
    PACMAN.react(events, state, fx);

    expect(calls).toContain("sound:chomp");
    expect(calls).toContain("sound:ghost");
    expect(calls).toContain("popup");
    // Presentation only: nothing about the world moved.
    expect({ direction: state.pacman.direction, score: state.score }).toEqual(before);
  });
});
