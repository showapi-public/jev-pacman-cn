/**
 * 蛇的**装配**：`GameDefinition` 上那些「接错了线也不会报错」的地方。
 *
 * 引擎、agent 侧各自都有测试，但把三者缝起来的那份对象没人看着。这里断言的都是
 * **接线**而不是算法 —— 它们的共同点是「错了照样能跑，只是悄悄跑不对」：
 *
 *  - `fixedDtMs` 如果挂上 `MOVE_MS`（500）而不是 60 Hz 的切片，控制器会一次都不提问、
 *    也一次都不兜底，界面看起来只是「模型一直不动」；`snake-agent.test.ts` 钉的是
 *    `FIXED_DT_MS / MOVE_MS ≤ commitWindow`，但**循环读的是这里的 `fixedDtMs`**，
 *    所以必须在这里再钉一次，否则挂错常量那组用例照样绿。
 *  - `keyActions` 里把 `ArrowUp` 写成 `ArrowDown`，手动模式不会报错，只是「上」变成了「下」。
 *  - `vocab.order` 不是动作全集时，概率阶梯会少画一列。
 *  - `meta` 与注册表里那一份不是同一个对象时，导航卡与机台会显示两个名字。
 */
import { describe, expect, it } from "vitest";

import { GAME_META, getGameMeta } from "@/lib/games/registry";
import { SNAKE } from "@/lib/games/snake/index";
import { SNAKE_DRIVER } from "@/lib/games/snake/agent";
import { createGame, startGame } from "@/lib/games/snake/engine";
import { SNAKE_KEY_ACTIONS, SNAKE_META, SNAKE_VOCAB } from "@/lib/games/snake/meta";
import { CELL } from "@/lib/games/snake/render";
import { BOARD_TILES, DIRECTIONS, FIXED_DT_MS, MOVE_MS } from "@/lib/games/snake/types";
import type { SnakeEvent } from "@/lib/games/snake/types";

function freshGame() {
  const state = createGame({ seed: 7 });
  startGame(state);
  return state;
}

