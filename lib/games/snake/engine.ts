/**
 * 贪吃蛇引擎：固定步长、确定性、与渲染无关。
 *
 * `stepGame` 吃下 `dtMs` 这么多模拟时间，把该发生的整格移动都发生掉，返回发生了什么。
 * 同一 seed + 同一串方向重放出同一局 —— 跨模型比较要成立，这一条没有商量余地。
 *
 * 这里的代码拥有所有事实，但**不判断哪一步更好**：那是 agent 的事。
 *
 * 与吃豆人的两处结构差别，都是这个游戏自己的性质，不是实现偷懒：
 *  - 时间累加器住在状态里（`stepAccumMs`），因为驱动要靠它算「还有多远到下一格」；
 *  - 上一步的朝向就是 `heading`，没有「请求方向 vs 当前方向」的双缓冲 ——
 *    蛇只有一格宽，转向在整格边界一次生效，多一个字段只会多一个能不一致的地方。
 */

import { headCell, isFree, isLethal, isOutside, isReversal, nextCell, occupiedKeys, tailVacates } from "./analysis";
import { BOARD_TILES, GROWTH_PER_FOOD, MOVE_MS, STARTING_LENGTH, nextRandom, seedToRngState } from "./types";
import type { DeathReason, Direction, SnakeCell, SnakeEvent, SnakeState } from "./types";

export interface CreateGameOptions {
  seed?: number;
  width?: number;
  height?: number;
  epoch?: number;
}

/**
 * 新的一局。
 *
 * 出生点是盘面正中间（上游也是），长度 `STARTING_LENGTH`，朝向未定 —— 朝向为 `null`
 * 不是偷懒：它让「第一步」真的没有回头可言，也让驱动知道该问第一个问题了。
 */
export function createGame(options: CreateGameOptions = {}): SnakeState {
  const width = options.width ?? BOARD_TILES;
  const height = options.height ?? BOARD_TILES;
  const seed = options.seed ?? 42;
  const spawn: SnakeCell = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  const body: SnakeCell[] = [];
  for (let index = 0; index < STARTING_LENGTH; index += 1) {
    // 长度 1 时就是出生点本身；更长的身体向左铺，朝向未定所以没有「身后」可言。
    body.push({ x: spawn.x - index, y: spawn.y });
  }

  const state: SnakeState = {
    board: { width, height },
    status: "READY",
    tick: 0,
    playTimeMs: 0,
    epoch: options.epoch ?? 1,
    seed,
    score: 0,
    body,
    heading: null,
    requested: null,
    growth: 0,
    food: null,
    moves: 0,
    stepAccumMs: 0,
    rngState: seedToRngState(seed),
  };

  state.food = placeFood(state);
  // 连一颗食物都放不下 = 出生即通关。真出现的话说明盘面比蛇还小，而不是规则如何。
  if (state.food === null) state.status = "CLEARED";

  return state;
}

export function startGame(state: SnakeState): void {
  if (state.status === "GAME_OVER" || state.status === "CLEARED") return;
  state.status = "PLAYING";
}

export function pauseGame(state: SnakeState): void {
  if (state.status === "PLAYING") state.status = "PAUSED";
}

export function resumeGame(state: SnakeState): void {
  if (state.status === "PAUSED") state.status = "PLAYING";
}

/**
 * 记下一个转向请求，返回是否被接受。
 *
 * 反向请求**在这里就扔掉**，而不是等整格时再忽略：手动模式的按键、模型给出的非法动作
 * 都会走这条路，早一处理掉能让「请求 = 意图」保持干净，也让它成为可测的一件事。
 * 首步例外由 `isReversal(null, …)` 自然给出。
 */
export function steer(state: SnakeState, direction: Direction): boolean {
  if (isReversal(state.heading, direction)) return false;
  state.requested = direction;
  return true;
}

