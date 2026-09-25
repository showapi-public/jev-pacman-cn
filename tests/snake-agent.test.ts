/**
 * 贪吃蛇 driver：控制器唯一看得见的那个缝（`DecisionPoint` / `Question` / `action`）。
 *
 * 用例覆盖的正是控制器那段预取 / 提交 / 超时 / 世代作废逻辑依赖的东西，所以这里断言的是
 * **契约**而不是实现细节：`actions` 的集合、`distance` 与 `arriving` 的边界、事实表每一行
 * 是否覆盖全部动作、兜底会不会把蛇送死。
 *
 * 一处与计划原文不同的口径，已在用例里钉住：`actions` 是**四向减去 180° 反向**（3 个或首步 4 个），
 * **不是**剔除致命方向。死路也是一次选择，平台要测的正是模型会不会踩进去 ——
 * 这也让「立刻致命」这一行事实有意义，并让兜底的第 4 条（全致命时按当前朝向）不是死代码。
 */
import { describe, expect, it } from "vitest";

import { SNAKE_DRIVER, SNAKE_INSTRUCTIONS, heuristicChoice } from "@/lib/games/snake/agent";
import type { SnakeObservation } from "@/lib/games/snake/agent";
import { isLethal } from "@/lib/games/snake/analysis";
import { createGame, startGame, stepGame } from "@/lib/games/snake/engine";
import { BOARD_TILES, DIRECTIONS, FIXED_DT_MS, MOVE_MS } from "@/lib/games/snake/types";
import { buildCriteria } from "@/lib/jev/prompt";
import type { DecisionPoint } from "@/lib/games/types";
import type { Direction, SnakeCell, SnakeState } from "@/lib/games/snake/types";

/* ---------------------------------------------------------------- 夹具 */

function snakeGame(options: { seed?: number; width?: number; height?: number } = {}): SnakeState {
  const state = createGame({ seed: 1, ...options });
  startGame(state);
  return state;
}

function at(cells: readonly (readonly [number, number])[]): SnakeCell[] {
  return cells.map(([x, y]) => ({ x, y }));
}

/** 摆一条身体（头在前）并清空食物：用例要的是几何，不该被随机落点的食物搅局。 */
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

/** 断言这一局**应该**有决策点，顺便把 `null` 收窄掉。 */
function pointOf(state: SnakeState): DecisionPoint {
  const point = SNAKE_DRIVER.decision(state);
  if (!point) throw new Error("这一局本应有一个决策点");
  return point;
}

/** 取事实表某一行的值。行名写错就直接炸，不会静默跳过。 */
function rowOf(state: SnakeState, label: string): Record<string, string> {
  const point = pointOf(state);
  const row = SNAKE_DRIVER.frame(state, point).facts.find((candidate) => candidate.label === label);
  if (!row) throw new Error(`事实表里没有「${label}」这一行`);
  return row.values;
}

/** 推进恰好一步（浮点无关）。 */
function stepOnce(state: SnakeState): void {
  const target = state.moves + 1;
  for (let guard = 0; state.moves < target && guard < 400; guard += 1) stepGame(state, FIXED_DT_MS);
}

/* -------------------------------------------------------------- 决策点 */

