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
  const playLabel = running ? "Pause" : status === "PAUSED" ? "Resume" : "Start";

  return (
    <div className="controls-row">
      <div className="controls-group">
        <span className="label" aria-hidden="true">
          Play
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
          <button type="button" className="btn" onClick={props.onRestart} title="Restart from the seed">
            Restart
          </button>
        </div>
      </div>

      <div className="controls-group" role="group" aria-label="Player">
        <span className="label" id="player-label">
          Player
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

      <div className="controls-group" role="group" aria-label="Speed">
        <span className="label" id="speed-label">
          Speed
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
          Seed
        </label>
        <input
          id="seed-input"
          name="seed"
          className="seed-input"
          type="number"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          title="Fixes the ghost RNG, so the same seed replays the same game"
          value={seed}
          onChange={(event) => props.onSeed(Number(event.target.value) || 0)}
        />
      </div>

      <div className="controls-group" role="group" aria-label="Session">
        <span className="label" id="session-label">
          Session
        </span>
        <div className="segmented" aria-labelledby="session-label">
          <button
            type="button"
            className="btn"
            aria-pressed={debug}
            onClick={props.onToggleDebug}
            title="Overlay tile coordinates, junctions, ghost targets and the pending request"
          >
            Debug
          </button>
          <button
            type="button"
            className="btn"
            onClick={props.onExport}
            title="Download every decision of this session as JSON"
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="controls-group" role="group" aria-label="Cabinet">
        <span className="label" id="cabinet-label">
          Cabinet
        </span>
        <div className="switch-row" aria-labelledby="cabinet-label">
          <button
            type="button"
            role="switch"
            aria-checked={soundOn}
            className="switch"
            onClick={props.onToggleSound}
            title="Chomp, power pellet, ghost and death sounds — synthesized here, no audio files"
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            Sound
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={crtOn}
            className="switch"
            onClick={props.onToggleCrt}
            title="Scanlines and a bezel shadow over the maze"
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
