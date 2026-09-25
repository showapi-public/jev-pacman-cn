"use client";

import { ArrowCounterClockwise, Bug, DownloadSimple } from "@phosphor-icons/react";
import * as React from "react";

import { ModelPicker } from "@/components/shell/ModelPicker";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Segment, Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { GameMeta, GameStatus } from "@/lib/games/types";
import type { ModelCatalogue } from "@/lib/jev/models";
import { MODE_LABELS, PLAY_MODES, SPEEDS, type PlayMode } from "@/lib/ui";

/**
 * The console's control surface.
 *
 * One rule decides what goes where: anything you touch *while watching* stays
 * on the bar (who is playing, which model answers, how fast, restart), and
 * anything you set once folds away behind 更多 (the seed, the debug overlay, the
 * export, sound and CRT). The primary action is not here at all — it lives in
 * the page header, where it is the only filled button on screen.
 *
 * The bar names no game: the four player hints come from `meta.modeHints`, and
 * the speed hint is derived from `budgetMs`, so nothing here has to be revisited
 * when a second game arrives.
 */
export interface ControlBarProps {
  /** 本游戏的展示元数据 —— 只用到 `modeHints`（四个玩家的悬浮说明）。 */
  meta: GameMeta;
  /** 1× 速度下的墙钟决策预算，毫秒。速度提示要按它算实际窗口。 */
  budgetMs: number;
  mode: PlayMode;
  speed: number;
  seed: number;
  debug: boolean;
  soundOn: boolean;
  crtOn: boolean;
  status: GameStatus;
  /** 模型目录；null = 还没拿到。 */
  catalogue: ModelCatalogue | null;
  /** 当前选中的模型条目 id；null = 服务端默认。 */
  modelId: string | null;
  onModel: (id: string) => void;
  onMode: (mode: PlayMode) => void;
  onSpeed: (speed: number) => void;
  onSeed: (seed: number) => void;
  onToggleDebug: () => void;
  onToggleSound: () => void;
  onToggleCrt: () => void;
  onRestart: () => void;
  onExport: () => void;
}

export function ControlBar(props: ControlBarProps) {
  const { meta, budgetMs, mode, speed, seed, debug, soundOn, crtOn } = props;
  const [moreOpen, setMoreOpen] = React.useState(false);
  const aiPlaying = mode !== "MANUAL";

  return (
    <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <Segmented label="玩家">
          {PLAY_MODES.map((candidate) => (
            <Segment
              key={candidate}
              pressed={mode === candidate}
              title={meta.modeHints[candidate]}
              onClick={() => props.onMode(candidate)}
            >
              {MODE_LABELS[candidate]}
            </Segment>
          ))}
        </Segmented>

        <ModelPicker
          catalogue={props.catalogue}
          value={props.modelId}
          onChange={props.onModel}
          disabled={!aiPlaying}
        />

        <Segmented label="速度">
          {SPEEDS.map((candidate) => (
            <Segment
              key={candidate}
              pressed={speed === candidate}
              /*
               * 这句话必须诚实：速度改的是游戏时钟，所以决策窗口跟着一起缩，
               * 不是「只影响推进快慢」。实际窗口 = 1× 预算 ÷ 倍率。
               */
              title={`以 ${candidate}× 运行。速度会等比压缩局面推进与决策窗口：模型实际只有约 ${Math.round(
                budgetMs / candidate,
              )} ms 作答。`}
              onClick={() => props.onSpeed(candidate)}
            >
              {candidate}×
            </Segment>
          ))}
        </Segmented>

        <Button onClick={props.onRestart} title="用当前种子和玩家重新开一局" className="gap-1.5">
          <ArrowCounterClockwise aria-hidden="true" weight="bold" className="size-3.5" />
          重新开始
        </Button>

        {/* The fold sits at the end of the row it belongs to, so opening it
            pushes the bar down instead of shifting the controls sideways. */}
        <div className="ml-auto">
          <CollapsibleTrigger label="更多" />
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-subtle bg-inset px-3 py-2.5">
          <label className="flex flex-col gap-1">
            <span className="label">种子</span>
            <input
              name="seed"
              className="h-7 w-20 rounded-md border border-line bg-black/30 px-2 num text-body text-fg hover:border-line-strong"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              title="固定幽灵的随机数，同一个种子会重放同一局。"
              value={seed}
              onChange={(event) => props.onSeed(Number(event.target.value) || 0)}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="label">机台</span>
            <div className="flex h-7 items-center gap-4">
              <Switch
                label="音效"
                checked={soundOn}
                onCheckedChange={props.onToggleSound}
                title="吃豆、能量豆、幽灵与被抓的音效，全部由代码合成，不使用音频文件。"
              />
              <Switch
                label="CRT"
                checked={crtOn}
                onCheckedChange={props.onToggleCrt}
                title="在棋盘上叠加扫描线与机壳暗角。"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="label">本局</span>
            <div className="flex h-7 items-center gap-1.5">
              <Button
                variant={debug ? "segmentedAccent" : "secondary"}
                aria-pressed={debug}
                size="sm"
                onClick={props.onToggleDebug}
                title="叠加显示格子坐标、决策点、目标与待处理请求，并在右侧多出「状态」页签。"
                className="gap-1.5"
              >
                <Bug aria-hidden="true" weight="bold" className="size-3.5" />
                调试
              </Button>
              <Button
                size="sm"
                onClick={props.onExport}
                title="把本局每一次决策导出为 JSON，包含汇总指标。"
                className="gap-1.5"
              >
                <DownloadSimple aria-hidden="true" weight="bold" className="size-3.5" />
                导出 JSON
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
