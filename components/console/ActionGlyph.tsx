"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Minus,
  type Icon,
  type IconWeight,
} from "@phosphor-icons/react";

import type { ActionId, ActionVocab } from "@/lib/games/types";

/**
 * 一个动作的图标。
 *
 * 动作盘、概率阶梯与决策历史都用它，于是「槽位 → Phosphor 箭头」这个映射全应用
 * 只有一份。它必须住在 UI 层：`lib/games/*` 保持 React-free，那边的词表只能说
 * 「这个动作在十字的上格」（`slot()`），说到图标就到头了。
 *
 * `slot()` 返回 null 的动作（非四向游戏）退回一个中性横线 —— 那类游戏本该自带
 * 动作盘，本轮不实现；横线是个诚实的占位，不是箭头猜出来的方向。
 */

export type SlotId = "UP" | "DOWN" | "LEFT" | "RIGHT";

const BY_SLOT: Record<SlotId, Icon> = {
  UP: ArrowUp,
  RIGHT: ArrowRight,
  DOWN: ArrowDown,
  LEFT: ArrowLeft,
};

/** 四个槽位顺时针的旋转角（度），给动作盘中心的朝向针用。 */
export const SLOT_ANGLE: Record<SlotId, number> = {
  UP: 0,
  RIGHT: 90,
  DOWN: 180,
  LEFT: 270,
};

export interface ActionGlyphProps {
  vocab: ActionVocab;
  /** null 表示「没有动作可画」，例如还没作出选择的那一行。 */
  action: ActionId | null;
  weight?: IconWeight;
  className?: string;
}

export function ActionGlyph({ vocab, action, weight = "bold", className }: ActionGlyphProps) {
  const slot = action === null ? null : vocab.slot(action);
  const Glyph = slot === null ? Minus : BY_SLOT[slot];
  return <Glyph aria-hidden="true" weight={weight} className={className} />;
}
