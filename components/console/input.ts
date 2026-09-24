/**
 * 右栏的唯一输入。
 *
 * 这份类型就是「模型决策可视化是游戏无关的基准」这句话的落点：把它喂给
 * `components/console/*`，里面没有一个组件需要 import 任何游戏目录。把它换成
 * 「吃豆人 + 蛇」，右栏的渲染结果除了自身色与动作词表之外完全一致。
 *
 * 与此对应的是 `GameMeta` 里的 `actor` / `place` 两个名词与 `ActionVocab`：游戏把
 * 「该怎么说」交出来，右栏只管怎么说。契约见 `docs/design-multi-game.md` §3.7。
 */

import type { ControllerSnapshot } from "@/lib/agent/controller";
import type { AgentMetrics } from "@/lib/agent/telemetry";
import type { DecisionTelemetry } from "@/lib/agent/types";
import type { ActionId, ActionVocab, GameStatus } from "@/lib/games/types";

export interface ConsoleInput {
  /** 游戏的状态。空状态文案要靠它区分「还没开始」与「这一局已经结束了」。 */
  status: GameStatus;
  /** 由全部记录算出的指标（页面算一次，四五个面板共用）。 */
  metrics: AgentMetrics;
  /**
   * 一局内的**全部**决策记录，最早在前。
   *
   * 用的是全量而不是「最近若干条」：指标、直方图与置信度曲线按它算，任何显示上限
   * 都会让它们悄悄少算。决策历史要显示多少条是它自己的事（见 `DecisionTimeline`）。
   */
  records: readonly DecisionTelemetry[];
  controller: ControllerSnapshot;
  /** 本游戏在 1× 下的墙钟决策预算；实际截止线是 `budgetMs / speed`（见 §6.5）。 */
  budgetMs: number;
  /** 当前速度倍率。它等比压缩决策窗口，所以面板必须知道。 */
  speed: number;
  /** 游戏内时长，暂停不计。调试页签要读它。 */
  playTimeMs: number;
  /** 已说成人话的最近游戏事件，最新在前。游戏自己格式化，右栏只显示。 */
  events: readonly string[];
  /** 本游戏的动作词表：标签、展示顺序与动作盘的槽位。 */
  vocab: ActionVocab;
  /** 文案里指代主体的名词（吃豆人 / 蛇）。 */
  actor: string;
  /** 文案里指代决策地点的名词（路口 / 格子）。 */
  place: string;
  /** 手动模式：动作盘是方向盘而不是检视工具。 */
  steerable: boolean;
  debug: boolean;
  onSteer(action: ActionId): void;
}

/**
 * 把一组动作按词表的展示顺序排好：`vocab.order` 里的先来（按词表次序），
 * 不在词表里的补在后面。
 *
 * 补位那半句是防御性的：词表漏了一个合法动作时，宁可多一列没有标签的，也不要
 * 因为 `order` 里没有它就把一个真实可选项从表里、从阶梯上悄悄删掉。
 */
export function orderActions(vocab: ActionVocab, actions: readonly ActionId[]): ActionId[] {
  const legal = new Set(actions);
  const ordered = vocab.order.filter((action) => legal.has(action));

  const extras: ActionId[] = [];
  for (const action of actions) {
    if (vocab.order.includes(action) || extras.includes(action)) continue;
    extras.push(action);
  }

  return [...ordered, ...extras];
}
