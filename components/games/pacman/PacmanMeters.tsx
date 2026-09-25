"use client";

import { Flag, Ghost, Heart, Timer, Trophy } from "@phosphor-icons/react";

import { Meter, MeterStrip } from "@/components/shell/MeterStrip";
import type { ControllerSnapshot } from "@/lib/agent/controller";
import type { PacmanObservation } from "@/lib/games/pacman/agent";
import type { PacmanState } from "@/lib/games/pacman/types";
import { formatMs } from "@/lib/ui";

/**
 * Pac-Man's six facts about the run, read left to right as one instrument.
 *
 * The frame — six equal registers, label / value / addendum — is shared
 * (`components/shell/MeterStrip.tsx`), along with the reasoning about why the
 * addendum is a nowrap flex item and why the separator is a gap rather than a
 * middot. What goes *in* the six registers is not shared, and this is where
 * Pac-Man says what its own six are.
 *
 * Score is the master readout — the one number at KPI size, in the run's own
 * colour (`--self`). Pellets, ghosts and survival are running totals; lives and
 * level are the run's state. Every value is mono and tabular, so numbers that
 * tick never move the strip.
 */

/** Pac-Man starts with three; the strip shows those three slots and no more. */
const LIFE_SLOTS = [0, 1, 2] as const;

export function PacmanMeters({ state, controller }: { state: PacmanState; controller: ControllerSnapshot }) {
  const lives = Math.max(0, state.lives);
  // The observation is opaque to the framework, so the one panel that reads a
  // Pac-Man-shaped field out of it does the narrowing itself.
  const observation = controller.lastObservation as PacmanObservation | null;
  const frightened = (observation?.ghosts ?? []).filter((ghost) => ghost.mode === "FRIGHTENED").length;

  return (
    <MeterStrip>
      <Meter label="得分" icon={<Trophy weight="fill" />} hint="每颗豆子、每只幽灵的累计得分。">
        {/* 主读数用本局自身色（外壳挂的 `--self`），光晕也跟着它走 —— 换游戏时这一格
            连同它的辉光一起变色，不需要改这里的任何一行。 */}
        <span className="num text-kpi tracking-[-0.02em] text-self [text-shadow:0_0_18px_color-mix(in_oklab,var(--self)_22%,transparent)]">
          {state.score.toLocaleString("zh-CN")}
        </span>
      </Meter>

      <Meter label="生命" icon={<Heart weight="fill" />} hint="剩余生命。被幽灵抓住一次用掉一条。">
        <span className="flex min-h-[1.5em] items-center gap-1.5" aria-label="生命">
          {LIFE_SLOTS.map((slot) => (
            <span
              key={slot}
              aria-hidden="true"
              className={
                slot >= lives
                  ? "size-2 shrink-0 rounded-full border border-line-strong"
                  : "size-2 shrink-0 rounded-full bg-self"
              }
            />
          ))}
          <span className="sr-only">剩余 {lives} 条命</span>
        </span>
      </Meter>

      <Meter
        label="剩余豆子"
        hint="场上还没有吃掉的豆子（含能量豆）；紧跟在后面的是本局已经吃掉的豆子数。"
      >
        <span className="num flex flex-wrap items-baseline gap-x-1 text-fg">
          {state.pellets.size + state.powerPellets.size}
          <span className="whitespace-nowrap text-micro text-fg-3">已吃 {state.pelletsEaten}</span>
        </span>
      </Meter>

      <Meter
        label="吃到幽灵"
        icon={<Ghost weight="fill" />}
        hint="吃掉能量豆后，幽灵会短暂进入受惊状态，此时可以反过来吃掉它们。"
      >
        <span className="num flex flex-wrap items-baseline gap-x-1 text-fg">
          {state.ghostsEaten}
          {frightened > 0 ? (
            <span className="whitespace-nowrap text-micro text-frightened">{frightened} 个受惊</span>
          ) : null}
        </span>
      </Meter>

      <Meter label="存活时长" icon={<Timer weight="fill" />} hint="本局的游戏内时长，暂停时不计入。">
        <span className="num text-fg">{formatMs(state.playTimeMs)}</span>
      </Meter>

      <Meter label="关卡" icon={<Flag weight="fill" />} hint="吃掉全部豆子后进入下一关，迷宫不变，豆子重置。">
        <span className="num text-fg">{state.level}</span>
      </Meter>
    </MeterStrip>
  );
}
