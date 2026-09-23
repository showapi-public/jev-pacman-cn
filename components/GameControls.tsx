"use client";

import { ArrowCounterClockwise, Bug, DownloadSimple } from "@phosphor-icons/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Segment, Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { MODE_LABELS, SPEEDS, type PlayMode, type UiSnapshot } from "@/lib/ui";

/**
 * The console's control surface.
 *
 * One rule decides what goes where: anything you touch *while watching* stays
 * on the bar (who is playing, how fast, restart), and anything you set once
 * folds away behind 更多 (the seed, the debug overlay, the export, sound and
 * CRT). The primary action is not here at all — it lives in the page header,
 * where it is the only filled button on screen.
 */

const MODE_HINTS: Record<PlayMode, string> = {
  JEV: "由 Jev 在每个路口作答：系统提前三格提问，答案合法且及时才会被采纳。",
  MANUAL: "由你用方向键驾驶，不向 Jev 发出任何请求。",
  RANDOM: "随机挑选一个合法方向，作为对照基线。",
  HEURISTIC: "内置启发式规则：优先远离危险幽灵、靠近豆子，作为对照基线。",
};

export interface GameControlsProps {
  mode: PlayMode;
  speed: number;
  seed: number;
  debug: boolean;
  soundOn: boolean;
  crtOn: boolean;
  status: UiSnapshot["status"];
  onMode: (mode: PlayMode) => void;
  onSpeed: (speed: number) => void;
  onSeed: (seed: number) => void;
  onToggleDebug: () => void;
  onToggleSound: () => void;
  onToggleCrt: () => void;
  onRestart: () => void;
  onExport: () => void;
}

export function GameControls(props: GameControlsProps) {
  const { mode, speed, seed, debug, soundOn, crtOn } = props;
  const [moreOpen, setMoreOpen] = React.useState(false);

  return (
    <Collapsible
      open={moreOpen}
      onOpenChange={setMoreOpen}
      className="flex flex-col gap-2 p-3"
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <Segmented label="玩家">
          {(Object.keys(MODE_LABELS) as PlayMode[]).map((candidate) => (
            <Segment
              key={candidate}
              pressed={mode === candidate}
              title={MODE_HINTS[candidate]}
              onClick={() => props.onMode(candidate)}
            >
              {MODE_LABELS[candidate]}
            </Segment>
          ))}
        </Segmented>

        <Segmented label="速度">
          {SPEEDS.map((candidate) => (
            <Segment
              key={candidate}
              pressed={speed === candidate}
              title={`以 ${candidate} 倍速运行。速度只影响游戏推进的快慢，不影响决策的判定时限。`}
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
                title="在迷宫上叠加扫描线与机壳暗角。"
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
                title="叠加显示格子坐标、路口、幽灵目标与待处理请求，并在右侧多出「状态」页签。"
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
