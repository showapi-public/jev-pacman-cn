/**
 * 贪吃蛇引擎。**实现之前先写**（TDD）—— 它同时是「规则到底按哪一版」的说明书。
 *
 * 上游是 patorjk/JavaScript-Snake（MIT）：DOM 版、`setTimeout` 递归驱动、`Math.random`
 * 放食物、盘面尺寸随视口。这里保真的只有**规则**（方向编码、禁止 180° 反向、每食 +5 节、
 * 尾巴让位合法、无空格放食物即胜），驱动与随机数换成项目自己的一套，理由写在
 * `docs/design-multi-game.md` §9；换成固定步长 + 累加器还有一个直接后果：
 * **同一 seed + 同一串方向，逐帧重放出同一局**，跨模型比较才有意义。
 *
 * 几处刻意的写法，别改成「更自然」的版本：
 *  - 推进用 `advance()`（跑到 `moves` 增长为止），不用「推进 500 ms」—— `1000/60` 是二进制
 *    无限小数，30 × 16.67 落在 500 的哪一侧取决于浮点，按毫秒凑整会随机红。
 *  - `putBody()` 顺手把食物清掉：绝大多数用例要的是几何，不该让一颗随机落点的食物
 *    决定「第 5 步会不会突然长身体」。需要食物的用例自己 `putFood()`。
 *  - 撞死之后**不移动**：盘面保持死亡那一刻的样子，否则蛇头会探出墙外。
 */
import { describe, expect, it } from "vitest";

import {
  distanceToFood,
  freedomAfter,
  freeCellsAfter,
  isLethal,
  legalActions,
  reachableCount,
} from "@/lib/games/snake/analysis";
import { createGame, pauseGame, resumeGame, startGame, steer, stepGame } from "@/lib/games/snake/engine";
import { BOARD_TILES, FIXED_DT_MS, GROWTH_PER_FOOD, MOVE_MS } from "@/lib/games/snake/types";
import type { Direction, SnakeCell, SnakeEvent, SnakeState } from "@/lib/games/snake/types";

/* ---------------------------------------------------------------- 夹具 */

function game(options: { seed?: number; width?: number; height?: number } = {}): SnakeState {
  const state = createGame({ seed: 1, ...options });
  startGame(state);
  return state;
}

/** 默认盘面的出生点：正中间那一格。 */
const CENTRE: SnakeCell = { x: BOARD_TILES / 2, y: BOARD_TILES / 2 };

function at(cells: readonly (readonly [number, number])[]): SnakeCell[] {
  return cells.map(([x, y]) => ({ x, y }));
}

/** 直接摆一条身体（头在前）并清空食物。测的是几何，不必真把蛇喂大。 */
function putBody(state: SnakeState, cells: SnakeCell[], heading: Direction | null = null): void {
  state.body = cells.map((cell) => ({ ...cell }));
  state.heading = heading;
  state.requested = null;
  state.growth = 0;
  state.food = null;
}

function putFood(state: SnakeState, x: number, y: number): void {
  state.food = { x, y };
}

/** 按固定步长切片推进，模拟共用循环。 */
function run(state: SnakeState, ms: number): SnakeEvent[] {
  const events: SnakeEvent[] = [];
  for (let elapsed = 0; elapsed < ms; elapsed += FIXED_DT_MS) {
    events.push(...stepGame(state, FIXED_DT_MS));
  }
  return events;
}

/** 推进到恰好发生 `count` 次整格移动（浮点无关：跑到 `moves` 增长为止）。 */
function advance(state: SnakeState, count: number): SnakeEvent[] {
  const events: SnakeEvent[] = [];
  for (let done = 0; done < count; done += 1) {
    const target = state.moves + 1;
    for (let guard = 0; state.moves < target && guard < 400; guard += 1) {
      events.push(...stepGame(state, FIXED_DT_MS));
    }
  }
  return events;
}

/* ---------------------------------------------------------------- 出生 */

describe("贪吃蛇 · 出生", () => {
  it("默认 24×24，长度 1，出生在正中间，食物已经在盘上且不在身上", () => {
    const state = game();
    expect(state.status).toBe("PLAYING");
    expect(state.board).toEqual({ width: BOARD_TILES, height: BOARD_TILES });
    expect(state.body).toEqual([CENTRE]);
    expect(state.heading).toBeNull();
    expect(state.growth).toBe(0);
    expect(state.score).toBe(0);
    expect(state.food).not.toBeNull();
    expect(state.food).not.toEqual(CENTRE);
  });

  it("出生时就没有空格的盘面直接算通关（不留一个死局）", () => {
    const state = createGame({ seed: 1, width: 1, height: 1 });
    expect(state.status).toBe("CLEARED");
    expect(state.food).toBeNull();
  });
});

