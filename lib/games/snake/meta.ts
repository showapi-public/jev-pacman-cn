/**
 * 蛇的元数据与动作词表。
 *
 * 与吃豆人同一套分工：只放「给人看的东西」与「UI 层需要的映射」，不放玩法常量（那些在
 * `types.ts`）。刻意不 import 引擎与 agent —— 导航首页与路由表要用它，而它们不该因此
 * 把引擎拖进包里。
 */

import type { ActionId, ActionVocab, GameMeta } from "../types";
import { DIRECTIONS } from "./types";

export const SNAKE_META: GameMeta = {
  id: "snake",
  name: "贪吃蛇",
  tagline: "吃食物、变长，别撞墙也别咬到自己",
  decisionShape: "每一步选一个方向（不能立刻掉头）",
  selfColor: "var(--snake-head)",
  /*
   * 头部那枚标记：一个圆角方块 —— 蛇的身体就是一串圆角方块。
   * 吃豆人那枚是缺口圆（`clip-path` 挖掉一个扇区），所以这个字段必须由游戏自己给：
   * 共用外壳不该知道世界上有「吃豆人」这种形状。
   */
  glyph: "inset(14% round 34%)",
  actor: "蛇",
  place: "格子",
  /*
   * 控制条上四个玩家的悬浮说明。与吃豆人那份一样，这里不许出现别的游戏的名字。
   *
   * JEV 那句里的「提前一格」与 `DECISION_PREFETCH_STEPS` 是同一个数：刻意写成字面量
   * 而不是插值，因为本文件不 import 引擎（导航首页与路由表要 import 它，不该把引擎
   * 拖进包里）。改那个常量时记得回来改这句话。
   */
  modeHints: {
    JEV: "由 Jev 在每一步开始前作答：系统提前一格提问，迟到或非法的答案会被丢弃。",
    MANUAL: "由你用方向键驾驶，不向 Jev 发出任何请求。",
    RANDOM: "随机挑一个合法方向，作为对照基线。",
    HEURISTIC: "内置启发式规则：优先走开阔的路、其次靠近食物，作为对照基线。",
  },
};

/**
 * 手动模式的键盘映射。
 *
 * 与吃豆人相同的四个方向键，但「上」在这款游戏里意味着「向上那一格」，而不是
 * 「沿迷宫向上走」—— 键位属于这款游戏的动作空间，所以它跟着游戏走。
 */
export const SNAKE_KEY_ACTIONS: Record<string, ActionId> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
};

/**
 * 展示顺序**直接取 `DIRECTIONS`**：它同时是引擎的裁决顺序。
 *
 * 于是概率阶梯里的并列次序、动作盘的键位顺序、启发式的平局顺序三者同源 ——
 * 换一个数组会让这三处一起变，所以这不是「整理一下」。
 */
const ORDER: readonly ActionId[] = DIRECTIONS;

const LABELS: Record<string, string> = {
  UP: "上",
  DOWN: "下",
  LEFT: "左",
  RIGHT: "右",
};

export const SNAKE_VOCAB: ActionVocab = {
  order: ORDER,
  label(action) {
    // 未知动作原样显示：宁可露出一个生字符串，也不要显示成空白让人以为没有动作。
    return LABELS[action] ?? action;
  },
  slot(action) {
    return action === "UP" || action === "DOWN" || action === "LEFT" || action === "RIGHT" ? action : null;
  },
};