describe("贪吃蛇 driver：决策点", () => {
  it("未开局时不给决策点", () => {
    const state = createGame({ seed: 1 });
    expect(state.status).not.toBe("PLAYING");
    expect(SNAKE_DRIVER.decision(state)).toBeNull();
  });

  it("首步：朝向未定，四个方向都算，facing 是 null", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12]]), null);

    const point = pointOf(state);
    expect(point.key).toBe(`${state.epoch}:0`);
    expect(point.at).toEqual({ x: 12, y: 12 });
    expect(point.actions).toEqual([...DIRECTIONS]);
    expect(point.facing).toBeNull();
  });

  it("有朝向后 actions 是四向减去 180° 反向", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12], [11, 12]]), "RIGHT");

    const point = pointOf(state);
    // 反向的 LEFT 不在里面；顺序就是 DIRECTIONS。
    expect(point.actions).toEqual(["UP", "RIGHT", "DOWN"]);
    expect(point.facing).toBe("RIGHT");
  });

  it("distance 与 arriving 跟着累加器走", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12]]), "RIGHT");

    state.stepAccumMs = 0;
    expect(pointOf(state).distance).toBe(1);
    expect(pointOf(state).arriving).toBe(false);

    // 再来一个切片正好走满 —— 这一跳就是「答案该落地了」的那一跳。
    state.stepAccumMs = MOVE_MS - FIXED_DT_MS;
    expect(pointOf(state).distance).toBeCloseTo(FIXED_DT_MS / MOVE_MS, 6);
    expect(pointOf(state).arriving).toBe(true);

    // 还没有方向时累加器停在满格等：距离 0、已抵达。
    state.stepAccumMs = MOVE_MS;
    expect(pointOf(state).distance).toBe(0);
    expect(pointOf(state).arriving).toBe(true);
  });

  it("最后一跳的距离必须落在提交窗口之内，否则控制器提交不了也兜底不了", () => {
    // 这是 `fixedDtMs ≤ commitWindow × MOVE_MS` 的实测版：控制器在 arriving 那一跳只有
    // 「答案已到手」与「distance ≤ commitWindow」两个分支，都不满足就什么也不做 ——
    // 一次都不提问、也一次都不兜底。见 `GameDefinition.fixedDtMs`。
    expect(FIXED_DT_MS / MOVE_MS).toBeLessThanOrEqual(SNAKE_DRIVER.commitWindow);
  });

  it("预算与预取是计划里那两个数", () => {
    expect(SNAKE_DRIVER.prefetch).toBe(1);
    expect(SNAKE_DRIVER.budgetMs).toBe(500);
    expect(SNAKE_DRIVER.commitWindow).toBe(0.05);
  });

  it("key 用 epoch:步数，走一步就换一个", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12], [11, 12]]), "RIGHT");
    expect(pointOf(state).key).toBe(`${state.epoch}:0`);

    stepOnce(state);
    expect(state.moves).toBe(1);
    expect(pointOf(state).key).toBe(`${state.epoch}:1`);
  });

  it("唯一活路就是继续直行时不提问（没什么可决定的）", () => {
    const state = snakeGame();
    // 头朝右 (5,5)：上面 (5,4) 与下面 (5,6) 都是自己的身体，右边 (6,5) 空着。
    putBody(
      state,
      at([[5, 5], [4, 5], [4, 4], [5, 4], [6, 4], [7, 4], [7, 5], [7, 6], [6, 6], [5, 6], [4, 6], [3, 6], [3, 7]]),
      "RIGHT",
    );
    // 这里不能借 `pointOf` 取几何：它断言「本应有一个决策点」，而这一局恰恰不该有。
    // 安全方向从 `debug()` 读 —— 那正是调试覆盖层用的同一份计算。
    const info = SNAKE_DRIVER.debug(state) as { safe: Direction[] };
    expect(info.safe).toEqual(["RIGHT"]);
    expect(SNAKE_DRIVER.decision(state)).toBeNull();
  });

  it("唯一活路是一次转向时**仍然**提问：不问就没人给方向，蛇会直着撞死", () => {
    const state = snakeGame();
    // 头朝右 (5,5)：右边 (6,5) 与下面 (5,6) 是身体，只有上面 (5,4) 通。
    putBody(
      state,
      at([[5, 5], [4, 5], [4, 6], [5, 6], [5, 7], [6, 7], [6, 6], [6, 5], [7, 5], [7, 4]]),
      "RIGHT",
    );
    const safe = pointOf(state).actions.filter((d) => !isLethal(state, d as Direction));
    expect(safe).toEqual(["UP"]);

    const point = SNAKE_DRIVER.decision(state);
    expect(point).not.toBeNull();
    expect(point?.actions).toEqual(["UP", "RIGHT", "DOWN"]);
  });

  it("三个方向全致命时也提问，兜底的第 4 条才有地方用", () => {
    const state = snakeGame();
    putBody(
      state,
      at([[5, 5], [4, 5], [4, 4], [5, 4], [5, 3], [6, 3], [6, 4], [6, 5], [6, 6], [5, 6], [4, 6], [4, 7]]),
      "RIGHT",
    );
    const point = pointOf(state);
    expect(point.actions.filter((d) => !isLethal(state, d as Direction))).toEqual([]);
    expect(SNAKE_DRIVER.fallback(state, point).action).toBe("RIGHT");
    expect(SNAKE_DRIVER.fallback(state, point).rule).toContain("死路");
  });
});

