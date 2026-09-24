"use client";

import { ActionGlyph } from "@/components/console/ActionGlyph";
import { orderActions } from "@/components/console/input";
import type { ActionId, ActionVocab } from "@/lib/games/types";
import { formatPercent } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * 概率阶梯：一行一个合法动作，最长的条在最上面。
 *
 * 它是动作盘的数值一半 —— 动作盘说*哪个方向*，它说*有多确定*。行是排序过的而不是
 * 固定在动作盘次序上，这样分布的形状一眼就看得出来；文本标签保证次序变了也认得出
 * 是哪一行。
 *
 * 语言全部来自 `ActionVocab`：排序并列时按 `order`，标签取 `label()`，图标取
 * `slot()`。被选中的那一行用**本局自身色**（`--self`）的条与字。
 */

export interface ProbabilityBarsProps {
  vocab: ActionVocab;
  actions: readonly ActionId[];
  probabilities: Partial<Record<ActionId, number>>;
  /** 模型实际走过的那个动作。 */
  selected: ActionId | null;
  /** 选中一行即翻动动作盘与「推理输入」表的高亮列。 */
  onSelect?: (action: ActionId) => void;
  className?: string;
}

export function ProbabilityBars({
  vocab,
  actions,
  probabilities,
  selected,
  onSelect,
  className,
}: ProbabilityBarsProps) {
  // 先按词表排好，再按概率降序：`sort` 是稳定的，所以并列时留下的正是词表次序。
  const rows = orderActions(vocab, actions).sort(
    (a, b) => (probabilities[b] ?? 0) - (probabilities[a] ?? 0),
  );

  return (
    <ol className={cn("m-0 flex list-none flex-col gap-1 p-0", className)}>
      {rows.map((action) => {
        const probability = probabilities[action];
        const isChosen = action === selected;
        const label = vocab.label(action);
        const width = probability === undefined ? 0 : Math.max(2, Math.round(probability * 100));

        const content = (
          <>
            <span
              className={cn(
                "flex items-center gap-1.5 num text-micro",
                isChosen ? "text-self" : "text-fg-3",
              )}
            >
              <ActionGlyph vocab={vocab} action={action} className="size-3 shrink-0" />
              {label}
            </span>

            <span className="h-1.5 overflow-hidden rounded-pill bg-white/[0.06]">
              <span
                className={cn(
                  "block h-full rounded-pill transition-[width,background-color] duration-[var(--dur)] ease-swift",
                  isChosen ? "bg-self" : "bg-fg-4",
                )}
                style={{ width: `${width}%` }}
              />
            </span>

            <span
              className={cn(
                "num text-right text-micro",
                isChosen ? "text-fg" : "text-fg-3",
              )}
            >
              {probability === undefined ? "—" : formatPercent(probability)}
            </span>
          </>
        );

        const grid = "grid grid-cols-[46px_minmax(48px,1fr)_34px] items-center gap-2.5";

        return (
          <li key={action}>
            {onSelect ? (
              <button
                type="button"
                aria-pressed={isChosen}
                aria-label={`查看「${label}」的候选${
                  probability === undefined ? "" : `，该动作占比 ${formatPercent(probability)}`
                }`}
                title={`查看「${label}」的候选事实`}
                onClick={() => onSelect(action)}
                className={cn(
                  grid,
                  "w-full rounded-sm px-1.5 py-1 text-left transition-colors duration-[var(--dur-fast)] ease-swift hover:bg-hover",
                  isChosen && "bg-active",
                )}
              >
                {content}
              </button>
            ) : (
              <span className={cn(grid, "px-1.5 py-1")}>{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
