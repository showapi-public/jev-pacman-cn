/**
 * 表现层的共用部分：画一件东西所需要的信息，除了「一格有多大」以外与游戏无关。
 *
 * 背景、角色、场景都留在各游戏自己的 `render.ts` 里 —— 那些是玩法的形状。留在这里的四件
 * 恰好都不含玩法知识，它们原来长在吃豆人的 `render.ts` 里，接第二款游戏时才发现：
 *
 *  - 震动：位移与放大，防的是抖动时露出画布边缘；
 *  - 果汁层：粒子与飘字，位置本来就是**格坐标**（见 `juice.ts` 的 `addPelletSpark`）；
 *  - 闪屏：压在所有东西之上、且不跟着震；
 *  - 「提问中」的脉动环：决策点在哪由游戏说，怎么脉动与游戏无关。
 *
 * `unit`（一格在画布单位里有多大）是这一层唯一的游戏参数：吃豆人一格 20、蛇一格 28。
 * 传错它不会报错，只会让粒子画到隔壁格里 —— 所以每个游戏都从自己的 `render.ts` 里
 * 用同一个常量传进来，不写字面量。
 */

import type { JuiceState } from "./juice";
import { shakeOffset } from "./juice";

/* Canvas 的文字也要有等宽脸，飘字里还带中文（「+5」「第 3 关」），
   所以这条栈要把简体中文字族也列上。 */
export const CANVAS_FONT_STACK =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", monospace';

/** 一个格坐标。画布这一层只认 `x`/`y`，不认任何游戏的格类型。 */
export interface DrawCell {
  x: number;
  y: number;
}

/**
 * 把震动套到画布变换上：位移 + 轻微放大。
 *
 * **调用方负责 `save()` / `restore()`** —— 位移要覆盖「震动的那些东西」，
 * 而不该漏到闪屏与画布边框上，那是调用方的构图决定。
 */
export function applyShake(
  context: CanvasRenderingContext2D,
  juice: JuiceState,
  timeMs: number,
  width: number,
  height: number,
): void {
  if (juice.trauma <= 0) return;
  const offset = shakeOffset(juice, timeMs);
  context.translate(offset.x, offset.y);
  // 放大一点点：抖动时画布边缘才不会露出一条缝。
  context.scale(1.02, 1.02);
  context.translate(-width * 0.01, -height * 0.01);
}

/**
 * 粒子与飘字。**进这个函数前，画布变换必须已经是格子单位。**
 *
 * 纯装饰：数字在参数条里，这里只是让「刚刚发生了什么」看得见。
 */
export function drawJuiceOverlay(context: CanvasRenderingContext2D, juice: JuiceState, unit: number): void {
  context.save();
  context.shadowBlur = 0;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const particle of juice.particles) {
    const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    const size = particle.size * (0.6 + alpha * 0.6);
    context.globalAlpha = particle.kind === "confetti" ? Math.min(1, alpha * 1.5) : alpha;
    context.fillStyle = particle.color;
    context.fillRect(particle.x * unit - size / 2, particle.y * unit - size / 2, size, size * 1.6);
  }

  for (const popup of juice.popups) {
    const alpha = Math.max(0, Math.min(1, popup.life / popup.maxLife));
    const size = Math.round(unit * 0.66 * (1 + (1 - alpha) * 0.22));
    context.globalAlpha = alpha;
    context.font = `600 ${size}px ${CANVAS_FONT_STACK}`;
    // 先描一层深色边：飘字会落在任意背景上，没有这层的话亮字压在亮格子上就读不出来。
    context.lineWidth = 3;
    context.strokeStyle = "rgba(5, 6, 11, 0.85)";
    context.strokeText(popup.text, popup.x * unit, popup.y * unit);
    context.fillStyle = popup.color;
    context.fillText(popup.text, popup.x * unit, popup.y * unit);
  }

  context.restore();
}

/** 闪屏。压在所有东西之上，且**不跟着震**（它是「屏幕」在闪，不是场景在动）。 */
export function drawFlashOverlay(
  context: CanvasRenderingContext2D,
  juice: JuiceState,
  width: number,
  height: number,
): void {
  if (juice.flashMs <= 0 || juice.flashMaxMs <= 0) return;
  context.save();
  // 0.26 是实测能看清又不淹掉画面的上限；别调高，闪屏会盖住棋盘。
  context.globalAlpha = (juice.flashMs / juice.flashMaxMs) * 0.26;
  context.fillStyle = juice.flashColor;
  context.fillRect(0, 0, width, height);
  context.restore();
}

/** 一次脉动的周期。提问通常几百毫秒就有结果，所以它要快到「看得出在等」但不刺眼。 */
const THINKING_PERIOD_MS = 900;

/**
 * 决策点上的脉动环：告出「正在等模型作答」。中心那颗点是同一个决策点在图上的锚，
 * 环散开以后它还留在原处。
 *
 * `cell` 为 `null` 时什么也不画 —— 各游戏的 `debug()` 都可能给不出决策点，
 * 那正是「此刻没有在等」的意思。
 */
export function drawThinkingRing(
  context: CanvasRenderingContext2D,
  cell: DrawCell | null,
  unit: number,
  timeMs: number,
  color: string,
): void {
  if (!cell) return;
  const centerX = (cell.x + 0.5) * unit;
  const centerY = (cell.y + 0.5) * unit;
  const phase = (timeMs % THINKING_PERIOD_MS) / THINKING_PERIOD_MS;
  context.save();
  context.shadowBlur = 0;
  context.strokeStyle = color;
  context.lineWidth = unit * 0.08;
  context.globalAlpha = 1 - phase;
  context.beginPath();
  context.arc(centerX, centerY, unit * (0.45 + phase * 0.5), 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.75;
  context.fillStyle = color;
  context.beginPath();
  context.arc(centerX, centerY, unit * 0.12, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
