"use client";

import { Flag, Ghost, Heart, Timer, Trophy } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import type { UiSnapshot } from "@/lib/ui";
import { formatMs } from "@/lib/ui";

/**
 * The game meter strip: six facts about the run, read left to right as one
 * instrument.
 *
 * Score is the master readout — the one number at KPI size, in Pac-Man's own
 * amber. Pellets, ghosts and survival are running totals; lives and level are
 * the run's state. Every value is mono and tabular, so numbers that tick never
 * move the strip, and nothing here needs an explanation longer than a tooltip.
 */

/** Pac-Man starts with three; the strip shows those three slots and no more. */
const LIFE_SLOTS = [0, 1, 2] as const;

export function GameMeters({ ui }: { ui: UiSnapshot }) {
  const lives = Math.max(0, ui.lives);
  const ghosts = ui.controller.lastObservation?.ghosts ?? [];
  const frightened = ghosts.filter((ghost) => ghost.mode === "FRIGHTENED").length;

  return (
    <dl className="m-0 grid shrink-0 grid-cols-6 border-t border-subtle">
      <Meter label="得分" icon={<Trophy weight="fill" />} hint="每颗豆子、每只幽灵的累计得分。">
        <span className="num text-kpi tracking-[-0.02em] text-pacman [text-shadow:0_0_18px_rgba(255,210,63,0.22)]">
          {ui.score.toLocaleString("zh-CN")}
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
                  : "size-2 shrink-0 rounded-full bg-pacman"
              }
            />
          ))}
          <span className="sr-only">剩余 {lives} 条命</span>
        </span>
      </Meter>

      <Meter
        label="剩余豆子"
        hint="场上还没有吃掉的豆子（含能量豆）。括号内是本局已吃掉的豆子数。"
      >
        <span className="num text-fg">
          {ui.pelletsRemaining + ui.powerPelletsRemaining}
          <span className="text-body text-fg-3"> · 已吃 {ui.pelletsEaten}</span>
        </span>
      </Meter>

      <Meter
        label="吃到幽灵"
        icon={<Ghost weight="fill" />}
        hint="吃掉能量豆后，幽灵会短暂进入受惊状态，此时可以反过来吃掉它们。"
      >
        <span className="num text-fg">
          {ui.ghostsEaten}
          {frightened > 0 ? (
            <span className="text-body text-frightened"> · {frightened} 个受惊</span>
          ) : null}
        </span>
      </Meter>

      <Meter label="存活时长" icon={<Timer weight="fill" />} hint="本局的游戏内时长，暂停时不计入。">
        <span className="num text-fg">{formatMs(ui.playTimeMs)}</span>
      </Meter>

      <Meter label="关卡" icon={<Flag weight="fill" />} hint="吃掉全部豆子后进入下一关，迷宫不变，豆子重置。">
        <span className="num text-fg">{ui.level}</span>
      </Meter>
    </dl>
  );
}

interface MeterProps {
  label: string;
  /** A 11px glyph that speeds up scanning; decorative, so hidden from AT. */
  icon?: ReactNode;
  hint: string;
  children: ReactNode;
}

/** One lane of the strip: a labelled value with the explanation on hover. */
function Meter({ label, icon, hint, children }: MeterProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-l border-divider px-3 py-2 first:border-l-0">
      <Tooltip content={hint}>
        <dt className="label flex cursor-help items-center gap-1">
          {icon ? (
            <span aria-hidden="true" className="text-fg-4 [&>svg]:size-3">
              {icon}
            </span>
          ) : null}
          {label}
        </dt>
      </Tooltip>
      <dd className="m-0 text-title leading-tight">{children}</dd>
    </div>
  );
}