/* -------------------------------------------------------------- 事实表 */

describe("贪吃蛇 driver：事实表", () => {
  const labels = ["立刻致命", "该方向可达空格数", "距食物（格）", "是否沿当前朝向", "该方向的自由度", "蛇长"];

  it("行数是固定的 6 行，标签不重不漏且中英各就各位", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12]]), "RIGHT");
    const question = SNAKE_DRIVER.frame(state, pointOf(state));

    expect(question.facts.map((row) => row.label)).toEqual(labels);
    const modelLabels = question.facts.map((row) => row.modelLabel);
    expect(new Set(modelLabels).size).toBe(modelLabels.length);
    for (const row of question.facts) {
      expect(row.label.trim()).toBeTruthy();
      expect(row.modelLabel.trim()).toBeTruthy();
      // 表头中文、送模型英文：混了说明某一侧写错位置了。
      expect(/[\u4e00-\u9fff]/.test(row.label), row.label).toBe(true);
      expect(/[\u4e00-\u9fff]/.test(row.modelLabel), row.modelLabel).toBe(false);
    }
  });

  it("每一行都覆盖全部动作，且没有一个空洞", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12]]), "RIGHT");
    const point = pointOf(state);
    const actions = [...point.actions].sort();

    for (const row of SNAKE_DRIVER.frame(state, point).facts) {
      expect(Object.keys(row.values).sort(), `${row.modelLabel} 的列`).toEqual(actions);
      for (const action of actions) {
        const value = row.values[action];
        expect(typeof value, `${row.modelLabel} / ${action}`).toBe("string");
        expect(value.trim(), `${row.modelLabel} / ${action}`).toBeTruthy();
        // 缺失必须读成一个词（"unreachable"），不能是一个洞。
        expect(value, `${row.modelLabel} / ${action}`).not.toMatch(/undefined|null|NaN/);
      }
    }
  });

  it("用真的 criteria 装配器拍平后，每个动作都拿全 6 行", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12]]), "RIGHT");
    const point = pointOf(state);
    const question = SNAKE_DRIVER.frame(state, point);

    // 用服务端那一份装配器，而不是在用例里照抄一遍拼法：抄一遍的话，
    // 「模型看到的」和「右栏显示的」真分叉时，这条用例照样会绿。
    const criteria = buildCriteria(question.facts, point.actions);

    expect(Object.keys(criteria).sort()).toEqual([...point.actions].sort());
    for (const action of point.actions) {
      const lines = criteria[action].split("\n");
      expect(lines, action).toHaveLength(question.facts.length);
      for (const row of question.facts) {
        expect(criteria[action], `${row.modelLabel} / ${action}`).toContain(`${row.modelLabel}: ${row.values[action]}`);
      }
    }
  });

  it("「立刻致命」随方向变：贴右墙朝右时只有 RIGHT 是 yes", () => {
    const state = snakeGame();
    putBody(state, at([[BOARD_TILES - 1, 12]]), "RIGHT");
    expect(rowOf(state, "立刻致命")).toEqual({ UP: "no", RIGHT: "yes", DOWN: "no" });
  });

  it("致命的方向：可达空格与自由度都是 0，到食物读作 unreachable", () => {
    const state = snakeGame();
    putBody(state, at([[BOARD_TILES - 1, 12]]), "RIGHT");
    putFood(state, 2, 2);

    expect(rowOf(state, "该方向可达空格数").RIGHT).toBe("0");
    expect(rowOf(state, "该方向的自由度").RIGHT).toBe("0");
    expect(rowOf(state, "距食物（格）").RIGHT).toBe("unreachable");
    // 安全的方向必须给真数，否则「都是 0」这条断言没意义。
    expect(Number(rowOf(state, "该方向可达空格数").UP)).toBeGreaterThan(0);
    expect(rowOf(state, "距食物（格）").UP).not.toBe("unreachable");
  });

  it("「是否沿当前朝向」只有当前朝向那一列是 yes", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12], [11, 12]]), "RIGHT");
    expect(rowOf(state, "是否沿当前朝向")).toEqual({ UP: "no", RIGHT: "yes", DOWN: "no" });
  });

  it("「蛇长」读的是当前长度，与动作无关", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12], [11, 12], [10, 12]]), "RIGHT");
    expect(rowOf(state, "蛇长")).toEqual({ UP: "3", RIGHT: "3", DOWN: "3" });
  });

  it("指令说的是一次单选题，与后端校验口径一致", () => {
    expect(SNAKE_INSTRUCTIONS).toContain("Choose exactly one legal direction");
    expect(SNAKE_INSTRUCTIONS).toContain("snake");
  });
});