/**
 * 推进 `dtMs` 毫秒，返回这一步里发生的事件。
 *
 * 只在 `PLAYING` 时走时钟：就绪屏与暂停里时间不动，`playTimeMs` 才真的是「局内时长」。
 */
export function stepGame(state: SnakeState, dtMs: number): SnakeEvent[] {
  const events: SnakeEvent[] = [];
  if (state.status !== "PLAYING") return events;

  state.tick += 1;
  state.playTimeMs += dtMs;
  state.stepAccumMs += dtMs;

  while (state.stepAccumMs >= MOVE_MS && state.status === "PLAYING") {
    const direction = state.requested ?? state.heading;
    if (direction === null) {
      /*
       * 还没人告诉它往哪走。整格时间**停在满格等方向**，不能把这一段吞掉：
       * 控制器判「答案该落地了」用的是 `accum + fixedDtMs >= MOVE_MS`，
       * 吞掉就永远等不到，第一次提问会死锁。
       */
      state.stepAccumMs = MOVE_MS;
      break;
    }
    state.stepAccumMs -= MOVE_MS;
    stepOnce(state, direction, events);
  }

  return events;
}

/* ------------------------------------------------------------------ internals */

/** 走一格。生死、进食、增长、朝向全在这一步里定下来。 */
function stepOnce(state: SnakeState, direction: Direction, events: SnakeEvent[]): void {
  // 先记步数：它是决策键的一部分（`epoch:moveIndex`），撞死的那一步也算走过。
  state.moves += 1;

  const head = nextCell(headCell(state), direction);
  if (isLethal(state, direction)) {
    // 死了就不动。盘面停在死亡那一刻，否则会把蛇头画到盘外去。
    die(state, isOutside(state.board, head) ? "WALL" : "SELF", events);
    return;
  }

  state.body.unshift(head);
  state.heading = direction;
  state.requested = null;

  const ate = state.food !== null && head.x === state.food.x && head.y === state.food.y;
  if (ate) {
    state.score += 1;
    state.growth += GROWTH_PER_FOOD;
  }

  // 长身体的那些步里尾巴不动；其余时候尾巴让位。
  if (tailVacates(state)) state.body.pop();
  else state.growth -= 1;

  if (!ate) return;

  events.push({ type: "FOOD_EATEN", cell: head, score: state.score, length: state.body.length });

  const food = placeFood(state);
  state.food = food;
  if (food === null) {
    state.status = "CLEARED";
    state.epoch += 1;
    events.push({ type: "BOARD_CLEARED" });
  }
}

/**
 * 判死：换掉世代并报出原因。
 *
 * `epoch` 要 +1 —— 控制器靠它把在途的答案作废，否则一份为「死前那一格」算出来的方向
 * 会落到新局上。
 */
function die(state: SnakeState, reason: DeathReason, events: SnakeEvent[]): void {
  state.status = "GAME_OVER";
  state.epoch += 1;
  events.push({ type: "SNAKE_DIED", reason });
}

/**
 * 在空格里等概率放一颗食物；没有空格了就返回 `null`（调用方据此判通关）。
 *
 * 空格按**行优先顺序**枚举后再取随机下标。枚举顺序固定、随机数固定，所以同一 seed
 * 的食物序列逐颗可复现 —— 上游是拿 `Math.random` 试 20000 次，那个连「试过哪些格」
 * 都不可复现，没法用来做跨模型比较。
 */
function placeFood(state: SnakeState): SnakeCell | null {
  const blocked = occupiedKeys(state);
  const free: SnakeCell[] = [];
  for (let y = 0; y < state.board.height; y += 1) {
    for (let x = 0; x < state.board.width; x += 1) {
      const cell = { x, y };
      if (isFree(state.board, cell, blocked)) free.push(cell);
    }
  }
  if (free.length === 0) return null;

  const roll = nextRandom(state.rngState);
  state.rngState = roll.state;
  return free[Math.floor(roll.value * free.length)];
}
