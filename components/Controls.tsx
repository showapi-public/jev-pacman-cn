"use client";

import { MODE_LABELS, SPEEDS, type PlayMode, type UiSnapshot } from "@/lib/ui";

export interface ControlsProps {
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
  onStartPause: () => void;
  onRestart: () => void;
  onExport: () => void;
}

/**
 * The control surface. One primary action (Play/Pause), everything else is a
 * secondary toggle — so the eye lands on the button that starts the demo.
 */
export function Controls(props: ControlsProps) {
  const { mode, speed, seed, debug, soundOn, crtOn, status } = props;
  const running = status === "PLAYING";
  const playLabel = running ? "暂停" : status === "PAUSED" ? "继续" : "开始";

  return (
    <div className="controls-row">
      <div className="controls-group">
        <span className="label" aria-hidden="true">
          对局
        </span>
        <div className="segmented">
          <button
            type="button"
            className="btn"
            data-variant="primary"
            onClick={props.onStartPause}
            disabled={status === "GAME_OVER"}
          >
            {playLabel}
          </button>
          <button type="button" className="btn" onClick={props.onRestart} title="按当前种子重新开始">
            重新开始
          </button>
        </div>
      </div>

      <div className="controls-group" role="group" aria-label="玩家">
        <span className="label" id="player-label">
          玩家
        </span>
        <div className="segmented" aria-labelledby="player-label">
          {(Object.keys(MODE_LABELS) as PlayMode[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              className="btn"
              aria-pressed={mode === candidate}
              onClick={() => props.onMode(candidate)}
            >
              {MODE_LABELS[candidate]}
            </button>
          ))}
        </div>
      </div>

      <div className="controls-group" role="group" aria-label="速度">
        <span className="label" id="speed-label">
          速度
        </span>
        <div className="segmented" aria-labelledby="speed-label">
          {SPEEDS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className="btn"
              aria-pressed={speed === candidate}
              onClick={() => props.onSpeed(candidate)}
            >
              {candidate}×
            </button>
          ))}
        </div>
      </div>

      <div className="controls-group">
        <label className="label" htmlFor="seed-input">
          种子
        </label>
        <input
          id="seed-input"
          name="seed"
          className="seed-input"
          type="number"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          title="固定幽灵的随机数种子，相同种子会重放同一局游戏"
          value={seed}
          onChange={(event) => props.onSeed(Number(event.target.value) || 0)}
        />
      </div>

      <div className="controls-group" role="group" aria-label="本局">
        <span className="label" id="session-label">
          本局
        </span>
        <div className="segmented" aria-labelledby="session-label">
          <button
            type="button"
            className="btn"
            aria-pressed={debug}
            onClick={props.onToggleDebug}
            title="叠加显示格子坐标、路口、幽灵目标与待处理请求"
          >
            调试
          </button>
          <button
            type="button"
            className="btn"
            onClick={props.onExport}
            title="把本局的每一次决策导出为 JSON"
          >
            导出 JSON
          </button>
        </div>
      </div>

      <div className="controls-group" role="group" aria-label="机台">
        <span className="label" id="cabinet-label">
          机台
        </span>
        <div className="switch-row" aria-labelledby="cabinet-label">
          <button
            type="button"
            role="switch"
            aria-checked={soundOn}
            className="switch"
            onClick={props.onToggleSound}
            title="吃豆、能量豆、幽灵与被抓的音效——由代码合成，不使用音频文件"
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            音效
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={crtOn}
            className="switch"
            onClick={props.onToggleCrt}
            title="在迷宫上叠加扫描线与机壳阴影"
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            CRT
          </button>
        </div>
      </div>
    </div>
  );
}