/* ------------------------------------------------------------ 移动与累加器 */

describe("贪吃蛇 · 移动与累加器", () => {
  it("不满一整格不动，够一格走一格", () => {
    const state = game();
    putBody(state, [CENTRE], null);
    steer(state, "RIGHT");

    stepGame(state, MOVE_MS - 1);
    expect(state.body).toEqual([CENTRE]);
    expect(state.moves).toBe(0);
    expect(state.stepAccumMs).toBe(MOVE_MS - 1);

    stepGame(state, 1);
    expect(state.body).toEqual([{ x: CENTRE.x + 1, y: CENTRE.y }]);
    expect(state.moves).toBe(1);
    expect(state.stepAccumMs).toBe(0);
  });

  it("一次给足三格的时间就走三格，不留余额（切片多长都不改变结果）", () => {
    const state = game();
    putBody(state, [CENTRE], null);
    steer(state, "RIGHT");
    stepGame(state, MOVE_MS * 3);
    expect(state.body[0]).toEqual({ x: CENTRE.x + 3, y: CENTRE.y });
    expect(state.moves).toBe(3);
    expect(state.stepAccumMs).toBe(0);
  });

  it("没有方向就不走，也不把整格时间吃掉（否则第一次提问会死锁）", () => {
    const state = game();
    putBody(state, [CENTRE], null);

    run(state, MOVE_MS * 2);
    expect(state.body).toEqual([CENTRE]);
    expect(state.moves).toBe(0);
    // 满格等着：方向一到就立刻走，不必再等一个周期
    expect(state.stepAccumMs).toBe(MOVE_MS);

    steer(state, "DOWN");
    stepGame(state, FIXED_DT_MS);
    expect(state.moves).toBe(1);
  });
});

/* ------------------------------------------------------------------ 进食 */

describe("贪吃蛇 · 吃到食物", () => {
  it("吃到当步 +1 节，随后 4 步再各 +1，合计 +5", () => {
    const state = game();
    putBody(state, at([[12, 12]]), "RIGHT");
    putFood(state, 13, 12);

    const events = advance(state, 1);
    expect(state.body).toEqual(at([[13, 12], [12, 12]]));
    expect(state.score).toBe(1);
    expect(state.growth).toBe(GROWTH_PER_FOOD - 1);
    expect(events).toContainEqual({ type: "FOOD_EATEN", cell: { x: 13, y: 12 }, score: 1, length: 2 });
    expect(state.food).not.toBeNull();
    expect(state.food).not.toEqual({ x: 13, y: 12 });

    advance(state, GROWTH_PER_FOOD - 1);
    expect(state.body.length).toBe(1 + GROWTH_PER_FOOD);
  });

  it("新食物一定落在空格上，不会压在蛇身上", () => {
    const state = game();
    putBody(state, at([[12, 12], [11, 12], [10, 12]]), "RIGHT");
    putFood(state, 13, 12);
    advance(state, 1);

    const occupied = new Set(state.body.map((cell) => `${cell.x},${cell.y}`));
    expect(state.food).not.toBeNull();
    expect(occupied.has(`${state.food?.x},${state.food?.y}`)).toBe(false);
  });
});

/* ------------------------------------------------------------------ 死亡 */

describe("贪吃蛇 · 死亡", () => {
  it("撞墙：GAME_OVER 与 SNAKE_DIED{WALL}，且没有走到盘外", () => {
    const state = game();
    putBody(state, at([[0, 5]]), "LEFT");

    const events = advance(state, 1);
    expect(state.status).toBe("GAME_OVER");
    expect(events).toContainEqual({ type: "SNAKE_DIED", reason: "WALL" });
    expect(state.body).toEqual(at([[0, 5]]));
  });

  it("咬到自己身体的中段：GAME_OVER 与 SNAKE_DIED{SELF}", () => {
    // 一个 U 形，头在左上角朝上走。向右 → 向下 → 再向下就撞进 U 形自己的底边。
    const state = game();
    putBody(state, at([[3, 3], [3, 4], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3]]), "UP");

    steer(state, "RIGHT");
    advance(state, 1);
    steer(state, "DOWN");
    advance(state, 1);
    steer(state, "DOWN");

    const events = advance(state, 1);
    expect(state.status).toBe("GAME_OVER");
    expect(events).toContainEqual({ type: "SNAKE_DIED", reason: "SELF" });
    expect(state.body[0]).toEqual({ x: 4, y: 4 }); // 停在最后一格，没有钻进身体
  });

  it("死了就不再推进", () => {
    const state = game();
    putBody(state, at([[0, 5]]), "LEFT");
    advance(state, 1);
    const moves = state.moves;

    expect(run(state, MOVE_MS * 3)).toEqual([]);
    expect(state.moves).toBe(moves);
  });
});

