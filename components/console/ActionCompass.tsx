"use client";

import * as React from "react";

import { ActionGlyph, SLOT_ANGLE, type SlotId } from "@/components/console/ActionGlyph";
import type { ActionId, ActionVocab } from "@/lib/games/types";
import { formatPercent, type Tone } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * 动作盘：模型被问了什么，以及它选了什么。
 *
 * 把「选了哪个动作」这个最核心的输出**只用一个形状表达**，而不是一句散文。
 * 四种状态，一眼可读，而且从不只靠颜色：
 *
 *   - 走不通 —— 一个暗淡的箭头，下面没有键（也不可聚焦：那不是可用的控件，
 *                而是这个局面的一条事实）
 *   - 可通行 —— 一把抬起的键，箭头是亮的
 *   - 已选中 —— 唯一一把用**本局自身色**（`--self`）画的键，箭头加粗，底部一条概率细条
 *   - 兜底    —— 选中的那把改画警示黄：这一步不是模型选的
 *
 * 它不知道任何游戏：槽位与标签都来自 `ActionVocab`，图标来自 `ActionGlyph`，
 * 自身色来自外壳挂的 `--self`。换游戏只换这三样。
 */

const SLOT_CLASS: Record<SlotId, string> = {
  UP: "col-start-2 row-start-1",
  LEFT: "col-start-1 row-start-2",
  RIGHT: "col-start-3 row-start-2",
  DOWN: "col-start-2 row-start-3",
};

export interface ActionCompassProps {
  vocab: ActionVocab;
  /** 这一问的合法动作。 */
  actions: readonly ActionId[];
  /** 模型的答案（或记录尚未落地时已经采纳的那个动作）。 */
  selected: ActionId | null;
  /** 主体此刻的朝向，只给中心的针用。 */
  facing: ActionId | null;
  /** `FALLBACK` 会把选中的那把键画成警示黄：这不是模型选的。 */
  source: string | null;
  /** 真有一次提问在途：中心缓慢呼吸。 */
  asking?: boolean;
  probabilities?: Partial<Record<ActionId, number>>;
  /** 给了处理器，这些键就是按钮；没给，整个动作盘是一张图。 */
  onPick?: (action: ActionId) => void;
  /**
   * 按下键究竟会发生什么，两种模式下不一样：手动模式是转向，其它模式下只是
   * 选中它供检视（阶梯与事实表跟着走）。把只用于检视的键标成「向…转向」，
   * 是在承诺一个永远不会发生的动作。
   */
  pickAction?: "steer" | "inspect";
}

export function ActionCompass({
  vocab,
  actions,
  selected,
  facing,
  source,
  asking = false,
  probabilities = {},
  onPick,
  pickAction = "inspect",
}: ActionCompassProps) {
  const interactive = typeof onPick === "function";
  const chosenTone: Tone = source === "FALLBACK" ? "busy" : "accent";
  const label = compassLabel({ vocab, actions, selected, source });

  /*
   * 十字上永远是**词表里所有占槽位的动作**，不是只有合法的那些：走不通的那一格
   * 必须还在（暗淡、没有键），否则一个三岔路口的「十字」会缺一角，而那正是这张图
   * 要表达的信息。补上 `actions` 里词表没列出的动作是防御性的 —— 漏掉一个合法动作
   * 比多出一格严重得多。
   */
  const keys: { action: ActionId; slot: SlotId }[] = [];
  for (const action of [...vocab.order, ...actions]) {
    if (keys.some((key) => key.action === action)) continue;
    const slot = vocab.slot(action);
    if (slot === null) continue;
    keys.push({ action, slot });
  }

  const facingSlot = facing === null ? null : vocab.slot(facing);

  return (
    <div
      role={interactive ? "group" : "img"}
      aria-label={label}
      className="grid shrink-0 grid-cols-[repeat(3,var(--key))] grid-rows-[repeat(3,var(--key))] gap-1.5 [--key:52px]"
    >
      {keys.map(({ action, slot }) => {
        const walkable = actions.includes(action);
        const chosen = walkable && action === selected;
        const probability = probabilities[action];

        const shared = cn(
          "relative grid place-items-center rounded-lg border",
          "transition-[background-color,border-color,color] duration-[var(--dur)] ease-swift",
          !walkable && "cursor-default border-transparent text-fg-4 opacity-35",
          walkable && !chosen && "border-line bg-elevated text-fg-2",
          chosen && chosenTone === "busy" && "border-warn bg-warn-soft text-warn",
          chosen && chosenTone === "accent" && "border-self bg-self/15 text-self",
          walkable && !chosen && interactive && "hover:border-line-strong hover:bg-hover hover:text-fg",
        );

        const body = (
          <>
            <ActionGlyph
              vocab={vocab}
              action={action}
              weight={chosen ? "bold" : "regular"}
              className="size-5"
            />
            {walkable && probability !== undefined ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-1.5 bottom-1.5 h-[3px] overflow-hidden rounded-pill bg-white/10"
              >
                <span
                  className="block h-full rounded-pill bg-current transition-[width] duration-[var(--dur)] ease-swift"
                  style={{ width: `${Math.max(3, Math.round(probability * 100))}%` }}
                />
              </span>
            ) : null}
          </>
        );

        if (!interactive) {
          return (
            <span key={action} className={cn(shared, SLOT_CLASS[slot])}>
              {body}
            </span>
          );
        }

        return (
          <button
            key={action}
            type="button"
            // 走不通的键不是「禁用控件」，而是关于这个局面的一条事实：渲染成
            // 惰性的，而不是让它进 Tab 序列。
            disabled={!walkable}
            aria-pressed={chosen}
            aria-label={
              walkable
                ? `${pickAction === "steer" ? `转向${vocab.label(action)}` : `查看「${vocab.label(action)}」的候选`}${
                    probability === undefined ? "" : `，该动作占比 ${formatPercent(probability)}`
                  }`
                : `「${vocab.label(action)}」不可通行`
            }
            title={
              walkable
                ? pickAction === "steer"
                  ? `转向${vocab.label(action)}`
                  : `查看「${vocab.label(action)}」的候选事实`
                : undefined
            }
            onClick={walkable ? () => onPick(action) : undefined}
            className={cn(shared, SLOT_CLASS[slot])}
          >
            {body}
          </button>
        );
      })}

      <span
        aria-hidden="true"
        className={cn(
          "relative col-start-2 row-start-2 grid place-items-center",
          asking && "animate-[pulse-soft_1.6s_ease-in-out_infinite]",
        )}
      >
        <span className="size-2 rounded-full bg-fg-4" />
        {facingSlot === null ? null : (
          <span
            className="absolute size-[24px]"
            style={{ transform: `rotate(${SLOT_ANGLE[facingSlot]}deg)` }}
          >
            <span className="absolute top-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 rounded-pill bg-fg-2" />
          </span>
        )}
      </span>
    </div>
  );
}

/** 一句话，代替整个十字给屏幕阅读器读。 */
function compassLabel({
  vocab,
  actions,
  selected,
  source,
}: Pick<ActionCompassProps, "vocab" | "actions" | "selected" | "source">): string {
  const parts: string[] = [];

  if (selected === null) {
    parts.push("尚未作出选择");
  } else if (source === "FALLBACK") {
    parts.push(`模型未能及时作答，兜底选择了「${vocab.label(selected)}」`);
  } else {
    parts.push(`模型选择了「${vocab.label(selected)}」`);
  }

  const legal = actions.map((action) => vocab.label(action)).join("、");
  parts.push(legal ? `可选动作：${legal}` : "此处没有可选动作");

  return parts.join("。");
}
