"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "@phosphor-icons/react";
import * as React from "react";

import type { Direction } from "@/lib/game/types";
import { DIRECTION_LABELS, formatPercent, type Tone } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The direction compass: what Jev was asked, and what it chose.
 *
 * Four keys in the cross Pac-Man actually turns on. Three states, read at a
 * glance and never by colour alone:
 *
 *   - not walkable  — a bare, dim arrow with no key under it
 *   - walkable      — a raised key with a live arrow
 *   - chosen        — the one key painted in Pac-Man amber (or amber-warn when
 *                     the move came from the fallback rather than from Jev)
 *
 * The key body carries the probability as a hairline at its foot, so the shape
 * of the decision is visible without reading a single number; the numbers
 * themselves live in the bar list beside it.
 */

const GLYPH: Record<Direction, typeof ArrowUp> = {
  UP: ArrowUp,
  DOWN: ArrowDown,
  LEFT: ArrowLeft,
  RIGHT: ArrowRight,
};

/** Degrees clockwise from "up", for the heading needle in the middle. */
const HEADING_ANGLE: Record<Direction, number> = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 };

/** Clockwise from the top, the order a reader scans a compass in. */
const COMPASS_ORDER: readonly Direction[] = ["UP", "RIGHT", "DOWN", "LEFT"];

const SLOT: Record<Direction, string> = {
  UP: "col-start-2 row-start-1",
  LEFT: "col-start-1 row-start-2",
  RIGHT: "col-start-3 row-start-2",
  DOWN: "col-start-2 row-start-3",
};

export interface DirectionCompassProps {
  /** What Pac-Man may legally do at the junction. */
  legalDirections: readonly Direction[];
  /** Jev's answer (or the applied direction while a record is still settling). */
  selected: Direction | null;
  /** Where Pac-Man is pointing right now. */
  heading: Direction | null;
  /** `FALLBACK` repaints the chosen key in warning amber: this was not Jev. */
  source: string | null;
  /** True while the request is genuinely in flight — the centre pulses. */
  asking?: boolean;
  probabilities?: Partial<Record<Direction, number>>;
  /** Given a handler the keys become buttons; without one the compass is a picture. */
  onPick?: (direction: Direction) => void;
  /**
   * What pressing a key actually does, because it is not the same thing in both
   * modes: in manual play it steers Pac-Man, and everywhere else it only selects
   * that direction for inspection — the ladder and the facts table follow it.
   * Labelling an inspect-only key "向…转向" promises a move that never happens.
   */
  pickAction?: "steer" | "inspect";
}

export function DirectionCompass({
  legalDirections,
  selected,
  heading,
  source,
  asking = false,
  probabilities = {},
  onPick,
  pickAction = "inspect",
}: DirectionCompassProps) {
  const interactive = typeof onPick === "function";
  const chosenTone: Tone = source === "FALLBACK" ? "busy" : "accent";
  const label = compassLabel({ legalDirections, selected, source });

  return (
    <div
      role={interactive ? "group" : "img"}
      aria-label={label}
      className="grid shrink-0 grid-cols-[repeat(3,var(--key))] grid-rows-[repeat(3,var(--key))] gap-1.5 [--key:52px]"
    >
      {COMPASS_ORDER.map((direction) => {
        const walkable = legalDirections.includes(direction);
        const chosen = walkable && direction === selected;
        const probability = probabilities[direction];
        const Glyph = GLYPH[direction];

        const shared = cn(
          "relative grid place-items-center rounded-lg border",
          "transition-[background-color,border-color,color] duration-[var(--dur)] ease-swift",
          !walkable &&
            "cursor-default border-transparent text-fg-4 opacity-35",
          walkable &&
            !chosen &&
            "border-line bg-elevated text-fg-2",
          chosen &&
            chosenTone === "busy" &&
            "border-warn bg-warn-soft text-warn",
          chosen && chosenTone === "accent" && "border-pacman bg-pacman/15 text-pacman",
          walkable &&
            !chosen &&
            interactive &&
            "hover:border-line-strong hover:bg-hover hover:text-fg",
        );

        const body = (
          <>
            <Glyph aria-hidden="true" weight={chosen ? "bold" : "regular"} className="size-5" />
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
            <span key={direction} className={cn(shared, SLOT[direction])}>
              {body}
            </span>
          );
        }

        return (
          <button
            key={direction}
            type="button"
            // A direction Pac-Man cannot take is not a disabled control, it is a
            // fact about the maze: render it inert rather than focusable.
            disabled={!walkable}
            aria-pressed={chosen}
            aria-label={
              walkable
                ? `${
                    pickAction === "steer" ? `向${DIRECTION_LABELS[direction]}转向` : `查看向${DIRECTION_LABELS[direction]}的候选`
                  }${probability === undefined ? "" : `，该方向占比 ${formatPercent(probability)}`}`
                : `向${DIRECTION_LABELS[direction]}不可通行`
            }
            title={walkable ? (pickAction === "steer" ? `向${DIRECTION_LABELS[direction]}转向` : `查看向${DIRECTION_LABELS[direction]}的候选分析`) : undefined}
            onClick={walkable ? () => onPick(direction) : undefined}
            className={cn(shared, SLOT[direction])}
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
        {heading ? (
          <span
            className="absolute size-[24px]"
            style={{ transform: `rotate(${HEADING_ANGLE[heading]}deg)` }}
          >
            <span className="absolute top-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 rounded-pill bg-fg-2" />
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** One sentence a screen reader can read in place of the cross. */
function compassLabel({
  legalDirections,
  selected,
  source,
}: Pick<DirectionCompassProps, "legalDirections" | "selected" | "source">): string {
  const walkable = legalDirections.map((direction) => DIRECTION_LABELS[direction]).join("、");
  const parts: string[] = [];

  if (selected) {
    parts.push(
      source === "FALLBACK"
        ? `Jev 未能及时作答，兜底选择了「${DIRECTION_LABELS[selected]}」`
        : `Jev 选择了「${DIRECTION_LABELS[selected]}」`,
    );
  } else {
    parts.push("尚未作出选择");
  }
  parts.push(walkable ? `可通行方向：${walkable}` : "此处没有可通行方向");

  return parts.join("。");
}
