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
  actor: "吃豆人",
  place: "路口",
  /*
   * 控制条上四个玩家的悬浮说明。它原来写死在控制条组件里 —— 那段文案提到「路口」，
   * 于是控制条被迫知道吃豆人。现在它是游戏自己的话。
   *
   * JEV 那句里的「三格」与 `PACMAN_DRIVER.prefetch` 是同一个数：这里刻意写成字面量
   * 而不是插值，因为本文件不 import 引擎（导航首页与路由表要 import 它，不该把引擎
   * 拖进包里）。改 `prefetch` 时记得回来改这句话。
   */
  modeHints: {
    JEV: "由 Jev 在每个路口作答：系统提前三格提问，答案合法且及时才会被采纳。",
    MANUAL: "由你用方向键驾驶，不向 Jev 发出任何请求。",
    RANDOM: "随机挑选一个合法方向，作为对照基线。",
    HEURISTIC: "内置启发式规则：优先远离危险幽灵、靠近豆子，作为对照基线。",
  },
};

/**
 * 手动模式的键盘映射：按哪个键 = 想走哪个方向。
 *
 * 放在游戏侧而不是 `lib/ui.ts`：键位到动作的映射属于这款游戏的动作空间，而 `lib/ui.ts`
 * 是共用的 —— 它不该知道世界上存在 `"UP"` 这种东西。
 */
export const PACMAN_KEY_ACTIONS: Record<string, ActionId> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
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