describe("贪吃蛇的游戏定义", () => {
  it("注册表里的元数据就是这份定义用的那一份", () => {
    expect(SNAKE.meta).toBe(SNAKE_META);
    const registered = GAME_META.find((meta) => meta.id === "snake");
    expect(registered, "snake 没有登记进 GAME_META").toBe(SNAKE_META);
    expect(getGameMeta("snake")).toBe(SNAKE_META);
  });

  it("循环步长是 60 Hz 切片，不是走一格的 500 ms", () => {
    // 这条是整份定义里最容易接错、也最难从界面上看出来的一根线。
    expect(SNAKE.fixedDtMs).toBe(FIXED_DT_MS);
    expect(SNAKE.fixedDtMs).not.toBe(MOVE_MS);
    // 它同时必须落在提交窗口之内，否则 `arriving` 那一跳既不落地也不兜底。
    expect(SNAKE.fixedDtMs / MOVE_MS).toBeLessThanOrEqual(SNAKE.agent.commitWindow);
  });

  it("agent 就是那份 driver", () => {
    expect(SNAKE.agent).toBe(SNAKE_DRIVER);
    expect(SNAKE.agent.budgetMs).toBe(500);
    expect(SNAKE.agent.prefetch).toBe(1);
  });

  it("词表覆盖四个方向，顺序就是引擎的裁决顺序", () => {
    expect(SNAKE.vocab).toBe(SNAKE_VOCAB);
    expect([...SNAKE.vocab.order]).toEqual([...DIRECTIONS]);
    for (const direction of DIRECTIONS) {
      // 标签必须是人话：没写到的动作会把生字符串 `UP` 直接印到界面上。
      expect(SNAKE.vocab.label(direction), direction).not.toBe(direction);
      expect(SNAKE.vocab.slot(direction)).toBe(direction);
    }
    expect(SNAKE.vocab.slot("JUMP")).toBeNull();
  });

  it("手动模式的键位把四个方向键映射到四个方向", () => {
    expect(SNAKE.keyActions).toBe(SNAKE_KEY_ACTIONS);
    expect(Object.keys(SNAKE.keyActions).sort()).toEqual(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);
    expect(SNAKE.keyActions.ArrowUp).toBe("UP");
    expect(SNAKE.keyActions.ArrowRight).toBe("RIGHT");
    expect(SNAKE.keyActions.ArrowDown).toBe("DOWN");
    expect(SNAKE.keyActions.ArrowLeft).toBe("LEFT");
  });

  it("位图是盘面格数 × 每格像素", () => {
    const state = freshGame();
    expect(SNAKE.bitmap(state)).toEqual({ width: BOARD_TILES * CELL, height: BOARD_TILES * CELL });
    // 位图必须跟着盘面尺寸走：缩成 2×1 时不能还按 24×24 出图。
    const tiny = createGame({ seed: 1, width: 2, height: 1 });
    expect(SNAKE.bitmap(tiny)).toEqual({ width: 2 * CELL, height: CELL });
  });

  it("每一步都能落到状态上：apply 之后再 step 一格，方向真的变了", () => {
    const state = freshGame();
    const point = SNAKE.agent.decision(state);
    expect(point).not.toBeNull();
    if (!point) return;

    SNAKE.agent.apply(state, "UP");
    expect(state.requested).toBe("UP");
    SNAKE.step(state, MOVE_MS);
    expect(state.heading).toBe("UP");
    expect(state.moves).toBe(1);
  });

  it("事件都能说成人话，且三种都说了", () => {
    const events: SnakeEvent[] = [
      { type: "FOOD_EATEN", cell: { x: 3, y: 4 }, score: 2, length: 11 },
      { type: "SNAKE_DIED", reason: "WALL" },
      { type: "SNAKE_DIED", reason: "SELF" },
      { type: "BOARD_CLEARED" },
    ];
    for (const event of events) {
      const line = SNAKE.describeEvent(event);
      expect(typeof line, event.type).toBe("string");
      expect(line.trim(), event.type).toBeTruthy();
      expect(line, event.type).not.toMatch(/undefined|NaN/);
    }
    // 两种死法要分开说：撞墙与自撞是两件事。
    // 先存成 `SnakeEvent` 再传 —— 契约上 `describeEvent` 收的是 `GameEvent`，
    // 直接写字面量会被「多余属性」检查拦下（那正是契约在替我们守的事）。
    const intoWall: SnakeEvent = { type: "SNAKE_DIED", reason: "WALL" };
    const intoSelf: SnakeEvent = { type: "SNAKE_DIED", reason: "SELF" };
    expect(SNAKE.describeEvent(intoWall)).not.toBe(SNAKE.describeEvent(intoSelf));
  });

  it("导出 JSON 的汇总里有这一局的读数", () => {
    const state = freshGame();
    const summary = SNAKE.summary(state);
    expect(summary.length).toBe(state.body.length);
    expect(summary.moves).toBe(state.moves);
    expect(summary.heading).toBe(state.heading);
    expect(summary.freeCells).toBe(BOARD_TILES * BOARD_TILES - state.body.length);
  });

  it("启发式玩家接上了对照玩家，且只从给它的动作里挑", () => {
    const state = freshGame();
    const point = SNAKE.agent.decision(state);
    expect(point).not.toBeNull();
    if (!point) return;

    // 不钉具体方向：食物是随机落点的，四条路的远近本来就不同。
    // 要钉的是「它只在被告知的那一批里挑」—— 控制器与它必须看同一个动作集。
    expect(point.actions).toContain(SNAKE.heuristic(state, point.actions));
    expect(["LEFT", "RIGHT"]).toContain(SNAKE.heuristic(state, ["LEFT", "RIGHT"]));
    expect(SNAKE.heuristic(state, ["DOWN"])).toBe("DOWN");
  });
});