/* -------------------------------------------------------------- 尾巴让位 */

describe("贪吃蛇 · 尾巴让出的那格算合法", () => {
  /** 一个钩形：头 (5,5)，尾巴 (6,5) —— 向右走正好踩在尾巴上。 */
  const HOOK = at([[5, 5], [5, 6], [5, 7], [6, 7], [6, 6], [6, 5]]);

  it("尾巴这一步会离开，所以踩上去不死，身体也整体前移", () => {
    const state = game();
    putBody(state, HOOK, "UP");
    steer(state, "RIGHT");

    const events = advance(state, 1);
    expect(events).toEqual([]);
    expect(state.status).toBe("PLAYING");
    expect(state.body).toEqual(at([[6, 5], [5, 5], [5, 6], [5, 7], [6, 7], [6, 6]]));
  });

  it("同样的几何，但这一步还要长身体：尾巴不让位，撞死", () => {
    const state = game();
    putBody(state, HOOK, "UP");
    state.growth = 1; // 刚吃过食物，还在长
    steer(state, "RIGHT");

    const events = advance(state, 1);
    expect(state.status).toBe("GAME_OVER");
    expect(events).toContainEqual({ type: "SNAKE_DIED", reason: "SELF" });
    expect(state.body).toEqual(HOOK);
  });
});

/* -------------------------------------------------------------- 方向规则 */

describe("贪吃蛇 · 方向规则", () => {
  it("禁止 180° 反向：朝右时请求向左会被忽略", () => {
    const state = game();
    putBody(state, at([[5, 5], [4, 5]]), "RIGHT");

    expect(steer(state, "LEFT")).toBe(false);
    advance(state, 2);
    expect(state.heading).toBe("RIGHT");
    expect(state.body).toEqual(at([[7, 5], [6, 5]]));
  });

  it("首步例外：还没有朝向时任何方向都接受", () => {
    const state = game();
    expect(state.heading).toBeNull();
    expect(steer(state, "LEFT")).toBe(true);

    advance(state, 1);
    expect(state.heading).toBe("LEFT");
    // 长度 1 的蛇走一格还是长度 1：头前进，尾巴跟着让位。
    expect(state.body).toEqual(at([[CENTRE.x - 1, CENTRE.y]]));
  });

  it("转向请求被这一步消费掉，之后一路沿新朝向走", () => {
    const state = game();
    putBody(state, at([[5, 5], [4, 5]]), "RIGHT");
    steer(state, "DOWN");
    advance(state, 1);
    expect(state.requested).toBeNull();

    advance(state, 2);
    expect(state.body[0]).toEqual({ x: 5, y: 8 });
  });
});

/* ------------------------------------------------------------------ 胜利 */

describe("贪吃蛇 · 胜利", () => {
  it("吃掉最后一颗食物、盘面再无空格 → CLEARED 与 BOARD_CLEARED", () => {
    const state = game({ seed: 1, width: 2, height: 1 });
    expect(state.body).toEqual([{ x: 1, y: 0 }]);
    expect(state.food).toEqual({ x: 0, y: 0 });
    steer(state, "LEFT");

    const events = advance(state, 1);
    expect(state.status).toBe("CLEARED");
    expect(events).toContainEqual({ type: "BOARD_CLEARED" });
    expect(state.score).toBe(1);
    expect(state.food).toBeNull();

    expect(stepGame(state, MOVE_MS)).toEqual([]);
  });
});

/* -------------------------------------------------------------- 状态迁移 */