/* ---------------------------------------------------------------- 兜底 */

describe("贪吃蛇 driver：兜底", () => {
  it("有安全方向时永不选立刻致命的动作", () => {
    const state = snakeGame();
    putBody(state, at([[BOARD_TILES - 1, 12], [BOARD_TILES - 2, 12]]), "RIGHT");
    const point = pointOf(state);

    // 右边是墙（RIGHT 致命），另外两条是活路。
    expect(isLethal(state, "RIGHT")).toBe(true);
    const choice = SNAKE_DRIVER.fallback(state, point);
    expect(choice.action).not.toBe("RIGHT");
    expect(point.actions).toContain(choice.action);
    expect(choice.rule.trim()).toBeTruthy();
  });

  it("第一条规则就是保持朝向", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12], [11, 12]]), "RIGHT");
    const choice = SNAKE_DRIVER.fallback(state, pointOf(state));
    expect(choice.action).toBe("RIGHT");
    expect(choice.rule).toBe("保持当前朝向");
  });

  it("朝向致命时退到唯一安全方向", () => {
    const state = snakeGame();
    putBody(
      state,
      at([[5, 5], [4, 5], [4, 6], [5, 6], [5, 7], [6, 7], [6, 6], [6, 5], [7, 5], [7, 4]]),
      "RIGHT",
    );
    const choice = SNAKE_DRIVER.fallback(state, pointOf(state));
    expect(choice.action).toBe("UP");
    expect(choice.rule).toBe("唯一安全方向");
  });

  it("安全方向多于一个时挑可达空格最多的", () => {
    // 窄盘（3×5）上把身体横在 y=3 一行，把盘面切成上下两个房间。
    // 头 (2,2) 朝右 —— 右边就是墙，所以规则 1（保持朝向）在这一局不成立，规则 3 才有机会出场。
    const state = snakeGame({ width: 3, height: 5 });
    putBody(state, at([[2, 2], [1, 2], [1, 3], [0, 3], [0, 4]]), "RIGHT");

    // 先钉住前提：两条活路，而且上面那个房间确实更大。
    // 不钉的话，并列时按 `DIRECTIONS` 顺序也正好会取 UP，这条用例就成了空转。
    expect(isLethal(state, "RIGHT")).toBe(true);
    const space = rowOf(state, "该方向可达空格数");
    expect(Number(space.UP)).toBeGreaterThan(Number(space.DOWN));

    const choice = SNAKE_DRIVER.fallback(state, pointOf(state));
    expect(choice.action).toBe("UP");
    expect(choice.rule).toBe("可达空格最多");
  });
});

/* ------------------------------------------------- 落地、观察与对照玩家 */

