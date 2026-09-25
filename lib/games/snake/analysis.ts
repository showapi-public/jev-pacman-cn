/**
 * 几何与搜索：蛇头朝某个方向走会发生什么。
 *
 * 这里没有规则、没有状态迁移、不改任何东西。引擎用它判生死，agent 用它算事实表，
 * 启发式玩家用它挑动作 —— 三处必须问同一个函数，否则「右栏写的」和「引擎做的」会分叉，
 * 而这种分叉在界面上看不出来：数字都像是对的。
 *
 * 一个贯穿全文件的口径：**蛇身是障碍，但尾巴会让出的那一格不是。** 判据是 `growth`：
 * 正在长身体的那些步里尾巴不动。上游就是这么判的（`snake` 数组不 pop 时尾部仍占格），
 * 也是玩家的直觉 —— 追着自己的尾巴绕圈不该算自杀。
 */

import { COLUMN_SHIFT, DIRECTIONS, ROW_SHIFT } from "./types";
import type { Direction, SnakeBoard, SnakeCell, SnakeState } from "./types";

/** 格子的键。用字符串集合做占用判断，比每次线性扫身体短得多。 */
export function cellKey(cell: SnakeCell): string {
  return `${cell.x},${cell.y}`;
}

export function nextCell(cell: SnakeCell, direction: Direction): SnakeCell {
  return { x: cell.x + COLUMN_SHIFT[direction], y: cell.y + ROW_SHIFT[direction] };
}

export function isOutside(board: SnakeBoard, cell: SnakeCell): boolean {
  return cell.x < 0 || cell.y < 0 || cell.x >= board.width || cell.y >= board.height;
}

/** 蛇头现在在哪。`body[0]` 是唯一的口径，别在别处写 `body.at(-1)`。 */
export function headCell(state: SnakeState): SnakeCell {
  return state.body[0];
}

/**
 * `candidate` 是不是与 `heading` 正好相反（180°）。
 *
 * `heading` 为 `null`（还没走过第一步）时永远不是反向：首步没有「回头」可言。
 */
export function isReversal(heading: Direction | null, candidate: Direction): boolean {
  if (heading === null) return false;
  return COLUMN_SHIFT[heading] + COLUMN_SHIFT[candidate] === 0 && ROW_SHIFT[heading] + ROW_SHIFT[candidate] === 0;
}

/** 这一步尾巴会不会离开它占的格。正在长身体时不会。 */
export function tailVacates(state: SnakeState): boolean {
  return state.growth === 0;
}

/**
 * 蛇身占住的格。
 *
 * `excludeTail` 用于「尾巴这一步会让位」的情形 —— 也就是把尾巴那一格从障碍里拿掉。
 */
export function occupiedKeys(state: SnakeState, options: { excludeTail?: boolean } = {}): Set<string> {
  const cells = options.excludeTail ? state.body.slice(0, -1) : state.body;
  return new Set(cells.map(cellKey));
}

/** 这一格空着吗（在盘内、且不在障碍里）。 */
export function isFree(board: SnakeBoard, cell: SnakeCell, blocked: ReadonlySet<string>): boolean {
  return !isOutside(board, cell) && !blocked.has(cellKey(cell));
}

/**
 * 走这一步会不会立刻死：撞墙，或者咬到自己。
 *
 * 尾巴会让位时它那一格不算被咬到（见文件头）。但如果这一步还要长身体，尾巴不动，
 * 那一格就照旧致命 —— 这两件事的区别只有 `growth` 说了算。
 */
export function isLethal(state: SnakeState, direction: Direction): boolean {
  const target = nextCell(headCell(state), direction);
  if (isOutside(state.board, target)) return true;
  return occupiedKeys(state, { excludeTail: tailVacates(state) }).has(cellKey(target));
}

/**
 * 可走的动作：在盘内、不咬到自己、不是 180° 反向。顺序即 `DIRECTIONS`。
 *
 * 「可走」不等于「安全」：这一步活着，下一步可能把自己关进小房间。区分这两件事
 * 是蛇这个游戏的全部难度，所以这个函数只答「现在能走哪几个」。
 */
