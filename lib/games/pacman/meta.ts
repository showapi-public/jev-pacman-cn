/**
 * 吃豆人的元数据与动作词表。
 *
 * 只放「给人看的东西」与「UI 层需要的映射」，不放任何玩法常量 —— 那些在 `types.ts`。
 * 刻意不 import 引擎：导航首页与路由表要用它，而它们不该因此把引擎拖进包里。
 */

import type { ActionId, ActionVocab, GameMeta } from "../types";

export const PACMAN_META: GameMeta = {
  id: "pacman",
  name: "吃豆人",
  tagline: "吃光豆子，躲开幽灵",
  decisionShape: "每个路口选一个方向",
  selfColor: "var(--pacman)",
};

/** 展示顺序与 `DIRECTION_ORDER` 一致，这样概率阶梯的并列次序与引擎的确定性平局规则同源。 */
const ORDER: readonly ActionId[] = ["UP", "LEFT", "DOWN", "RIGHT"];

const LABELS: Record<string, string> = {
  UP: "上",
  DOWN: "下",
  LEFT: "左",
  RIGHT: "右",
};

export const PACMAN_VOCAB: ActionVocab = {
  order: ORDER,
  label(action) {
    // 未知动作原样显示：宁可露出一个生字符串，也不要显示成空白让人以为没有动作。
    return LABELS[action] ?? action;
  },
  slot(action) {
    return action === "UP" || action === "DOWN" || action === "LEFT" || action === "RIGHT" ? action : null;
  },
};
