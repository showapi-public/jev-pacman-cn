/**
 * 蛇的画面。只画，不改状态。
 *
 * 与吃豆人的三处差别都不是风格偏好：
 *
 *  - **不铺底色**：盘面就是画布所在的那口「井」（`.bg-well`），所以这里只画一圈边框。
 *    铺一块不透明底会把机台那层暗底盖掉，24×24 的棋盘看起来就像贴上去的一张纸。
 *  - **坐标 = 格 × `CELL`**：共用循环先把变换设成位图单位（位图 = 盘面格数 × `CELL`），
 *    所以这里按位图单位作画 —— 与吃豆人乘 `TILE` 的算法完全一致。
 *  - **食物脉动**在 `prefers-reduced-motion` 下关掉，而「要不要动画」是 `PaintView.reducedMotion`
 *    告诉它的：渲染器保持「纯画布」，不自己读 `window.matchMedia`。
 */

import type { DrawCell } from "../draw";
import { applyShake, drawFlashOverlay, drawJuiceOverlay, drawThinkingRing } from "../draw";
import type { JuiceState } from "../juice";
import { COLUMN_SHIFT, ROW_SHIFT } from "./types";
import type { Direction, SnakeCell, SnakeState } from "./types";

/**
 * 一格在画布单位里有多大：24 格 × 28 = **672 位图**。
 *
 * 位图必须比显示尺寸大 —— 共用循环按 `设备像素比 × 2` 建后备缓冲，所以 672 的位图在
 * 常见的井位（约 420 px）下是被缩小绘制的，线才不会发毛。
 */
export const CELL = 28;

/**
 * Canvas 读不到 CSS 自定义属性，所以这些字面量镜像 `app/globals.css` 里的
 * `--snake-head` / `--snake-body` / `--snake-food` / `--status-*`。**两处一起改。**
 */
const COLORS = {
  /** `--snake-body` 的 35%：边框是「棋盘在哪」的提示，不该抢过蛇本身。 */
  frame: "rgba(34, 163, 92, 0.35)",
  head: "#4ade80",
  body: "#22a35c",
  food: "#ff9f43",
  /** 死了的头一眼看得出来，省得读参数条才知道这局已经结束。 */
  dead: "#ff6b6b",
  debug: "#7cf5c8",
  safe: "#34d399",
  fatal: "#ff6b6b",
};

/**
 * Juice 调色板：这款游戏自己的颜色，按「刚刚发生了什么」命名。
 *
 * `react()` 用它们，画布用 `COLORS`，两处都只认语义（吃到了 / 死了 / 通关了），
 * 不认具体色值 —— 换配色时只改这里和 `app/globals.css`。
 */
export const EFFECT_COLORS = {
  food: "#ff9f43",
  growth: "#4ade80",
  death: "#ff6b6b",
  cleared: ["#4ade80", "#22a35c", "#ff9f43", "#ffe9b8"] as const,
};

/**
 * 这一帧的调色板。彩蛋只旋转蛇自己的三种颜色，**调试色与死亡色不转** ——
 * 它们在两套配色里的含义相同（绿=安全、红=死），换掉会让覆盖层失去意义。
 */
function palette(neon: boolean, time: number) {
  if (!neon) return COLORS;
  const hue = Math.round((time / 9) % 360);
  return {
    ...COLORS,
    frame: `hsl(${hue} 70% 42% / 0.45)`,
    head: `hsl(${hue} 92% 66%)`,
    body: `hsl(${hue} 68% 44%)`,
    // 食物错开半个轮盘：不然它和蛇头同色，一眼看不出「那是能吃的东西」。
    food: `hsl(${(hue + 165) % 360} 92% 62%)`,
  };
}

/**
 * 调试覆盖层要用的这一侧几何。
 *
 * 这里是 `SnakeDebugInfo` 的**子集**，写在渲染器这一侧：渲染器只声明它真的会读的字段，
 * 于是 agent 侧以后多给几个字段不会牵动画面，画面要新字段时也不必整个搬过来。
 */
export interface SnakeDebugView {
  head: SnakeCell;
  forward: readonly Direction[];
  fatal: readonly Direction[];
}

export interface RenderOptions {
  debug?: boolean;
  time?: number;
  /** 表现层产物（粒子、飘字、震动、闪屏），框架只透传。 */
  juice?: JuiceState;
  neon?: boolean;
  thinking?: boolean;
  /** 这台机器要求少动。食物脉动是这里唯一会动的东西。 */
  reducedMotion?: boolean;
  debugInfo?: SnakeDebugView | null;
}

/** 位图尺寸。盘面尺寸住在状态里，所以换盘面大小时这里什么都不用改。 */
export function bitmapSize(state: SnakeState): { width: number; height: number } {
  return { width: state.board.width * CELL, height: state.board.height * CELL };
}

export function drawGame(context: CanvasRenderingContext2D, state: SnakeState, options: RenderOptions = {}): void {
  const time = options.time ?? 0;
  const { width, height } = bitmapSize(state);
  const juice = options.juice;
  const colors = palette(options.neon === true, time);

  // 底色交给「井」：它本来就是 `--bg-well`，再叠一层会让棋盘浮起来。
  context.save();
  if (juice) applyShake(context, juice, time, width, height);

  drawFrame(context, width, height, colors.frame);
  drawFood(context, state, time, colors.food, options.reducedMotion === true);
  drawSnake(context, state, colors, state.status === "GAME_OVER");
  // 果汁层与脉动环在震动里（它们是场景的一部分）；闪屏在外面，因为闪的是「屏幕」。
  if (juice) drawJuiceOverlay(context, juice, CELL);
  if (options.thinking) {
    // 蛇的决策点就是蛇头所在的那一格 —— 问的就是「你下一步往哪走」。
    drawThinkingRing(context, state.body[0] ?? null, CELL, time, colors.head);
  }
  if (options.debug) drawDebug(context, state.body[0] ?? null, options.debugInfo ?? null, colors);

  context.restore();

  if (juice) drawFlashOverlay(context, juice, width, height);
}

