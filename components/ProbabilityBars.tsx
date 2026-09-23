"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "@phosphor-icons/react";

import type { Direction } from "@/lib/game/types";
import { DIRECTION_LABELS, formatPercent } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The probability ladder: one row per legal direction, longest bar first.
 *
 * This is the numeric half of the compass — the compass says *which way*, this
 * says *how strongly*. Rows are sorted rather than fixed in compass order, so
 * the shape of the distribution is legible at a glance; the direction names
 * keep the rows identifiable when the order changes.
 */

const GLYPH: Record<Direction, typeof ArrowUp> = {
  UP: ArrowUp,
  DOWN: ArrowDown,
  LEFT: ArrowLeft,
  RIGHT: ArrowRight,
};

export interface ProbabilityBarsProps {
  directions: readonly Direction[];
  probabilities: Partial<Record<Direction, number>>;
  /** The row Jev actually took. */
  selected: Direction | null;
  /** Selecting a row is how the candidate facts page through directions. */
  onSelect?: (direction: Direction) => void;
  className?: string;
}

export function ProbabilityBars({
  directions,
  probabilities,
  selected,
  onSelect,
  className,
}: ProbabilityBarsProps) {
  const rows = [...directions].sort((a, b) => (probabilities[b] ?? 0) - (probabilities[a] ?? 0));

  return (
    <ol className={cn("m-0 flex list-none flex-col gap-1 p-0", className)}>
      {rows.map((direction) => {
        const probability = probabilities[direction];
        const isChosen = direction === selected;
        const Glyph = GLYPH[direction];
        const width = probability === undefined ? 0 : Math.max(2, Math.round(probability * 100));

        const content = (
          <>
            <span
              className={cn(
                "flex items-center gap-1.5 num text-micro",
                isChosen ? "text-fg" : "text-fg-3",
              )}
            >
              <Glyph aria-hidden="true" weight="bold" className="size-3 shrink-0" />
              {DIRECTION_LABELS[direction]}
            </span>

            <span className="h-1.5 overflow-hidden rounded-pill bg-white/[0.06]">
              <span
                className={cn(
                  "block h-full rounded-pill transition-[width,background-color] duration-[var(--dur)] ease-swift",
                  isChosen ? "bg-pacman" : "bg-fg-4",
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
          <li key={direction}>
            {onSelect ? (
              <button
                type="button"
                aria-pressed={isChosen}
                aria-label={`查看向${DIRECTION_LABELS[direction]}的候选${
                  probability === undefined ? "" : `，该方向占比 ${formatPercent(probability)}`
                }`}
                title={`查看向${DIRECTION_LABELS[direction]}的候选分析`}
                onClick={() => onSelect(direction)}
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