export function legalActions(state: SnakeState): Direction[] {
  return DIRECTIONS.filter((direction) => !isReversal(state.heading, direction) && !isLethal(state, direction));
}

/** 从 `from` 出发四向连通能走到多少空格（`from` 自己不算）。`blocked` 是墙。 */
export function reachableCount(board: SnakeBoard, from: SnakeCell, blocked: ReadonlySet<string>): number {
  const seen = new Set<string>([cellKey(from)]);
  const queue: SnakeCell[] = [from];
  let count = 0;

  while (queue.length > 0) {
    const cell = queue.shift() as SnakeCell;
    for (const direction of DIRECTIONS) {
      const candidate = nextCell(cell, direction);
      const key = cellKey(candidate);
      if (seen.has(key) || !isFree(board, candidate, blocked)) continue;
      seen.add(key);
      count += 1;
      queue.push(candidate);
    }
  }

  return count;
}

/**
 * 走这一步之后的身体。只做几何，不判生死 —— 调用方先问 `isLethal`。
 *
 * 尾巴让不让位照 `growth` 判，所以「踩在自己的尾巴上」在这里会得到正确的身体，
 * 而不是一具多了两节的身体。
 */
export function simulatedBody(state: SnakeState, direction: Direction): SnakeCell[] {
  const body = [nextCell(headCell(state), direction), ...state.body.map((cell) => ({ ...cell }))];
  if (tailVacates(state)) body.pop();
  return body;
}

/**
 * 蛇头走这一步之后，从新头出发还能走到多少空格。
 *
 * 「越大越安全」是蛇的第一常识：真正杀死蛇的从来不是眼前那一格，而是把自己关进小房间。
 * 这里必须用 flood fill 而不是几何距离 —— 身体围成的圈只有搜索看得见。
 */
export function freeCellsAfter(state: SnakeState, direction: Direction): number {
  const after = simulatedBody(state, direction);
  return reachableCount(state.board, after[0], new Set(after.map(cellKey)));
}

/**
 * 走到下一格之后，从那里还有几个非致命方向（0 = 进了死胡同）。
 *
 * 与 `freeCellsAfter` 是两种不同的坏消息：可达空格少但路还宽（一个大房间的角落）不算急，
 * 自由度 0 才是立刻没得选。事实表两行都写。
 */
export function freedomAfter(state: SnakeState, direction: Direction): number {
  const probe: SnakeState = {
    ...state,
    body: simulatedBody(state, direction),
    heading: direction,
    // 与引擎同步：走完这一步，待长节数减一（已经是 0 就还是 0）。
    growth: Math.max(0, state.growth - 1),
  };
  return DIRECTIONS.filter((candidate) => !isReversal(probe.heading, candidate) && !isLethal(probe, candidate)).length;
}

/**
 * 从 `from` 到食物的最短步数（BFS，绕开蛇身）；到不了、或者已经没有食物时给 `null`。
 *
 * 不可达是 `null` 而不是一个大数：事实表里它会写成「—」，而任何写得出的大数都会被模型
 * 当成真的距离去比较。
 */
export function distanceToFood(state: SnakeState, from: SnakeCell): number | null {
  const food = state.food;
  if (!food) return null;

  // 食物自己不是障碍，否则永远到不了。
  const blocked = occupiedKeys(state);
  blocked.delete(cellKey(food));
  const target = cellKey(food);

  const seen = new Set<string>([cellKey(from)]);
  let frontier: SnakeCell[] = [from];
  let steps = 0;

  while (frontier.length > 0) {
    steps += 1;
    const next: SnakeCell[] = [];
    for (const cell of frontier) {
      for (const direction of DIRECTIONS) {
        const candidate = nextCell(cell, direction);
        const key = cellKey(candidate);
        if (seen.has(key) || !isFree(state.board, candidate, blocked)) continue;
        if (key === target) return steps;
        seen.add(key);
        next.push(candidate);
      }
    }
    frontier = next;
  }

  return null;
}