describe("贪吃蛇 · 状态迁移", () => {
  it("READY 与 PAUSED 时时钟不动", () => {
    const state = createGame({ seed: 1 });
    steer(state, "RIGHT");
    run(state, MOVE_MS * 2);
    expect(state.moves).toBe(0);
    expect(state.playTimeMs).toBe(0);

    startGame(state);
    pauseGame(state);
    run(state, MOVE_MS * 2);
    expect(state.moves).toBe(0);

    resumeGame(state);
    advance(state, 1);
    expect(state.moves).toBe(1);
    expect(state.playTimeMs).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ 确定性 */

describe("贪吃蛇 · 确定性", () => {
  /** 一帧的可观察投影。 */
  function project(state: SnakeState): string {
    return JSON.stringify({
      body: state.body,
      food: state.food,
      score: state.score,
      heading: state.heading,
      moves: state.moves,
      status: state.status,
    });
  }

  /** 贪着食物走的脚本玩家：先竖直后水平地靠近，非法就退回第一个合法动作。 */
  function greedy(state: SnakeState): Direction | null {
    const food = state.food;
    if (!food) return null;
    const legal = legalActions(state);
    if (legal.length === 0) return null;
    const head = state.body[0];
    const wanted: Direction[] = [];
    if (food.y < head.y) wanted.push("UP");
    if (food.y > head.y) wanted.push("DOWN");
    if (food.x < head.x) wanted.push("LEFT");
    if (food.x > head.x) wanted.push("RIGHT");
    return wanted.find((direction) => legal.includes(direction)) ?? legal[0];
  }

  function play(seed: number, moves: number): { frames: string[]; score: number } {
    const state = createGame({ seed, width: 8, height: 8 });
    startGame(state);
    const frames: string[] = [];
    for (let step = 0; step < moves && state.status === "PLAYING"; step += 1) {
      const wanted = greedy(state);
      if (wanted) steer(state, wanted);
      advance(state, 1);
      frames.push(project(state));
    }
    return { frames, score: state.score };
  }

  it("同一串方向 + 同一 seed：逐帧完全一致，且真的吃到了食物", () => {
    const first = play(7, 30);
    const again = play(7, 30);
    expect(again.frames).toEqual(first.frames);
    // 没吃到食物的话，这条用例根本没覆盖「放食物」那一步
    expect(first.score).toBeGreaterThan(0);
  });

  it("换 seed 就分叉", () => {
    expect(play(7, 30).frames).not.toEqual(play(8, 30).frames);
  });

  it("第一颗食物由 seed 决定", () => {
    expect(createGame({ seed: 5 }).food).toEqual(createGame({ seed: 5 }).food);
    expect(createGame({ seed: 5 }).food).not.toEqual(createGame({ seed: 6 }).food);
  });
});

/* ------------------------------------------------------------------ 分析 */

describe("贪吃蛇 · 安全性与可达空间", () => {
  it("贴墙时朝墙的方向立刻致命，别的方向不致命", () => {
    const state = game();
    putBody(state, at([[0, 5]]), "LEFT");
    expect(isLethal(state, "LEFT")).toBe(true);
    expect(isLethal(state, "RIGHT")).toBe(false);
    expect(isLethal(state, "UP")).toBe(false);
  });

  it("身体中段致命，尾巴那格不致命；反向整体被排除", () => {
    const state = game();
    putBody(state, at([[5, 5], [5, 6], [5, 7], [6, 7], [6, 6], [6, 5]]), "UP");
    expect(isLethal(state, "RIGHT")).toBe(false); // 那是尾巴
    expect(legalActions(state)).toEqual(["UP", "RIGHT", "LEFT"]); // 反向的 DOWN 不在里面
  });

  it("可达空格数按四向连通数，蛇身是障碍（尾巴会让出的那格不算）", () => {
    const state = game({ width: 8, height: 8 });
    // 竖直三节，头 (4,4) 朝上；向上走之后头 (4,3)，尾 (4,6) 让位 → 占 3 格
    putBody(state, at([[4, 4], [4, 5], [4, 6]]), "UP");
    expect(freeCellsAfter(state, "UP")).toBe(8 * 8 - 3);
  });

  it("自由度：走进角落就只剩一条路", () => {
    const state = game({ width: 3, height: 3 });
    // 头 (0,1) 朝下，身体只有两节。
    putBody(state, at([[0, 1], [0, 0]]), "DOWN");
    // 向上走到 (0,0) 之后：上边和左边都是墙，下面是反向 —— 只剩向右这一条。
    expect(freedomAfter(state, "UP")).toBe(1);
    // 向右走到 (1,1) 之后还留在开阔处：上、右、下三条都在。
    expect(freedomAfter(state, "RIGHT")).toBe(3);
  });

  it("身体把盘面切成两半时，flood fill 只数得清自己那一半", () => {
    const state = game({ width: 5, height: 5 });
    const wall = new Set(["2,0", "2,1", "2,2", "2,3", "2,4"]);
    // x=2 整列当墙：左侧 x∈{0,1} 共 10 格，起点自己不算，所以是 9
    expect(reachableCount(state.board, { x: 0, y: 0 }, wall)).toBe(9);
  });

  it("到食物的 BFS 距离绕开蛇身，被围住时给 null", () => {
    const state = game();
    putBody(state, at([[0, 0]]), null);
    putFood(state, 3, 0);
    expect(distanceToFood(state, { x: 0, y: 0 })).toBe(3);

    // 把 (3,0) 的三个邻居全占掉 → 它成了一座孤岛
    state.body = at([[2, 0], [4, 0], [3, 1]]);
    expect(distanceToFood(state, { x: 0, y: 0 })).toBeNull();
  });

  it("没有食物（已通关）时距离是 null，不是 0 或 NaN", () => {
    const state = game();
    state.food = null;
    expect(distanceToFood(state, { x: 3, y: 3 })).toBeNull();
  });
});
