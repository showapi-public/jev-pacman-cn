"use client";

import { MODE_LABELS, SPEEDS, type PlayMode, type UiSnapshot } from "@/lib/ui";

export interface ControlsProps {
  mode: PlayMode;
  speed: number;
  seed: number;
  debug: boolean;
  status: UiSnapshot["status"];
  onMode: (mode: PlayMode) => void;
  onSpeed: (speed: number) => void;
  onSeed: (seed: number) => void;
  onToggleDebug: () => void;
  onStartPause: () => void;
  onRestart: () => void;
  onExport: () => void;
}

export function Controls(props: ControlsProps) {
  const { mode, speed, seed, debug, status } = props;
  const running = status === "PLAYING";
  const canStart = status === "READY" || status === "PAUSED";

  return (
    <div className="controls-row">
      <div className="controls-group">
        <button
          type="button"
          className="btn primary"
          onClick={props.onStartPause}
          disabled={status === "GAME_OVER"}
        >
          {running ? "Pause" : canStart ? (status === "PAUSED" ? "Resume" : "Start") : "Start"}
        </button>
        <button type="button" className="btn" onClick={props.onRestart}>
          Restart
        </button>
      </div>

      <div className="controls-group">
        <span className="label">Player</span>
        <div className="segmented">
          {(Object.keys(MODE_LABELS) as PlayMode[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              data-active={mode === candidate}
              onClick={() => props.onMode(candidate)}
            >
              {MODE_LABELS[candidate]}
            </button>
          ))}
        </div>
      </div>

      <div className="controls-group">
        <span className="label">Speed</span>
        <div className="segmented">
          {SPEEDS.map((candidate) => (
            <button key={candidate} type="button" data-active={speed === candidate} onClick={() => props.onSpeed(candidate)}>
              {candidate}×
            </button>
          ))}
        </div>
      </div>

      <div className="controls-group">
        <span className="label">Seed</span>
        <input
          className="value"
          style={{
            width: 68,
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text)",
            padding: "6px 8px",
          }}
          type="number"
          value={seed}
          onChange={(event) => props.onSeed(Number(event.target.value) || 0)}
        />
      </div>

      <div className="controls-group">
        <button type="button" className="btn" data-active={debug} onClick={props.onToggleDebug}>
          {debug ? "Debug on" : "Debug"}
        </button>
        <button type="button" className="btn" onClick={props.onExport}>
          Export JSON
        </button>
      </div>
    </div>
  );
}
