"use client";

import { Cookie, Crown, Footprints, Ruler, SquaresFour, Timer } from "@phosphor-icons/react";

import { Meter, MeterStrip } from "@/components/shell/MeterStrip";
import { useSnakeHighScore } from "@/components/games/snake/use-snake-high-score";
import type { SnakeState } from "@/lib/games/snake/types";
import { formatMs } from "@/lib/ui";

/**
 * 蛇这一局的六个事实，从左读到右是一件仪表。
 *
 * 外壳（六等分、标签 / 值 / 附注三级）与吃豆人共用；**装进六个格子里的东西不共用**，
 * 这里就是蛇说自己那六个的地方。
 *
 * 长度是主读数 —— 唯一一个 KPI 字号、用本局自身色（`--self`）的数。吃到食物、已走步数、
 * 存活时长是累计量；剩余空格与历史最长是这一局的处境。每个值都是等宽 + `tabular-nums`，
 * 所以每秒跳动的数不会把邻居挤动。
 *
 * 「历史最长」是本机记录（见 `use-snake-high-score.ts`），它排在最后一格：它是唯一一个
 * **跨局**的数，靠右放才不会跟这一局的读数混在一起。
 */
export function SnakeMeters({ state }: { state: SnakeState }) {
  const length = state.body.length;
  const highScore = useSnakeHighScore(length);
  const freeCells = state.board.width * state.board.height - length;

  return (
    <MeterStrip>
      <Meter label="长度" icon={<Ruler weight="fill" />} hint="蛇身当前有几节。吃到一个食物长 5 节。">
        {/* 主读数用本局自身色（外壳挂的 `--self`），光晕也跟着它走。 */}
        <span className="num text-kpi tracking-[-0.02em] text-self [text-shadow:0_0_18px_color-mix(in_oklab,var(--self)_22%,transparent)]">
          {length}
        </span>
      </Meter>

      <Meter
        label="吃到食物"
        icon={<Cookie weight="fill" />}
        hint="本局吃掉的食物的个数。吃到 5 个，蛇就比出生时长 25 节。"
      >
        <span className="num flex flex-wrap items-baseline gap-x-1 text-fg">
          {state.score}
          {state.growth > 0 ? <span className="whitespace-nowrap text-micro text-fg-3">还要长 {state.growth} 节</span> : null}
        </span>
      </Meter>

      <Meter
        label="已走步数"
        icon={<Footprints weight="fill" />}
        hint="蛇走过的格数，也就是引擎推进的步数。每一步都对应一次决策。"
      >
        <span className="num text-fg">{state.moves}</span>
      </Meter>

      <Meter label="存活时长" icon={<Timer weight="fill" />} hint="本局的游戏内时长，暂停时不计入。">
        <span className="num text-fg">{formatMs(state.playTimeMs)}</span>
      </Meter>

      <Meter
        label="剩余空格"
        icon={<SquaresFour weight="fill" />}
        hint="盘面上还能放食物的格子数。它归零就是通关 —— 蛇填满了整块盘面。"
      >
        <span className="num text-fg">{freeCells}</span>
      </Meter>

      <Meter
        label="历史最长"
        icon={<Crown weight="fill" />}
        hint="这台机器上最长的一条蛇，存在浏览器本地。每长一节就刷新一次，不需要等这一局结束。"
      >
        <span className="num text-fg-2">{highScore}</span>
      </Meter>
    </MeterStrip>
  );
}