describe("贪吃蛇 driver：落地与观察", () => {
  it("apply 把动作写成下一次整格要执行的方向", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12], [11, 12]]), "RIGHT");
    expect(state.requested).toBeNull();

    SNAKE_DRIVER.apply(state, "UP");
    expect(state.requested).toBe("UP");

    // 反向仍然进不来（`steer` 在写入时就拒掉）。
    SNAKE_DRIVER.apply(state, "LEFT");
    expect(state.requested).toBe("UP");
  });

  it("观察里蛇身是有序的 [x,y] 数组，长度、空格数、食物距离都算对", () => {
    const state = snakeGame();
    putBody(state, at([[5, 5], [5, 6], [5, 7]]), "UP");
    putFood(state, 5, 9);

    const seen = SNAKE_DRIVER.observe({ state, point: pointOf(state), recent: [] }) as SnakeObservation;
    expect(seen.board).toEqual({ width: BOARD_TILES, height: BOARD_TILES });
    expect(seen.snake.head).toEqual([5, 5]);
    expect(seen.snake.heading).toBe("UP");
    expect(seen.snake.length).toBe(3);
    expect(seen.snake.body).toEqual([[5, 5], [5, 6], [5, 7]]);
    // 身体挡住了正下方那一路，所以是绕过去的 6 格，不是曼哈顿距离 4。
    expect(seen.food).toEqual({ cell: [5, 9], distance: 6 });
    expect(seen.progress.freeCells).toBe(BOARD_TILES * BOARD_TILES - 3);
    expect(seen.progress.steps).toBe(0);
    expect(seen.progress.foodEaten).toBe(0);
  });

  it("没有食物时观察里 food 是 null（不是空对象）", () => {
    const state = snakeGame();
    putBody(state, at([[5, 5]]), "UP");
    const seen = SNAKE_DRIVER.observe({ state, point: pointOf(state), recent: [] }) as SnakeObservation;
    expect(seen.food).toBeNull();
  });

  it("debug 给的是这一侧的几何：头、朝向、每个方向的致命与否与可达数", () => {
    const state = snakeGame();
    putBody(state, at([[BOARD_TILES - 1, 12]]), "RIGHT");
    const info = SNAKE_DRIVER.debug(state) as {
      head: SnakeCell;
      heading: Direction | null;
      forward: Direction[];
      safe: Direction[];
      fatal: Direction[];
    };

    expect(info.head).toEqual({ x: BOARD_TILES - 1, y: 12 });
    expect(info.heading).toBe("RIGHT");
    expect(info.forward).toEqual(["UP", "RIGHT", "DOWN"]);
    expect(info.fatal).toEqual(["RIGHT"]);
    expect(info.safe).toEqual(["UP", "DOWN"]);
  });
});

describe("贪吃蛇 driver：对照玩家", () => {
  it("空盘面上四个方向一样开阔，并列就按 DIRECTIONS 的顺序取第一个", () => {
    // 首步没有朝向，四个方向都在，也就没有任何加分项能打破平局。
    const state = snakeGame();
    putBody(state, at([[12, 12]]), null);
    const point = pointOf(state);
    expect(point.actions).toEqual([...DIRECTIONS]);
    expect(heuristicChoice(state, point.actions)).toBe("UP");
  });

  it("「沿当前朝向」是免费的加分项，所以它优先于 DIRECTIONS 的先后", () => {
    const state = snakeGame();
    putBody(state, at([[12, 12]]), "RIGHT");
    const point = pointOf(state);
    // 三个方向一样开阔、又都没有食物可贪，RIGHT 靠「继续直行」那半分赢下来 ——
    // 这正是事实表里「是否沿当前朝向」那一行存在的理由。
    expect(point.actions).toEqual(["UP", "RIGHT", "DOWN"]);
    expect(heuristicChoice(state, point.actions)).toBe("RIGHT");
  });

  it("整局都不选立刻致命的动作（除非那一步没有安全方向）", () => {
    const state = createGame({ seed: 11, width: 8, height: 8 });
    startGame(state);
    let checked = 0;

    for (let step = 0; step < 300 && state.status === "PLAYING"; step += 1) {
      const point = SNAKE_DRIVER.decision(state);
      if (point) {
        const safe = point.actions.filter((direction) => !isLethal(state, direction as Direction));
        const action = heuristicChoice(state, point.actions);
        if (safe.length > 0) expect(safe, `第 ${step} 步`).toContain(action);
        SNAKE_DRIVER.apply(state, action);
        checked += 1;
      }
      stepOnce(state);
    }

    expect(checked).toBeGreaterThan(0);
  });

  it("同 seed 下启发式玩家的决策序列逐条可复现", () => {
    function play(seed: number): string[] {
      const state = createGame({ seed, width: 8, height: 8 });
      startGame(state);
      const log: string[] = [];
      for (let step = 0; step < 60 && state.status === "PLAYING"; step += 1) {
        const point = SNAKE_DRIVER.decision(state);
        if (point) {
          const action = heuristicChoice(state, point.actions);
          log.push(`${point.key}->${action}`);
          SNAKE_DRIVER.apply(state, action);
        }
        stepOnce(state);
      }
      return log;
    }

    const first = play(11);
    expect(play(11)).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });
});