/**
 * 圆角矩形路径。
 *
 * 不用 `context.roundRect`：那是较新的 API，而这里要的只是四段弧，自己画一遍
 * 既没有兼容性悬念，也省得为了一条边框去查可用性。
 */
function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

/** 盘面边框：没有它，24 格宽的空盘和井位本身分不出边界。 */
function drawFrame(context: CanvasRenderingContext2D, width: number, height: number, color: string): void {
  const inset = CELL * 0.08;
  context.save();
  context.shadowBlur = 0;
  context.strokeStyle = color;
  context.lineWidth = CELL * 0.06;
  roundedRectPath(context, inset, inset, width - inset * 2, height - inset * 2, CELL * 0.3);
  context.stroke();
  context.restore();
}

function drawFood(
  context: CanvasRenderingContext2D,
  state: SnakeState,
  time: number,
  color: string,
  reducedMotion: boolean,
): void {
  const food = state.food;
  if (!food) return;

  const pulse = reducedMotion ? 1 : 1 + Math.sin((time / 260) * Math.PI * 2) * 0.1;
  const centerX = (food.x + 0.5) * CELL;
  const centerY = (food.y + 0.5) * CELL;

  context.save();
  context.shadowBlur = 0;
  context.fillStyle = color;
  // 外面那圈淡光：24×24 上的一颗小圆很容易被蛇身淹没，有它就能一眼扫到。
  context.globalAlpha = 0.18;
  context.beginPath();
  context.arc(centerX, centerY, CELL * 0.44 * pulse, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.beginPath();
  context.arc(centerX, centerY, CELL * 0.27 * pulse, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * 蛇身：一串圆角方块，头更亮、也更大一点点。
 *
 * **从尾往头画**，这样头永远压在身上，交错时不会看起来像被身体咬掉一角。
 */
function drawSnake(
  context: CanvasRenderingContext2D,
  state: SnakeState,
  colors: ReturnType<typeof palette>,
  dead: boolean,
): void {
  context.save();
  context.shadowBlur = 0;

  for (let index = state.body.length - 1; index >= 0; index -= 1) {
    const cell = state.body[index];
    const isHead = index === 0;
    // 头比身体大一圈（内缩更少），所以在一条直线上也认得出哪头是头。
    const inset = isHead ? CELL * 0.06 : CELL * 0.1;
    context.fillStyle = dead && isHead ? colors.dead : isHead ? colors.head : colors.body;
    roundedRectPath(
      context,
      cell.x * CELL + inset,
      cell.y * CELL + inset,
      CELL - inset * 2,
      CELL - inset * 2,
      CELL * 0.24,
    );
    context.fill();
  }

  if (state.body.length > 0) drawEyes(context, state.body[0], state.heading, dead);
  context.restore();
}

/**
 * 两只眼睛。
 *
 * 不是为了可爱：蛇身是一串一模一样的方块，没有眼睛就看不出它朝哪走，而「朝哪走」
 * 正是这款游戏唯一的状态。朝向未定时不画（那时也确实没有「往前」可言）。
 */
function drawEyes(
  context: CanvasRenderingContext2D,
  head: SnakeCell,
  heading: Direction | null,
  dead: boolean,
): void {
  if (!heading || dead) return;
  const forwardX = COLUMN_SHIFT[heading];
  const forwardY = ROW_SHIFT[heading];
  const centerX = (head.x + 0.5) * CELL;
  const centerY = (head.y + 0.5) * CELL;
  const ahead = CELL * 0.17;
  const apart = CELL * 0.18;

  context.fillStyle = "#08120c";
  for (const side of [-1, 1]) {
    // 垂直于前进方向分开：朝向是 (0,-1) 时，两眼落在水平两侧。
    const x = centerX + forwardX * ahead - forwardY * apart * side;
    const y = centerY + forwardY * ahead + forwardX * apart * side;
    context.beginPath();
    context.arc(x, y, CELL * 0.1, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * 调试覆盖层：头那一格描出来，这一步在考虑的方向各画一条线到目标格。
 *
 * 绿 = 不会立刻死，红 = 一撞就死（撞墙或咬到自己）。它把事实表里第一行的数字
 * 直接画到了盘面上：那行说「是/否」，这里说「哪边」。
 */
function drawDebug(
  context: CanvasRenderingContext2D,
  head: SnakeCell | null,
  info: SnakeDebugView | null,
  colors: ReturnType<typeof palette>,
): void {
  if (!info) return;
  const from: DrawCell = { x: (info.head.x + 0.5) * CELL, y: (info.head.y + 0.5) * CELL };

  context.save();
  context.shadowBlur = 0;
  if (head) {
    context.strokeStyle = colors.debug;
    context.lineWidth = CELL * 0.05;
    context.strokeRect(head.x * CELL, head.y * CELL, CELL, CELL);
  }
  for (const direction of info.forward) {
    const target: DrawCell = {
      x: (info.head.x + COLUMN_SHIFT[direction] + 0.5) * CELL,
      y: (info.head.y + ROW_SHIFT[direction] + 0.5) * CELL,
    };
    context.strokeStyle = info.fatal.includes(direction) ? colors.fatal : colors.safe;
    context.lineWidth = CELL * 0.09;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(target.x, target.y);
    context.stroke();
  }
  context.restore();
}
